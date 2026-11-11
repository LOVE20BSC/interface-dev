import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSimulateContract } from 'wagmi';
import { Check, RefreshCw } from '@/shared/ui/icons';
import { memberNftAbi } from '@/config/abis';
import { DEFAULT_SYMBOL } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatTokenAmount, shortenAddress, UNKNOWN } from '@/shared/lib/format';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { StickyAction } from '@/shared/ui/sticky-action';
import { useAirdropEligibility } from '@/entities/airdrop/model/use-airdrop-eligibility';
import { approveAmountFor } from '@/features/mint-identity/lib/approve-amount';
import { describeMintError } from '@/features/mint-identity/lib/mint-errors';
import { useMintConfig } from '@/features/mint-identity/model/use-mint-config';
import { useMintQuote, type MintNameStatus } from '@/features/mint-identity/model/use-mint-quote';
import { useMintTransaction } from '@/features/mint-identity/model/use-mint-transaction';
import { MintFundsBranch } from '@/features/mint-identity/ui/mint-funds-branch';
import { MintReceipt } from '@/features/mint-identity/ui/mint-receipt';

export interface MintIdentityPanelProps {
  readonly isConnected: boolean;
  readonly isWrongChain: boolean;
  readonly connectAction: ReactNode;
  readonly wrongNetworkAction: ReactNode;
}

const TEXT_LINK =
  'inline-flex items-center text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40';

const NAME_CHECK_TONE: Record<MintNameStatus, string> = {
  empty: 'text-muted',
  'too-long': 'text-danger',
  invalid: 'text-danger',
  'prefix-required': 'text-danger',
  checking: 'text-muted',
  taken: 'text-danger',
  available: 'text-success',
  error: 'text-danger',
};

function StateCard({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">{children}</div>
    </Card>
  );
}

function CostSkeleton() {
  return (
    <Card aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-3 w-full" />
      </div>
    </Card>
  );
}

/**
 * 铸造身份 (UX spec §3.3).
 *
 * One task, one order: name → checking line → cost card → funds branch (only
 * when short) → approve/mint ladder → receipt. Every unknown is a skeleton or
 * 「—」; no value is ever defaulted to 0.
 */
export function MintIdentityPanel({
  isConnected,
  isWrongChain,
  connectAction,
  wrongNetworkAction,
}: MintIdentityPanelProps) {
  const [name, setName] = useState('');
  const [preflightError, setPreflightError] = useState<string | null>(null);
  // The eth_call preflight is async; without this a double tap could send two mints.
  const [isPreflighting, setIsPreflighting] = useState(false);

  const config = useMintConfig();
  const quote = useMintQuote(name, config);
  const eligibility = useAirdropEligibility();
  const tx = useMintTransaction({
    memberNftAddress: config.memberNftAddress,
    paymentTokenAddress: config.paymentTokenAddress,
    paymentTokenSymbol: config.paymentTokenSymbol,
    onConfirmed: () => {
      config.refetch();
      quote.refetch();
    },
  });

  const symbol = config.paymentTokenSymbol;
  const swapSymbol = symbol ?? DEFAULT_SYMBOL;
  const swapHref = `/swap?symbol=${encodeURIComponent(swapSymbol)}`;
  const airdropHref = `/airdrop?symbol=${encodeURIComponent(swapSymbol)}`;

  const cost = quote.cost;
  const balance = config.balance;
  const isInsufficient = cost !== undefined && balance !== undefined && balance < cost;
  // After an approval the on-chain allowance is exactly what we just approved;
  // using it closes the one-render gap before allowance() is refetched.
  const effectiveAllowance = tx.approvedAmount ?? config.allowance;
  const needsApproval =
    cost !== undefined && effectiveAllowance !== undefined && effectiveAllowance < cost;
  const isTxBusy = tx.approveStage !== 'idle' || tx.mintStage !== 'idle';
  const isNameReady = quote.nameStatus === 'available' && cost !== undefined;
  const canAttemptMint =
    config.status === 'ready' &&
    isNameReady &&
    !isInsufficient &&
    !needsApproval &&
    !isTxBusy &&
    config.memberNftAddress !== undefined;

  const simulation = useSimulateContract({
    address: config.memberNftAddress,
    abi: memberNftAbi,
    functionName: 'mint',
    args: [name],
    query: { enabled: canAttemptMint },
  });

  const handleApprove = () => {
    if (cost === undefined) return;
    setPreflightError(null);
    tx.approve(approveAmountFor(cost));
  };

  const handleMint = async () => {
    if (!canAttemptMint || isPreflighting) return;
    setPreflightError(null);
    setIsPreflighting(true);
    try {
      // §3.3: the eth_call simulation is authoritative for the name at submit time.
      const result = await simulation.refetch();
      if (result.isError) {
        setPreflightError(
          describeMintError(result.error, { paymentSymbol: config.paymentTokenSymbol }),
        );
        quote.refetch();
        return;
      }
      tx.mint(name);
    } finally {
      setIsPreflighting(false);
    }
  };

  const handleNameChange = (value: string) => {
    setName(value);
    setPreflightError(null);
    tx.clearError();
  };

  if (tx.receipt !== null) {
    return (
      <MintReceipt
        receipt={tx.receipt}
        paymentSymbol={config.paymentTokenSymbol}
        paymentDecimals={config.paymentTokenDecimals}
        onMintAnother={() => {
          setName('');
          setPreflightError(null);
          tx.clearReceipt();
        }}
      />
    );
  }

  if (!isConnected) {
    return (
      <StateCard
        title={copy.mintIdentity.states.connectTitle}
        description={copy.mintIdentity.states.connectBody}
      >
        <div className="[&>button]:w-full sm:[&>button]:w-auto">{connectAction}</div>
      </StateCard>
    );
  }

  if (isWrongChain) {
    return (
      <StateCard
        title={copy.mintIdentity.states.wrongChainTitle}
        description={copy.mintIdentity.states.wrongChainBody}
      >
        <div className="[&>button]:w-full sm:[&>button]:w-auto">{wrongNetworkAction}</div>
        <Link to="/" className={buttonStyles('ghost', 'md', 'w-full sm:w-auto')}>
          {copy.mintIdentity.states.backHome}
        </Link>
      </StateCard>
    );
  }

  if (config.status === 'unconfigured') {
    return (
      <StateCard
        title={copy.mintIdentity.states.notDeployedTitle}
        description={copy.mintIdentity.states.notDeployedBody}
      >
        <Link to="/" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
          {copy.mintIdentity.states.backHome}
        </Link>
        <Link to="/my-nft" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
          {copy.mintIdentity.states.goMyNft}
        </Link>
      </StateCard>
    );
  }

  if (config.status === 'error') {
    return (
      <StateCard
        title={copy.mintIdentity.states.errorTitle}
        description={copy.mintIdentity.states.errorBody}
      >
        <Button
          variant="primary"
          onClick={config.refetch}
          leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
        >
          {copy.mintIdentity.states.retry}
        </Button>
        <Link to="/" className={buttonStyles('ghost', 'md')}>
          {copy.mintIdentity.states.backHome}
        </Link>
      </StateCard>
    );
  }

  const maxBytesText =
    config.maxNameLength !== undefined ? config.maxNameLength.toString() : UNKNOWN;
  const checkText = (() => {
    switch (quote.nameStatus) {
      case 'checking':
        return copy.mintIdentity.name.check.checking;
      case 'available':
        return copy.mintIdentity.name.check.available;
      case 'taken':
        return copy.mintIdentity.name.check.taken(quote.existingMemberId?.toString());
      case 'too-long':
        return copy.mintIdentity.name.check.tooLong(maxBytesText);
      case 'invalid':
        return copy.mintIdentity.name.check.invalid;
      case 'prefix-required':
        return copy.mintIdentity.name.check.prefix;
      case 'error':
        return copy.mintIdentity.name.check.error;
      case 'empty':
      default:
        return '';
    }
  })();

  const priceDisplay =
    cost !== undefined && config.paymentTokenDecimals !== undefined && symbol !== undefined
      ? copy.mintIdentity.cost.estimate(
          formatTokenAmount(cost, config.paymentTokenDecimals),
          symbol,
        )
      : undefined;
  const isPriceLoading = quote.nameStatus === 'checking' || config.status === 'loading';
  const balanceDisplay =
    balance !== undefined && config.paymentTokenDecimals !== undefined
      ? formatTokenAmount(balance, config.paymentTokenDecimals)
      : undefined;
  const shortfallDisplay =
    cost !== undefined && balance !== undefined && config.paymentTokenDecimals !== undefined
      ? formatTokenAmount(cost - balance, config.paymentTokenDecimals)
      : undefined;

  const approveLabel =
    tx.approveStage === 'wallet'
      ? copy.mintIdentity.ladder.approving
      : tx.approveStage === 'pending'
        ? copy.mintIdentity.ladder.approvePending
        : copy.mintIdentity.ladder.approve;
  const mintLabel =
    tx.mintStage === 'wallet'
      ? copy.mintIdentity.ladder.minting
      : tx.mintStage === 'pending'
        ? copy.mintIdentity.ladder.mintPending
        : copy.mintIdentity.ladder.mint;

  const errorMessage = preflightError ?? tx.error?.message ?? null;
  const retryFailedWrite = () => {
    if (tx.error?.action === 'approve' && cost !== undefined) {
      tx.approve(approveAmountFor(cost));
      return;
    }
    void handleMint();
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="mint-name" className="text-sm font-medium text-foreground">
          {copy.mintIdentity.name.label}
        </label>
        <input
          id="mint-name"
          name="member-name"
          type="text"
          value={name}
          onChange={(event) => handleNameChange(event.target.value)}
          placeholder={copy.mintIdentity.name.placeholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="mt-2 h-12 w-full rounded-2xl border border-line bg-surface px-3 text-base text-foreground shadow-soft outline-none placeholder:text-muted/70 focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
          aria-describedby={`mint-name-bytes${quote.requiresTestPrefix ? ' mint-name-rule' : ''} mint-name-check`}
        />
        <div
          id="mint-name-bytes"
          className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs leading-5 text-muted"
        >
          <span className="font-mono">
            {copy.mintIdentity.name.bytes(quote.byteLength.toString(), maxBytesText)}
          </span>
          <span>{copy.mintIdentity.name.rule}</span>
        </div>
        {quote.requiresTestPrefix ? (
          <div id="mint-name-rule" className="mt-1 space-y-0.5">
            <p className="text-xs leading-5 text-muted">{copy.mintIdentity.name.testRule}</p>
            {quote.nameStatus === 'prefix-required' ? (
              <p className="text-xs leading-5 text-danger">{copy.mintIdentity.name.testReason}</p>
            ) : null}
          </div>
        ) : null}
        <p
          id="mint-name-check"
          role="status"
          aria-live="polite"
          className={cn('mt-1.5 min-h-5 text-sm leading-5', NAME_CHECK_TONE[quote.nameStatus])}
        >
          {checkText}
          {quote.nameStatus === 'error' ? (
            <button
              type="button"
              onClick={quote.refetch}
              className="ml-2 font-medium underline underline-offset-4"
            >
              {copy.mintIdentity.name.check.retry}
            </button>
          ) : null}
        </p>
      </div>

      {config.status === 'loading' ? (
        <CostSkeleton />
      ) : (
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted">{copy.mintIdentity.cost.priceLabel}</span>
            {priceDisplay !== undefined ? (
              <span className="text-lg font-semibold text-foreground">{priceDisplay}</span>
            ) : isPriceLoading ? (
              <Skeleton className="h-6 w-28" />
            ) : (
              <span className="text-lg font-semibold text-muted">{UNKNOWN}</span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-sm text-muted">
              {symbol !== undefined
                ? copy.mintIdentity.cost.balanceLabel(symbol)
                : copy.mintIdentity.cost.balanceLabelFallback}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-medium text-foreground">
                {balanceDisplay !== undefined ? balanceDisplay : UNKNOWN}
              </span>
              <Link to={swapHref} className="text-xs font-medium text-brand-strong hover:underline">
                {copy.mintIdentity.cost.swapLink}
              </Link>
            </span>
          </div>

          {isInsufficient && shortfallDisplay !== undefined && symbol !== undefined ? (
            <p className="mt-3 rounded-xl border border-warning/20 bg-warning-soft/50 px-3 py-2 text-sm font-medium text-warning">
              {copy.mintIdentity.cost.short(shortfallDisplay, symbol)}
            </p>
          ) : null}

          {symbol !== undefined ? (
            <p className="mt-3 text-xs leading-5 text-muted">
              {copy.mintIdentity.cost.note(symbol)}
            </p>
          ) : null}
        </Card>
      )}

      <section aria-label={copy.pages.mint.title} className="space-y-3">
        {isInsufficient ? (
          <MintFundsBranch
            eligibility={eligibility}
            paymentSymbol={swapSymbol}
            paymentDecimals={config.paymentTokenDecimals}
            airdropHref={airdropHref}
            swapHref={swapHref}
          />
        ) : (
          <>
            {needsApproval ? (
              <>
                <StickyAction>
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={handleApprove}
                    disabled={!isNameReady || isTxBusy}
                    loading={tx.approveStage === 'wallet'}
                  >
                    {approveLabel}
                  </Button>
                </StickyAction>
                <div className="space-y-2">
                  <Button variant="secondary" size="md" className="w-full" disabled>
                    {copy.mintIdentity.ladder.mintStep}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {tx.isApproved ? (
                  <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {copy.mintIdentity.ladder.approved}
                  </p>
                ) : null}
                <StickyAction>
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={() => {
                      void handleMint();
                    }}
                    disabled={!canAttemptMint || isPreflighting}
                    loading={tx.mintStage === 'wallet'}
                  >
                    {mintLabel}
                  </Button>
                </StickyAction>
              </>
            )}

            {tx.isApproved && needsApproval ? (
              <p className="text-xs leading-5 text-warning">
                {copy.mintIdentity.ladder.approvalShort}
              </p>
            ) : null}

            <details className="rounded-2xl border border-line bg-surface/70 p-3">
              <summary className="cursor-pointer list-none text-xs font-medium text-foreground marker:hidden">
                {copy.mintIdentity.ladder.why}
              </summary>
              <p className="mt-2 text-xs leading-5 text-muted">
                {copy.mintIdentity.ladder.whyBody}
              </p>
            </details>
          </>
        )}

        {tx.mintStage === 'pending' || (tx.pendingHash !== null && tx.receipt === null) ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-muted">
            <span>{copy.mintIdentity.ladder.pendingNote}</span>
            {tx.pendingHash !== null ? (
              <span className="font-mono text-[11px]">{shortenAddress(tx.pendingHash, 10, 8)}</span>
            ) : null}
          </p>
        ) : null}

        {errorMessage !== null ? (
          <div
            role="alert"
            className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-3 text-sm leading-6 text-danger"
          >
            <p>{errorMessage}</p>
            {tx.error !== null && (tx.error.action === 'approve' ? isNameReady : canAttemptMint) ? (
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={retryFailedWrite}
                leadingIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                {copy.mintIdentity.states.retry}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="pt-1">
          <Link to="/" className={TEXT_LINK}>
            {copy.mintIdentity.states.backHome}
          </Link>
        </div>
      </section>
    </div>
  );
}
