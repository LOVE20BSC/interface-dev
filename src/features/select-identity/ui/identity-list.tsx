import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, RefreshCw } from '@/shared/ui/icons';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { copy } from '@/shared/config/copy-pages';
import { UNKNOWN } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import {
  captureFlipPositions,
  playFlip,
  pulseFlipHighlight,
  type FlipElement,
  type FlipPlayback,
  type FlipPosition,
} from '@/shared/lib/flip';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { Badge } from '@/shared/ui/badge';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { CopyableAddress } from '@/shared/ui/copyable-address';
import { Skeleton } from '@/shared/ui/skeleton';
import type { MemberIdentity } from '@/entities/member-identity/model/use-member-identities';
import type { MemberIdentityState } from '@/entities/member-identity/model/use-member-identity';
const TransferIdentityLayer = lazy(async () => {
  const module = await import('@/features/transfer-identity/ui/transfer-identity-layer');
  return { default: module.TransferIdentityLayer };
});

/** Handoff from a mint receipt: the row it should highlight after arriving. */
export interface JustMintedIdentity {
  readonly tokenId: bigint;
  readonly name: string;
}

export interface IdentityListProps {
  readonly identity: MemberIdentityState;
  readonly onRetry: () => void;
  /** Just minted on /mint: highlight this row until the user leaves the page. */
  readonly justMinted?: JustMintedIdentity | null;
}

function SummarySkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <SummarySkeleton />
      <Skeleton className="h-[92px] w-full rounded-2xl" />
      <Skeleton className="h-[92px] w-full rounded-2xl" />
      <Skeleton className="h-[92px] w-full rounded-2xl" />
    </div>
  );
}

function InvalidatedNotice() {
  return (
    <p className="mb-3 rounded-xl border border-line bg-elevated px-3 py-2 text-xs leading-5 text-muted">
      {copy.home.identityInvalidated}
    </p>
  );
}

/** A card move that has been measured but not animated yet. */
interface PendingMove {
  readonly tokenId: bigint;
  /** 'First' measurements, taken in the click handler before React commits. */
  readonly positions: readonly FlipPosition[];
  readonly mode: 'cards' | 'table';
}

/** The bottom tab bar / tests never resize across the md breakpoint mid-tap. */
function isCardListLaidOut(list: HTMLUListElement | null): boolean {
  return (list?.getBoundingClientRect().height ?? 0) > 0;
}

export function IdentityList({ identity, onRetry, justMinted = null }: IdentityListProps) {
  const { address: account } = useAccount();
  // Same media query the page-level transition honours; jsdom defaults to false.
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [target, setTarget] = useState<MemberIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  // owner 2026-11-17: 使用此身份 NFT 现在是「被点的卡片移动到列表最顶部」，不再是整页
  // 淡出淡入。这个 tokenId 同时是忙碌态（按钮 aria-busy/「切换中…」）和「列表先别换成
  // 骨架屏」的持有标记，直到移动结束且 ownerOf() 确认了新身份。
  const [pendingTokenId, setPendingTokenId] = useState<bigint | null>(null);
  const [successRecipient, setSuccessRecipient] = useState<`0x${string}` | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const pendingMoveRef = useRef<PendingMove | null>(null);
  const playbackRef = useRef<FlipPlayback | null>(null);
  // Bumped when a move settles so the release effect below runs again.
  const [moveGeneration, setMoveGeneration] = useState(0);

  const handleConfirmed = (memberId: bigint, to: `0x${string}`) => {
    if (identity.selected?.tokenId === memberId) identity.clear();
    identity.refetch();
    setSuccessRecipient(to);
    setTarget(null);
    setBusy(false);
  };

  /**
   * The mobile `<ul>` and the desktop `<table>` both exist in the DOM; the keys
   * are namespaced so a measurement never mixes the two breakpoints.
   */
  const collectCardEntries = (): FlipElement[] => {
    const entries: FlipElement[] = [];
    for (const node of Array.from(listRef.current?.children ?? [])) {
      const tokenId = node.getAttribute('data-identity-id');
      if (tokenId !== null) entries.push({ key: `li:${tokenId}`, element: node });
    }
    return entries;
  };

  const collectRowEntries = (): FlipElement[] => {
    const entries: FlipElement[] = [];
    const rows = tableRef.current?.tBodies[0]?.rows;
    for (const row of Array.from(rows ?? [])) {
      const tokenId = row.getAttribute('data-identity-id');
      if (tokenId !== null) entries.push({ key: `tr:${tokenId}`, element: row });
    }
    return entries;
  };

  /**
   * owner 2026-11-17: 选择身份 NFT 不再整页淡出淡入（`useSoftTransition().run()`），
   * 改为让被点的卡片从当前位置平滑移动到列表最顶部（排序本来就把当前身份排第一）。
   * 卡片移动本身就是「已切到这个身份」的信号，页面其它元素同步更新即可。
   *
   * 移动用 FLIP：这里先量「First」并记下 tokenId，`identity.select()` 提交重排后的
   * DOM 由下面的 useLayoutEffect 量「Last」并在首帧绘制前播放动画。
   * `prefers-reduced-motion: reduce` 时直接落位（不记录，也不播放）。
   */
  const handleUse = (tokenId: bigint) => {
    // 移动/确认还没结束：忽略重复点击（忙碌态按钮另有 aria-busy）。
    if (pendingTokenId !== null) return;
    const mode = isCardListLaidOut(listRef.current) ? 'cards' : 'table';
    const positions =
      mode === 'cards' && reducedMotion !== true ? captureFlipPositions(collectCardEntries()) : [];
    pendingMoveRef.current = { tokenId, positions, mode };
    setPendingTokenId(tokenId);
    identity.select(tokenId);
  };

  /**
   * Plays the measured move. `useLayoutEffect` runs after the reordered list is in
   * the DOM but before the browser paints, so the inverted transform is what the
   * first frame shows — no flash of the card at its new place.
   */
  useLayoutEffect(() => {
    const pending = pendingMoveRef.current;
    if (pending === null) return;
    pendingMoveRef.current = null;
    const tokenId = pending.tokenId.toString();
    const playback =
      pending.mode === 'cards'
        ? playFlip(pending.positions, collectCardEntries(), {
            reducedMotion,
            emphasisKeys: [`li:${tokenId}`],
          })
        : playFlip([], [], { reducedMotion });
    // 桌面表格行：跨浏览器的 row transform 不可靠，退化为「即时置顶 + 高亮」——行立刻
    // 落位，用一次柔和的高亮脉冲说明它去了哪里，表格布局不动。
    // 卡片用 halo（卡片自己的 transition-colors 已经在做底色渐变），行用 tint。
    const highlight =
      pending.mode === 'cards'
        ? collectCardEntries().find((entry) => entry.key === `li:${tokenId}`)?.element
        : collectRowEntries().find((entry) => entry.key === `tr:${tokenId}`)?.element;
    if (highlight !== undefined) {
      pulseFlipHighlight(highlight, {
        reducedMotion,
        kind: pending.mode === 'cards' ? 'halo' : 'tint',
      });
    }
    if (playback.animations.length === 0) return;
    playbackRef.current = playback;
    void playback.settled.then(() => {
      playbackRef.current = null;
      setMoveGeneration((generation) => generation + 1);
    });
  });

  // Cancel a running move (and its temporary inline styles) on unmount.
  useEffect(() => () => playbackRef.current?.cancel(), []);

  // 忙碌态持有到「移动结束 + ownerOf() 确认新身份」都落地为止：过早释放会在慢 RPC 上
  // 让列表在移动途中或刚落位时换成骨架屏。
  useEffect(() => {
    if (pendingTokenId === null) return;
    if (identity.status === 'loading') return;
    if (playbackRef.current !== null) return;
    setPendingTokenId(null);
  }, [identity.status, moveGeneration, pendingTokenId]);

  const count = identity.balance !== undefined ? identity.balance.toString() : UNKNOWN;
  // 选中后 ownerOf() 确认期间 status 变成 loading：此时仍用缓存里的枚举渲染列表（顺序
  // 已按新选中身份排好），FLIP 才有「Last」可量，也避免骨架屏闪一下。
  const listHeld =
    identity.status === 'loading' && pendingTokenId !== null && identity.identities.length > 0;

  if (identity.status === 'loading' && !listHeld) {
    return <ListSkeleton />;
  }

  if (identity.status === 'error') {
    return (
      <Card>
        <CardTitle>{copy.pages.myNft.errorTitle}</CardTitle>
        <CardDescription>{copy.home.errorBody}</CardDescription>
        <div className="mt-4">
          <Button
            variant="secondary"
            leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
            onClick={onRetry}
          >
            {copy.common.retry}
          </Button>
        </div>
      </Card>
    );
  }

  if (identity.status === 'empty') {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-6 text-muted">{copy.pages.myNft.intro}</p>
        {successRecipient !== null ? <TransferReceipt recipient={successRecipient} /> : null}
        <div className="rounded-3xl border border-dashed border-line bg-surface/70 px-5 py-8 text-center">
          <h2 className="text-base font-semibold text-foreground">{copy.pages.myNft.emptyTitle}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">
            {copy.pages.myNft.emptyBody}
          </p>
          <div className="mt-5 flex flex-col items-stretch justify-center gap-2 sm:flex-row">
            <Link to="/mint" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
              {copy.pages.myNft.emptyMint}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (identity.status === 'needs-selection' || identity.status === 'ready' || listHeld) {
    return (
      <div className="space-y-4">
        <Summary count={count} />
        <p className="text-sm leading-6 text-muted">{copy.pages.myNft.intro}</p>
        {identity.isInvalidated ? <InvalidatedNotice /> : null}
        {busy ? (
          <p className="text-xs leading-5 text-muted">{copy.pages.myNft.busyReason}</p>
        ) : null}
        {successRecipient !== null ? <TransferReceipt recipient={successRecipient} /> : null}

        <ul ref={listRef} className="space-y-2.5 md:hidden" aria-label={copy.identity.myNftTitle}>
          {identity.identities.map((entry) => {
            const current = identity.selected?.tokenId === entry.tokenId;
            const justMintedRow = justMinted !== null && justMinted.tokenId === entry.tokenId;
            return (
              <li
                key={entry.tokenId.toString()}
                data-identity-id={entry.tokenId.toString()}
                data-testid={justMintedRow ? 'identity-just-minted-row' : undefined}
                className={cn(
                  'rounded-2xl border p-4 transition-colors',
                  current
                    ? 'border-brand-strong/40 bg-brand-soft/30'
                    : justMintedRow
                      ? 'border-success/40 bg-success-soft/30'
                      : 'border-line bg-surface',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted">
                    {copy.identity.memberId(entry.tokenId.toString())}
                  </span>
                  {current ? (
                    <Badge tone="brand">{copy.pages.myNft.currentBadge}</Badge>
                  ) : justMintedRow ? (
                    <Badge tone="success" data-testid="identity-just-minted">
                      {copy.pages.myNft.justMinted}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1.5 truncate text-base font-semibold text-foreground">
                  {entry.name ?? UNKNOWN}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <RowActions
                    current={current}
                    busy={busy}
                    using={pendingTokenId === entry.tokenId}
                    transferring={busy && target?.tokenId === entry.tokenId}
                    onUse={() => handleUse(entry.tokenId)}
                    onTransfer={() => setTarget(entry)}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
          <table ref={tableRef} className="w-full text-left text-sm">
            <thead className="bg-elevated text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {copy.pages.myNft.tableNumber}
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {copy.pages.myNft.tableName}
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  {copy.pages.myNft.tableActions}
                </th>
              </tr>
            </thead>
            <tbody>
              {identity.identities.map((entry) => {
                const current = identity.selected?.tokenId === entry.tokenId;
                const justMintedRow = justMinted !== null && justMinted.tokenId === entry.tokenId;
                return (
                  <tr
                    key={entry.tokenId.toString()}
                    data-identity-id={entry.tokenId.toString()}
                    data-testid={justMintedRow ? 'identity-just-minted-row' : undefined}
                    className={cn(
                      'border-t border-line',
                      current
                        ? 'bg-brand-soft/30'
                        : justMintedRow
                          ? 'bg-success-soft/30'
                          : 'bg-surface',
                    )}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
                      {copy.identity.memberId(entry.tokenId.toString())}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{entry.name ?? UNKNOWN}</span>
                      {current ? (
                        <Badge tone="brand" className="ml-2">
                          {copy.pages.myNft.currentBadge}
                        </Badge>
                      ) : justMintedRow ? (
                        <Badge tone="success" className="ml-2" data-testid="identity-just-minted">
                          {copy.pages.myNft.justMinted}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <RowActions
                          current={current}
                          busy={busy}
                          using={pendingTokenId === entry.tokenId}
                          transferring={busy && target?.tokenId === entry.tokenId}
                          onUse={() => handleUse(entry.tokenId)}
                          onTransfer={() => setTarget(entry)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {identity.isTruncated ? (
          <p className="text-xs leading-5 text-muted">{copy.identity.truncated}</p>
        ) : null}

        {/* Owner 2026-11-14: the page-bottom 「回首页」 link is gone — the bottom
            tab bar and the header back button are the way home. */}
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
          <Link to="/mint" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
            {copy.pages.myNft.mintAnother}
          </Link>
        </div>

        {target !== null ? (
          <Suspense fallback={null}>
            <TransferIdentityLayer
              target={target}
              memberNftAddress={identity.memberNftAddress}
              selfAddress={account}
              onBusyChange={setBusy}
              onSuccess={handleConfirmed}
              onClose={() => {
                if (busy) return;
                setTarget(null);
              }}
            />
          </Suspense>
        ) : null}
      </div>
    );
  }

  return null;
}

function Summary({ count }: { readonly count: string }) {
  return (
    <h2 className="text-xl font-semibold tracking-tight text-foreground">
      {copy.pages.myNft.summary(count)}
    </h2>
  );
}

function TransferReceipt({ recipient }: { readonly recipient: `0x${string}` }) {
  return (
    <p className="rounded-2xl border border-success/20 bg-success-soft/60 px-3 py-2 text-sm text-success">
      <Check className="mr-1.5 inline h-4 w-4 align-[-2px]" aria-hidden="true" />
      <span>{copy.pages.myNft.transferSuccess('')}</span>
      <CopyableAddress
        address={recipient}
        label={copy.pages.myNft.recipientLabel}
        className="text-success hover:text-success"
      />
    </p>
  );
}

function RowActions({
  current,
  busy,
  using,
  transferring,
  onUse,
  onTransfer,
}: {
  readonly current: boolean;
  readonly busy: boolean;
  readonly using: boolean;
  readonly transferring: boolean;
  readonly onUse: () => void;
  readonly onTransfer: () => void;
}) {
  return (
    <>
      {using ? (
        // The card is already the current one (selection is applied before the move
        // starts), so the busy label has to win over 「当前身份 NFT」 for the length of
        // the move: it is the feedback that the switch is in progress and it blocks
        // a second tap.
        <Button size="sm" variant="secondary" loading>
          {copy.pages.myNft.useSwitching}
        </Button>
      ) : current ? (
        <Button
          size="sm"
          variant="secondary"
          disabled
          aria-label={copy.pages.myNft.currentAction}
          leadingIcon={<Check className="h-4 w-4" aria-hidden="true" />}
        />
      ) : (
        <Button size="sm" variant="secondary" onClick={onUse}>
          {copy.pages.myNft.useAction}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-danger-strong hover:bg-danger-soft"
        disabled={busy}
        title={busy ? copy.pages.myNft.busyReason : undefined}
        onClick={onTransfer}
      >
        {transferring ? copy.pages.myNft.transferring : copy.pages.myNft.transferAction}
      </Button>
    </>
  );
}
