import { useMemo, useState } from 'react';
import { useReadContracts } from 'wagmi';
import { memberNftAbi, stakeAbi } from '@/config/abis';
import { copy } from '@/shared/config/copy-pages';
import { copyText } from '@/shared/lib/clipboard';
import { cn } from '@/shared/lib/cn';
import { formatPercent, formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { checkAddressInput, parseMemberIdInput } from '@/shared/lib/identity-input';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { CopyableAddress } from '@/shared/ui/copyable-address';
import { Check, Copy } from '@/shared/ui/icons';
import { useMemberIdentities } from '@/entities/member-identity/model/use-member-identities';
import { useMemberNftAddress } from '@/entities/member-identity/model/use-member-nft-address';
import { sharePercent } from '@/features/governance-stake/lib/gov-share';
import type { GovContextValue } from '@/features/governance-stake/model/use-gov-context';

const VOTE_DECIMALS = 18;

type QueryMode = 'nft' | 'wallet';

type QueryTarget =
  | { readonly kind: 'nft'; readonly id: bigint }
  | { readonly kind: 'wallet'; readonly address: `0x${string}` };

/** 数值后的复制按钮（旧版查询结果卡上的复制图标）。 */
function CopyValueButton({ value, testId }: { readonly value: string; readonly testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copy.gov.query.copy}
      title={copy.gov.query.copy}
      data-testid={testId}
      onClick={() => {
        void copyText(value).then((ok) => setCopied(ok));
      }}
      className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-elevated hover:text-brand-strong"
    >
      {copied ? (
        <Check aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Copy aria-hidden="true" className="h-4 w-4" />
      )}
      <span className="sr-only">{copied ? copy.gov.query.copied : copy.gov.query.copy}</span>
    </button>
  );
}

interface ResultStatProps {
  readonly label: string;
  readonly note?: string | undefined;
  readonly value: string;
  readonly testId: string;
}

/** 查询结果的一个大数字块（治理权 / 占比）：标题 + 大数 + 复制。 */
function ResultStat({ label, note, value, testId }: ResultStatProps) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3">
      <p className="text-sm leading-5 text-muted">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="min-w-0 break-words text-2xl font-semibold leading-8 text-foreground">
          <span data-testid={testId}>{value}</span>
        </p>
        <CopyValueButton value={value} testId={`${testId}-copy`} />
      </div>
      {note !== undefined ? <p className="mt-1 text-[11px] leading-4 text-muted">{note}</p> : null}
    </div>
  );
}

function readBigint(entry: { status: string; result?: unknown } | undefined): bigint | undefined {
  return entry?.status === 'success' && typeof entry.result === 'bigint' ? entry.result : undefined;
}

function readString(entry: { status: string; result?: unknown } | undefined): string | undefined {
  return entry?.status === 'success' && typeof entry.result === 'string' ? entry.result : undefined;
}

/**
 * 治理权查询（owner 2026-11-18 20:12 按 TKM 旧版截图重排）：
 *
 * - **按身份 NFT**：输入编号，显示 NFT 名称 / 当前持有人地址 / 本阶段治理权 / 占总
 *   治理权比例。
 * - **按钱包地址**：枚举该地址当前持有的全部身份 NFT（`balanceOf` +
 *   `tokenOfOwnerByIndex`，最多 100 个），把这些身份 NFT 的治理权相加。
 *
 * 旧版第二个 tab 叫「按 NFT 持有人地址」，本质也是按地址查；这里两种都能查，页面
 * 写清「钱包查询统计该地址当前持有的全部身份 NFT」（不含历史）。全部是 view：
 * `govVotes(token, 当前阶段, memberId)` + `memberStake` + MemberNFT 元数据。
 */
export function GovQueryPanel({ ctx }: { readonly ctx: GovContextValue }) {
  const { token, stakeAddress, clock, community } = ctx;
  const memberNft = useMemberNftAddress();
  const [mode, setMode] = useState<QueryMode>('nft');
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<QueryTarget | null>(null);

  const phase = clock.currentPhase;
  const nftTarget = target !== null && target.kind === 'nft' ? target.id : null;
  const walletTarget = target !== null && target.kind === 'wallet' ? target.address : null;

  // 钱包模式：先枚举该地址的身份 NFT（与钱包菜单同一份 hook，最多 100 个）。
  const walletIdentities = useMemberIdentities(walletTarget ?? undefined);
  const walletIds = useMemo(
    () => walletIdentities.identities.map((identity) => identity.tokenId),
    [walletIdentities.identities],
  );

  const nftContracts = useMemo(() => {
    if (
      nftTarget === null ||
      stakeAddress === undefined ||
      token === undefined ||
      phase === undefined
    ) {
      return [];
    }
    const contracts = [
      {
        address: stakeAddress,
        abi: stakeAbi,
        functionName: 'govVotes' as const,
        args: [token.address, phase, nftTarget] as const,
      },
      {
        address: stakeAddress,
        abi: stakeAbi,
        functionName: 'memberStake' as const,
        args: [token.address, nftTarget] as const,
      },
    ] as const;
    if (memberNft.address === undefined) return [...contracts];
    return [
      ...contracts,
      {
        address: memberNft.address,
        abi: memberNftAbi,
        functionName: 'memberName' as const,
        args: [nftTarget] as const,
      },
      {
        address: memberNft.address,
        abi: memberNftAbi,
        functionName: 'ownerOf' as const,
        args: [nftTarget] as const,
      },
    ];
  }, [memberNft.address, nftTarget, phase, stakeAddress, token]);

  const nftRead = useReadContracts({
    contracts: nftContracts,
    query: { enabled: nftContracts.length > 0 },
  });

  const walletContracts = useMemo(() => {
    if (
      walletIds.length === 0 ||
      stakeAddress === undefined ||
      token === undefined ||
      phase === undefined
    ) {
      return [];
    }
    return walletIds.map((id) => ({
      address: stakeAddress,
      abi: stakeAbi,
      functionName: 'govVotes' as const,
      args: [token.address, phase, id] as const,
    }));
  }, [phase, stakeAddress, token, walletIds]);

  const walletRead = useReadContracts({
    contracts: walletContracts,
    query: { enabled: walletContracts.length > 0 },
  });

  const parsedId = parseMemberIdInput(input);
  const walletCheck = checkAddressInput(input.trim(), undefined);
  const valid = mode === 'nft' ? parsedId !== null : walletCheck === 'ok';
  const invalid =
    input.trim().length > 0 && (mode === 'nft' ? parsedId === null : walletCheck !== 'ok');

  const submit = () => {
    if (!valid) return;
    if (mode === 'nft' && parsedId !== null) {
      setTarget({ kind: 'nft', id: parsedId });
      return;
    }
    if (mode === 'wallet' && walletCheck === 'ok') {
      setTarget({ kind: 'wallet', address: input.trim() as `0x${string}` });
    }
  };

  const reset = () => {
    setInput('');
    setTarget(null);
  };

  const retry = () => {
    if (target?.kind === 'nft') {
      void nftRead.refetch();
      return;
    }
    walletIdentities.refetch();
    void walletRead.refetch();
  };

  // ---- 读结果 -------------------------------------------------------------
  const data = nftRead.data;
  const nftVotes = readBigint(data?.[0]);
  const nftStakeTuple =
    data?.[1]?.status === 'success' && Array.isArray(data[1].result)
      ? (data[1].result as readonly bigint[])
      : undefined;
  const nftName = readString(data?.[2]) ?? null;
  const nftOwner = readString(data?.[3]) ?? null;

  const nftLoading =
    target?.kind === 'nft' &&
    (phase === undefined || (nftContracts.length > 0 && nftRead.isLoading));
  const nftFailed =
    target?.kind === 'nft' &&
    (nftRead.isError ||
      data?.[0]?.status === 'failure' ||
      // 读到一半失败也按「读不到」处理，不把失败当成「没有质押」。
      (nftContracts.length > 0 &&
        !nftRead.isLoading &&
        (nftVotes === undefined || nftStakeTuple === undefined)));
  // 编号不存在时 ownerOf 会 revert（其余读成功）：这是「查不到」，不是「读不到」。
  const nftMissing =
    target?.kind === 'nft' &&
    !nftFailed &&
    data?.[3]?.status === 'failure' &&
    nftStakeTuple !== undefined;
  const nftEmpty =
    target?.kind === 'nft' &&
    nftStakeTuple !== undefined &&
    (nftStakeTuple[0] ?? 0n) === 0n &&
    (nftVotes ?? 0n) === 0n;

  const walletVotes = (() => {
    if (target?.kind !== 'wallet' || walletRead.data === undefined) return undefined;
    let sum = 0n;
    for (const entry of walletRead.data) {
      const votes = readBigint(entry);
      if (votes === undefined) return undefined;
      sum += votes;
    }
    return sum;
  })();
  const walletLoading =
    target?.kind === 'wallet' &&
    (walletIdentities.status === 'loading' || (walletContracts.length > 0 && walletRead.isLoading));
  const walletReadBroken =
    target?.kind === 'wallet' &&
    walletRead.data !== undefined &&
    !walletRead.isLoading &&
    walletVotes === undefined;
  const walletFailed =
    target?.kind === 'wallet' &&
    (walletIdentities.status === 'error' || walletRead.isError || walletReadBroken);
  const walletEmpty = target?.kind === 'wallet' && walletIds.length === 0;

  const votes = target?.kind === 'nft' ? nftVotes : walletVotes;
  const share = sharePercent(votes, community.totalGovVotes);
  const targetAddress = target?.kind === 'nft' ? nftOwner : (walletTarget ?? null);

  return (
    <Card data-testid="gov-query-panel">
      <CardTitle>{copy.gov.query.title}</CardTitle>
      <CardDescription>{copy.gov.query.hint}</CardDescription>

      <div
        role="tablist"
        aria-label={copy.gov.query.title}
        className="mt-3 grid grid-cols-2 gap-1 rounded-2xl border border-line bg-elevated p-1 text-xs"
      >
        {(['nft', 'wallet'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            data-testid={`gov-query-mode-${value}`}
            onClick={() => {
              setMode(value);
              setInput('');
              setTarget(null);
            }}
            className={cn(
              'rounded-xl px-2 py-2 font-medium transition-colors',
              mode === value
                ? 'bg-surface text-brand-strong shadow-soft'
                : 'text-muted hover:text-foreground',
            )}
          >
            {copy.gov.query.modes[value]}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        <label className="block">
          <span className="text-sm text-foreground">
            {mode === 'nft' ? copy.gov.query.nftLabel : copy.gov.query.walletLabel}
          </span>
          <input
            type="text"
            inputMode={mode === 'nft' ? 'numeric' : 'text'}
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              mode === 'nft' ? copy.gov.query.nftPlaceholder : copy.gov.query.walletPlaceholder
            }
            data-testid="gov-query-input"
            className="mt-1 w-full rounded-2xl border border-line bg-surface px-3 py-2.5 text-sm text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </label>
        {invalid ? (
          <p className="text-sm text-danger-strong" data-testid="gov-query-invalid">
            {mode === 'nft' ? copy.gov.query.invalidNft : copy.gov.query.invalidWallet}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            data-testid="gov-query-submit"
            disabled={!valid}
            onClick={submit}
          >
            {copy.gov.query.submit}
          </Button>
          <Button variant="secondary" size="md" data-testid="gov-query-reset" onClick={reset}>
            {copy.gov.query.reset}
          </Button>
        </div>
      </div>

      {target !== null ? (
        <div className="mt-4 space-y-3" data-testid="gov-query-result">
          {target.kind === 'nft' ? (
            <div className="space-y-2 rounded-2xl border border-line bg-elevated/60 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">{copy.gov.query.nftId}</span>
                <span
                  className="text-sm font-semibold text-brand-strong"
                  data-testid="gov-query-nft-id"
                >
                  {`#${target.id}`}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted">{copy.gov.query.nftName}</span>
                <span
                  className="min-w-0 truncate text-sm font-medium text-foreground"
                  data-testid="gov-query-nft-name"
                >
                  {nftName ?? copy.gov.query.nameUnknown}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="shrink-0 text-sm text-muted">{copy.gov.query.holder}</span>
                {nftOwner !== null ? (
                  <CopyableAddress
                    address={nftOwner}
                    label={copy.gov.query.holder}
                    testId="gov-query-holder"
                  />
                ) : (
                  <span className="text-sm text-foreground" data-testid="gov-query-holder">
                    {UNKNOWN}
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {targetAddress !== null ? (
            <div className="rounded-2xl border border-line bg-elevated/60 px-3 py-2">
              <p className="text-xs leading-5 text-muted">{copy.gov.query.target}</p>
              <CopyableAddress
                address={targetAddress}
                label={copy.gov.query.target}
                display="full"
                testId="gov-query-target-address"
              />
            </div>
          ) : null}

          {target.kind === 'wallet' ? (
            <p className="text-sm leading-6 text-foreground" data-testid="gov-query-wallet-count">
              {copy.gov.query.walletCount(String(walletIds.length))}
            </p>
          ) : null}
          {target.kind === 'wallet' && walletIdentities.isTruncated ? (
            <p className="text-xs leading-5 text-muted">{copy.gov.query.walletTruncated}</p>
          ) : null}

          {target.kind === 'nft' && nftLoading ? (
            <p className="text-sm text-muted">{copy.gov.query.loading}</p>
          ) : target.kind === 'wallet' && walletLoading ? (
            <p className="text-sm text-muted">{copy.gov.query.loading}</p>
          ) : (target.kind === 'nft' && nftFailed) || (target.kind === 'wallet' && walletFailed) ? (
            <div className="space-y-2">
              <p className="text-sm text-danger-strong" data-testid="gov-query-error">
                {copy.gov.query.error}
              </p>
              <Button variant="secondary" size="sm" onClick={retry}>
                {copy.gov.stats.retry}
              </Button>
            </div>
          ) : target.kind === 'nft' && (nftMissing || nftEmpty) ? (
            <p className="text-sm text-muted" data-testid="gov-query-empty">
              {copy.gov.query.notFoundNft}
            </p>
          ) : target.kind === 'wallet' && walletEmpty ? (
            <p className="text-sm text-muted" data-testid="gov-query-empty">
              {copy.gov.query.notFoundWallet}
            </p>
          ) : (
            <>
              <ResultStat
                label={copy.gov.query.votes}
                note={copy.gov.query.votesNote}
                value={formatTokenAmount(votes, VOTE_DECIMALS)}
                testId="gov-query-votes"
              />
              <ResultStat
                label={copy.gov.query.share}
                value={share === undefined ? UNKNOWN : `${formatPercent(share)}%`}
                testId="gov-query-share"
              />
              <div
                className="rounded-2xl border border-line bg-elevated/60 px-3 py-2"
                data-testid="gov-query-note"
              >
                <p className="text-sm font-semibold text-foreground">{copy.gov.query.noteTitle}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{copy.gov.query.note}</p>
              </div>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}
