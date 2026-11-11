import { lazy, Suspense, useState } from 'react';
import { Check, RefreshCw } from '@/shared/ui/icons';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { copy } from '@/shared/config/copy-pages';
import { shortenAddress, UNKNOWN } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import type { MemberIdentity } from '@/entities/member-identity/model/use-member-identities';
import type { MemberIdentityState } from '@/entities/member-identity/model/use-member-identity';
const TransferIdentityLayer = lazy(async () => {
  const module = await import('@/features/transfer-identity/ui/transfer-identity-layer');
  return { default: module.TransferIdentityLayer };
});

export interface IdentityListProps {
  readonly identity: MemberIdentityState;
  readonly onRetry: () => void;
}

const TEXT_LINK =
  'inline-flex items-center text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40';

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
    <p className="mb-3 rounded-xl border border-line bg-slate-50 px-3 py-2 text-xs leading-5 text-muted">
      {copy.home.identityInvalidated}
    </p>
  );
}

export function IdentityList({ identity, onRetry }: IdentityListProps) {
  const { address: account } = useAccount();
  const [target, setTarget] = useState<MemberIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const [successRecipient, setSuccessRecipient] = useState<`0x${string}` | null>(null);

  const handleConfirmed = (memberId: bigint, to: `0x${string}`) => {
    if (identity.selected?.tokenId === memberId) identity.clear();
    identity.refetch();
    setSuccessRecipient(to);
    setTarget(null);
    setBusy(false);
  };
  const count = identity.balance !== undefined ? identity.balance.toString() : UNKNOWN;

  if (identity.status === 'loading') {
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
            <Link to="/" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
              {copy.pages.myNft.backHome}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (identity.status === 'needs-selection' || identity.status === 'ready') {
    return (
      <div className="space-y-4">
        <Summary count={count} />
        <p className="text-sm leading-6 text-muted">{copy.pages.myNft.intro}</p>
        {identity.isInvalidated ? <InvalidatedNotice /> : null}
        {busy ? (
          <p className="text-xs leading-5 text-muted">{copy.pages.myNft.busyReason}</p>
        ) : null}
        {successRecipient !== null ? <TransferReceipt recipient={successRecipient} /> : null}

        <ul className="space-y-2.5 md:hidden" aria-label={copy.identity.myNftTitle}>
          {identity.identities.map((entry) => {
            const current = identity.selected?.tokenId === entry.tokenId;
            return (
              <li
                key={entry.tokenId.toString()}
                className={cn(
                  'rounded-2xl border p-4 transition-colors',
                  current ? 'border-brand/40 bg-brand-soft/30' : 'border-line bg-surface',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted">
                    {copy.identity.memberId(entry.tokenId.toString())}
                  </span>
                  {current ? <Badge tone="brand">{copy.pages.myNft.currentBadge}</Badge> : null}
                </div>
                <p className="mt-1.5 truncate text-base font-semibold text-foreground">
                  {entry.name ?? UNKNOWN}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <RowActions
                    current={current}
                    busy={busy}
                    transferring={busy && target?.tokenId === entry.tokenId}
                    onUse={() => identity.select(entry.tokenId)}
                    onTransfer={() => setTarget(entry)}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-muted">
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
                return (
                  <tr
                    key={entry.tokenId.toString()}
                    className={cn(
                      'border-t border-line',
                      current ? 'bg-brand-soft/30' : 'bg-surface',
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
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <RowActions
                          current={current}
                          busy={busy}
                          transferring={busy && target?.tokenId === entry.tokenId}
                          onUse={() => identity.select(entry.tokenId)}
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

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
          <Link to="/mint" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
            {copy.pages.myNft.mintAnother}
          </Link>
          <Link to="/" className={TEXT_LINK}>
            {copy.pages.myNft.backHome}
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
      {copy.pages.myNft.transferSuccess(shortenAddress(recipient))}
    </p>
  );
}

function RowActions({
  current,
  busy,
  transferring,
  onUse,
  onTransfer,
}: {
  readonly current: boolean;
  readonly busy: boolean;
  readonly transferring: boolean;
  readonly onUse: () => void;
  readonly onTransfer: () => void;
}) {
  return (
    <>
      {current ? (
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
        className="text-danger hover:bg-danger-soft"
        disabled={busy}
        title={busy ? copy.pages.myNft.busyReason : undefined}
        onClick={onTransfer}
      >
        {transferring ? copy.pages.myNft.transferring : copy.pages.myNft.transferAction}
      </Button>
    </>
  );
}
