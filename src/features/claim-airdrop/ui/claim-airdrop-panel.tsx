import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy-pages';
import { copyText } from '@/shared/lib/clipboard';
import { NETWORK } from '@/config/networks';
import { formatTokenAmount, shortenAddress, UNKNOWN } from '@/shared/lib/format';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { StickyAction } from '@/shared/ui/sticky-action';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import { airdropUnavailableCopy } from '@/features/claim-airdrop/lib/airdrop-unavailable-copy';
import { claimedAmountView } from '@/features/claim-airdrop/lib/claimed-amount-view';
import { useAirdropClaim } from '@/features/claim-airdrop/model/use-airdrop-claim';
import { useAirdropClaimTransaction } from '@/features/claim-airdrop/model/use-airdrop-claim-transaction';
import { useClaimedAmount } from '@/features/claim-airdrop/model/use-claimed-amount';
import { AirdropReceipt } from '@/features/claim-airdrop/ui/airdrop-receipt';
import { AirdropRules } from '@/features/claim-airdrop/ui/airdrop-rules';

export interface ClaimAirdropPanelProps {
  readonly isConnected: boolean;
  readonly isWrongChain: boolean;
  readonly connectAction: ReactNode;
  readonly wrongNetworkAction: ReactNode;
}

const TEXT_LINK =
  'inline-flex items-center text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40';

function StatusCard({
  meta,
  busy = false,
  children,
}: {
  readonly meta: string;
  readonly busy?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Card aria-busy={busy || undefined}>
      <p className="text-xs font-medium text-muted">{meta}</p>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="md"
      className="w-full text-muted hover:text-foreground sm:w-auto"
      onClick={() => {
        void (async () => {
          const ok = await copyText(window.location.href);
          setCopied(ok);
          if (ok) window.setTimeout(() => setCopied(false), 2000);
        })();
      }}
    >
      {copied ? copy.airdrop.states.copied : copy.airdrop.states.copyLink}
    </Button>
  );
}

function LoadingCard({ meta }: { readonly meta: string }) {
  return (
    <StatusCard meta={meta} busy>
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-8 w-3/5" />
        <Skeleton className="h-12 w-full rounded-2xl" />
      </div>
    </StatusCard>
  );
}

/**
 * 空投铸造 (UX spec §3.4).
 *
 * Seven mutually exclusive states, one solid CTA in S5 only, and a receipt that
 * replaces the page after a claim. Every number comes from a chain read or the
 * transaction receipt; unknown values render as —, never as 0.
 */
export function ClaimAirdropPanel({
  isConnected,
  isWrongChain,
  connectAction,
  wrongNetworkAction,
}: ClaimAirdropPanelProps) {
  const claim = useAirdropClaim();
  const tx = useAirdropClaimTransaction({
    airdropAddress: claim.airdropAddress,
    tokenAddress: claim.tokenAddress,
    tokenSymbol: claim.tokenSymbol,
    tokenDecimals: claim.tokenDecimals,
    totalShare: claim.totalShare,
    entry: claim.entry,
    onConfirmed: claim.refetch,
  });

  const symbol = claim.tokenSymbol;
  const meta = symbol !== undefined ? copy.airdrop.meta(symbol) : copy.airdrop.metaLoading;
  // The swap fallback is pinned to the genesis token, never to ?symbol=.
  const swapHref = symbol !== undefined ? `/swap?symbol=${encodeURIComponent(symbol)}` : '/swap';
  const swapSymbol = symbol ?? UNKNOWN;

  const localReceipt =
    claim.localReceipt !== null && claim.localReceipt.amount !== undefined
      ? claim.localReceipt
      : null;
  const receipt = tx.receipt ?? localReceipt;

  // S6 only: the single injected adapter read (dev log scan today; CI-014 view
  // later). A disabled/undefined result renders the honest fallback, never a
  // fabricated or cached amount.
  const claimedAmount = useClaimedAmount({
    enabled: claim.status === 'claimed' && receipt === null,
    airdropAddress: claim.airdropAddress,
    tokenAddress: claim.tokenAddress,
  });

  if (!isConnected) {
    return (
      <StatusCard meta={meta}>
        <CardTitle>{copy.airdrop.states.disconnectedTitle}</CardTitle>
        <div className="mt-4 [&>button]:w-full sm:[&>button]:w-auto">{connectAction}</div>
      </StatusCard>
    );
  }

  if (isWrongChain) {
    return (
      <StatusCard meta={meta}>
        <CardTitle>{copy.airdrop.states.wrongChainTitle}</CardTitle>
        <CardDescription>{copy.airdrop.states.wrongChainBody}</CardDescription>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="[&>button]:w-full sm:[&>button]:w-auto">{wrongNetworkAction}</div>
          <Link to="/" className={buttonStyles('ghost', 'md', 'w-full sm:w-auto')}>
            {copy.airdrop.states.backHome}
          </Link>
        </div>
      </StatusCard>
    );
  }

  if (receipt !== null) {
    return <AirdropReceipt receipt={receipt} totalShare={claim.totalShare} />;
  }

  if (claim.status === 'unconfigured') {
    return (
      <StatusCard meta={meta}>
        <CardTitle>{copy.airdrop.states.notDeployedTitle}</CardTitle>
        <CardDescription>{copy.airdrop.states.notDeployedBody}</CardDescription>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link to="/" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
            {copy.airdrop.states.backHome}
          </Link>
        </div>
      </StatusCard>
    );
  }

  if (claim.status === 'loading') {
    return <LoadingCard meta={meta} />;
  }

  if (claim.status === 'error') {
    const isSnapshotError = claim.errorKind === 'snapshot';
    return (
      <StatusCard meta={meta}>
        <CardTitle>
          {isSnapshotError
            ? copy.airdrop.states.snapshotErrorTitle
            : copy.airdrop.states.readErrorTitle}
        </CardTitle>
        <CardDescription>
          {isSnapshotError
            ? copy.airdrop.states.snapshotErrorBody
            : copy.airdrop.states.readErrorBody}
        </CardDescription>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            variant="primary"
            onClick={claim.refetch}
            leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
            className="w-full sm:w-auto"
          >
            {copy.airdrop.states.retry}
          </Button>
          <Link to="/" className={buttonStyles('ghost', 'md', 'w-full sm:w-auto')}>
            {copy.airdrop.states.backHome}
          </Link>
        </div>
      </StatusCard>
    );
  }

  if (claim.status === 'ineligible') {
    return (
      <div className="space-y-4">
        <StatusCard meta={meta}>
          <CardTitle>{copy.airdrop.states.ineligibleTitle}</CardTitle>
          <CardDescription>{copy.airdrop.states.ineligibleBody}</CardDescription>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link to={swapHref} className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
              {copy.airdrop.states.ineligibleSwap(swapSymbol)}
            </Link>
            <Link to="/" className={buttonStyles('ghost', 'md', 'w-full sm:w-auto')}>
              {copy.airdrop.states.backHome}
            </Link>
          </div>
        </StatusCard>
        <AirdropRules symbol={symbol} airdropAddress={claim.airdropAddress} />
      </div>
    );
  }

  if (claim.status === 'unavailable') {
    const unavailable = airdropUnavailableCopy(claim.reason ?? 'zero-amount');
    return (
      <div className="space-y-4">
        <StatusCard meta={meta}>
          <CardTitle>{unavailable.title}</CardTitle>
          <CardDescription>{unavailable.body}</CardDescription>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link to={swapHref} className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
              {copy.airdrop.states.unavailableSwap(swapSymbol)}
            </Link>
            <CopyLinkButton />
          </div>
        </StatusCard>
        <AirdropRules symbol={symbol} airdropAddress={claim.airdropAddress} />
        <Link to="/" className={TEXT_LINK}>
          {copy.airdrop.states.backHome}
        </Link>
      </div>
    );
  }

  if (claim.status === 'claimed') {
    const view = claimedAmountView({
      amount: claimedAmount.amount,
      decimals: claim.tokenDecimals,
      symbol: claim.tokenSymbol,
      explorerAvailable: NETWORK.blockExplorerUrl !== null,
    });
    const localHash = claim.localReceipt?.hash;
    const explorerUrl =
      localHash !== undefined && NETWORK.blockExplorerUrl !== null
        ? `${NETWORK.blockExplorerUrl}/tx/${localHash}`
        : null;
    return (
      <StatusCard meta={meta}>
        <CardTitle data-testid="airdrop-claimed-title">{view.title}</CardTitle>
        {claimedAmount.isLoading ? (
          <Skeleton className="mt-2 h-4 w-52" />
        ) : (
          <CardDescription data-testid="airdrop-claimed-body">{view.body}</CardDescription>
        )}
        {localHash !== undefined ? (
          <p className="mt-3 text-xs leading-5 text-muted">
            <span
              className="mr-2 font-mono text-[11px]"
              aria-label={copy.airdrop.claimed.hashLabel}
            >
              {shortenAddress(localHash, 10, 8)}
            </span>
            {explorerUrl !== null ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-strong underline-offset-4 hover:underline"
              >
                {copy.airdrop.claimed.explorer}
              </a>
            ) : null}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link to="/mint" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
            {copy.airdrop.claimed.goMint}
          </Link>
          <Link to="/" className={buttonStyles('ghost', 'md', 'w-full sm:w-auto')}>
            {copy.airdrop.states.backHome}
          </Link>
        </div>
      </StatusCard>
    );
  }

  // S5 可铸造: the only state with the 空投铸造 action.
  const amountText =
    claim.claimableAmount !== undefined && claim.tokenDecimals !== undefined
      ? formatTokenAmount(claim.claimableAmount, claim.tokenDecimals)
      : UNKNOWN;
  const ctaLabel =
    tx.stage === 'wallet'
      ? copy.airdrop.pending.wallet
      : tx.stage === 'pending'
        ? copy.airdrop.pending.chain
        : copy.airdrop.eligible.cta;
  const isBusy = tx.stage !== 'idle';
  const recoveryAction =
    tx.errorKind === 'nonce'
      ? { run: tx.resubmit, label: copy.txWatch.actions.resubmit }
      : tx.errorKind === 'staleBlock'
        ? { run: () => window.location.reload(), label: copy.txWatch.actions.reload }
        : null;

  return (
    <div className="space-y-4">
      <StatusCard meta={meta}>
        <p
          className="font-semibold tracking-tight text-foreground"
          data-testid="airdrop-expected-amount"
          aria-label={copy.airdrop.eligible.expected(amountText, swapSymbol)}
        >
          <span className="block text-sm font-medium text-muted">
            {copy.airdrop.eligible.expectedLabel}
          </span>
          <span className="mt-0.5 block break-words text-2xl leading-9">
            {amountText} <span className="text-base font-medium text-muted">{swapSymbol}</span>
          </span>
        </p>
        <p className="mt-1 text-xs leading-5 text-muted">{copy.airdrop.eligible.note}</p>
        <p className="mt-2 text-xs leading-5 text-muted" data-testid="airdrop-share-percent">
          {copy.airdrop.eligible.share(claim.sharePercent ?? UNKNOWN)}
        </p>
      </StatusCard>

      <div className="space-y-2">
        <StickyAction>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={tx.claim}
            disabled={isBusy || tx.isHydrating || claim.claimableAmount === undefined}
            loading={tx.stage === 'wallet'}
          >
            {ctaLabel}
          </Button>
        </StickyAction>

        {tx.watch.hash !== null ? <TxWatchCard watch={tx.watch} onResubmit={tx.resubmit} /> : null}

        {tx.error !== null ? (
          <div
            role="alert"
            className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-3 text-sm leading-6 text-danger"
          >
            <p>{tx.error}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={recoveryAction !== null ? recoveryAction.run : tx.claim}
              leadingIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {recoveryAction !== null ? recoveryAction.label : copy.airdrop.states.retry}
            </Button>
          </div>
        ) : null}
      </div>

      <AirdropRules symbol={symbol} airdropAddress={claim.airdropAddress} />

      <Link to="/" className={TEXT_LINK}>
        {copy.airdrop.states.backHome}
      </Link>
    </div>
  );
}
