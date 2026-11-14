import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { ArrowDownUp, RefreshCw } from '@/shared/ui/icons';
import { NETWORK, configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { approvalKind } from '@/shared/lib/approval-kind';
import { formatTokenAmount, formatUnits } from '@/shared/lib/format';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { ActionStack } from '@/shared/ui/action-stack';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import {
  applySlippage,
  DEFAULT_SLIPPAGE_PERCENT,
  isSlippagePercentValid,
  NATIVE_GAS_RESERVE_WEI,
  parseSwapAmount,
  percentToBps,
  priceImpactBps,
} from '@/features/swap-token/lib/swap-amount';
import {
  selectSwapReceiptView,
  swapPostDismiss,
} from '@/features/swap-token/lib/swap-receipt-dismissal';
import { selectSwapScreenState } from '@/features/swap-token/lib/swap-state';
import { useSwapBalance } from '@/features/swap-token/model/use-swap-balance';
import { useSwapCatalog } from '@/features/swap-token/model/use-swap-catalog';
import { useSwapFee } from '@/features/swap-token/model/use-swap-fee';
import { useSwapPair } from '@/features/swap-token/model/use-swap-pair';
import { useSwapQuote } from '@/features/swap-token/model/use-swap-quote';
import { useSwapRoute } from '@/features/swap-token/model/use-swap-route';
import { useSwapTransaction } from '@/features/swap-token/model/use-swap-transaction';
import { useWrappedNative } from '@/features/swap-token/model/use-wrapped-native';
import { SwapInfo } from '@/features/swap-token/ui/swap-info';
import { SwapReceipt } from '@/features/swap-token/ui/swap-receipt';
import { TokenSelect } from '@/features/swap-token/ui/token-select';
import type { SwapToken } from '@/features/swap-token/lib/swap-types';

export interface SwapTokenPanelProps {
  readonly isConnected: boolean;
  readonly isWrongChain: boolean;
  readonly connectAction: ReactNode;
}

const CARD = 'rounded-3xl border border-line bg-surface p-5 shadow-soft';

function FormSkeleton() {
  return (
    <Card aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full rounded-2xl" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-10 w-full rounded-2xl" />
      </div>
    </Card>
  );
}

function StateCard({
  title,
  description,
  children,
}: {
  readonly title?: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <Card>
      {title !== undefined ? <CardTitle>{title}</CardTitle> : null}
      <CardDescription>{description}</CardDescription>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {children}
      </div>
    </Card>
  );
}

/**
 * 通用兑换 (UX spec §3.5). One card, one information block, one primary action.
 * All reads are scoped to the selected pair; when the environment has no router
 * or the wallet is disconnected this component renders a single state card and
 * issues no quote/route request.
 */
export function SwapTokenPanel({ isConnected, isWrongChain, connectAction }: SwapTokenPanelProps) {
  const router = configuredAddress('router');
  const factory = configuredAddress('factory');
  const launch = configuredAddress('launch');
  const configured = router !== undefined && factory !== undefined && launch !== undefined;
  const { address: account } = useAccount();

  const wrapped = useWrappedNative();
  const swapFee = useSwapFee();
  const catalog = useSwapCatalog(launch);
  const pair = useSwapPair(wrapped);
  const routeState = useSwapRoute({
    from: pair.from,
    to: pair.to,
    wrapped,
    factory,
    launch,
    enabled:
      configured &&
      isConnected &&
      !isWrongChain &&
      pair.status === 'ready' &&
      wrapped.address !== undefined &&
      account !== undefined,
    nativeSymbol: NETWORK.nativeCurrency.symbol,
  });

  const [amountInput, setAmountInput] = useState('');
  const [debouncedAmount, setDebouncedAmount] = useState('');
  const [slippageMode, setSlippageMode] = useState<'preset' | 'custom'>('preset');
  const [slippagePercent, setSlippagePercent] = useState(DEFAULT_SLIPPAGE_PERCENT);
  const [customSlippage, setCustomSlippage] = useState(String(DEFAULT_SLIPPAGE_PERCENT));
  const [customSlippageError, setCustomSlippageError] = useState<string | undefined>(undefined);
  const [highImpactAck, setHighImpactAck] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [usedNativeMax, setUsedNativeMax] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedAmount(amountInput), 400);
    return () => window.clearTimeout(timer);
  }, [amountInput]);

  const nativeToken = useMemo(
    (): SwapToken => ({
      kind: 'native',
      address: undefined,
      symbol: NETWORK.nativeCurrency.symbol,
      decimals: NETWORK.nativeCurrency.decimals,
    }),
    [],
  );

  const route = routeState.route;
  const from = pair.from;
  const to = pair.to;
  const fromDecimals = from?.decimals;
  const toDecimals = to?.decimals;

  const parsedAmount =
    fromDecimals !== undefined
      ? parseSwapAmount(debouncedAmount, fromDecimals)
      : { kind: 'empty' as const };
  const amountIn = parsedAmount.kind === 'ok' ? parsedAmount.value : undefined;
  const isDebouncing = amountInput !== debouncedAmount;

  const quotePath = route?.kind === 'swap' ? route.pathAddresses : undefined;
  const quote = useSwapQuote({
    router,
    path: quotePath,
    amountIn,
    enabled:
      route?.kind === 'swap' &&
      routeState.status === 'ready' &&
      amountIn !== undefined &&
      amountIn > 0n,
  });

  const balance = useSwapBalance(
    configured && isConnected && !isWrongChain ? from : undefined,
    router,
  );
  const tx = useSwapTransaction({
    router,
    wrappedAddress: wrapped.address,
    from,
    to,
    route,
    nativeSymbol: NETWORK.nativeCurrency.symbol,
    onConfirmed: () => {
      balance.refetch();
      routeState.retry();
    },
  });

  const effectiveAllowance = tx.approvedAmount ?? balance.allowance;
  const needsApproval =
    from !== undefined &&
    from.kind !== 'native' &&
    route?.kind === 'swap' &&
    amountIn !== undefined &&
    amountIn > 0n &&
    effectiveAllowance !== undefined &&
    effectiveAllowance < amountIn;

  const nativeInput = from?.kind === 'native';
  const availableBalance =
    balance.balance !== undefined
      ? nativeInput
        ? balance.balance > NATIVE_GAS_RESERVE_WEI
          ? balance.balance - NATIVE_GAS_RESERVE_WEI
          : 0n
        : balance.balance
      : undefined;
  const insufficient =
    amountIn !== undefined && availableBalance !== undefined && amountIn > availableBalance;
  const shortfall =
    insufficient && amountIn !== undefined && availableBalance !== undefined
      ? amountIn - availableBalance
      : undefined;

  const quoteOut = route?.kind !== 'swap' ? amountIn : quote.amountOut;
  const minOut =
    route?.kind !== 'swap'
      ? amountIn
      : quote.amountOut !== undefined
        ? applySlippage(quote.amountOut, percentToBps(slippagePercent))
        : undefined;
  const impact =
    route?.kind === 'swap' &&
    amountIn !== undefined &&
    amountIn > 0n &&
    quote.amountOut !== undefined &&
    route !== null
      ? priceImpactBps(amountIn, quote.amountOut, route.pathAddresses, route.pairs)
      : undefined;
  const impactHigh = impact !== undefined && impact > 1000;
  const highImpactBlocked = impactHigh && !highImpactAck;
  const tooSmall =
    route?.kind === 'swap' &&
    amountIn !== undefined &&
    amountIn > 0n &&
    quote.amountOut === 0n &&
    !quote.isLoading;

  const routePathKey = route?.pathAddresses.join(',') ?? '';
  // Re-arm the high-impact confirmation whenever the trade materially changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setHighImpactAck(false);
  }, [amountIn, quote.amountOut, routePathKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const routeStatus =
    pair.status === 'error'
      ? 'error'
      : pair.status !== 'ready'
        ? 'idle'
        : wrapped.address === undefined
          ? wrapped.isLoading
            ? 'loading'
            : 'error'
          : routeState.status;
  const pairResolved = pair.status !== 'loading';
  const screen = selectSwapScreenState({
    configured,
    connected: isConnected,
    wrongChain: isWrongChain,
    pairResolved,
    pairInvalid: pair.status === 'invalid',
    routeStatus,
  });

  const [dismissedReceiptHash, setDismissedReceiptHash] = useState<string | null>(null);
  const receiptView = selectSwapReceiptView(tx.receipt, from, to, dismissedReceiptHash);

  const resetInput = () => {
    setAmountInput('');
    setDebouncedAmount('');
    setSubmitError(null);
    setHighImpactAck(false);
    setUsedNativeMax(false);
  };

  // 知道了: collapse the receipt into the success strip, keep the form reset.
  const dismissReceipt = () => {
    if (tx.receipt === null) return;
    setDismissedReceiptHash(tx.receipt.hash);
    resetInput();
  };

  const handleSelect = (side: 'from' | 'to', token: SwapToken) => {
    if (side === 'from') pair.selectFrom(token);
    else pair.selectTo(token);
    resetInput();
    tx.clearError();
  };

  const handleDirection = () => {
    pair.swapDirection();
    resetInput();
    tx.clearError();
  };

  const handleSlippagePreset = (percent: number) => {
    setSlippageMode('preset');
    setSlippagePercent(percent);
    setCustomSlippage(String(percent));
    setCustomSlippageError(undefined);
  };

  const handleSlippageCustom = (value: string) => {
    setCustomSlippage(value);
    const candidate = Number(value.trim());
    if (!isSlippagePercentValid(candidate)) {
      setCustomSlippageError(copy.swap.slippageRange);
      return;
    }
    setCustomSlippageError(undefined);
    setSlippagePercent(candidate);
  };

  const customSlippageInvalid = slippageMode === 'custom' && customSlippageError !== undefined;

  const txBusy =
    tx.approveStage !== 'idle' ||
    tx.swapStage !== 'idle' ||
    (tx.pendingHash !== null && !tx.watch.isStuck) ||
    (tx.receipt !== null && tx.receipt.hash !== dismissedReceiptHash);

  const quoteReady =
    route?.kind !== 'swap' ||
    (quote.amountOut !== undefined &&
      !quote.isExpired &&
      !quote.isLoading &&
      !quote.isFetching &&
      !quote.isError &&
      !tooSmall);

  const allowanceReady =
    from?.kind === 'native' || route?.kind !== 'swap' || effectiveAllowance !== undefined;

  const canApprove =
    amountIn !== undefined &&
    amountIn > 0n &&
    !insufficient &&
    balance.balance !== undefined &&
    !balance.isError &&
    !txBusy &&
    !isPreparing &&
    !isDebouncing;

  const canSwap =
    canApprove &&
    quoteReady &&
    allowanceReady &&
    !customSlippageInvalid &&
    !highImpactBlocked &&
    parsedAmount.kind === 'ok';

  const handlePrimary = async () => {
    if (isPreparing || amountIn === undefined || amountIn <= 0n) return;
    if (txBusy) return;
    if (needsApproval) {
      if (!canApprove) return;
      tx.approve(amountIn);
      return;
    }
    if (!canSwap) return;
    setSubmitError(null);

    if (route === null) return;
    if (route.kind !== 'swap') {
      await tx.execute({ amountIn, minOut: amountIn, quoteOut: undefined });
      return;
    }

    if (quote.amountOut === undefined) return;
    setIsPreparing(true);
    try {
      // Re-read immediately before submitting and recompute amountOutMin.
      const fresh = await quote.refetch();
      if (fresh === undefined) {
        setSubmitError(copy.swap.errors.quoteFailed);
        return;
      }
      if (fresh === 0n) {
        setSubmitError(copy.swap.states.amountTooSmall);
        return;
      }
      await tx.execute({
        amountIn,
        minOut: applySlippage(fresh, percentToBps(slippagePercent)),
        quoteOut: fresh,
      });
    } finally {
      setIsPreparing(false);
    }
  };

  const handleRetry = () => {
    if (submitError !== null) {
      setSubmitError(null);
      void quote.refetch();
      return;
    }
    if (tx.error?.action === 'approve') {
      if (amountIn !== undefined) tx.approve(amountIn);
      return;
    }
    void handlePrimary();
  };

  // 授权步骤 sits inside the swap card, right below the amount rows, so the
  // prerequisite reads before 兑换 (owner 2026-11-14). It stays visible when the
  // token is already approved — long-term approvals say so instead of hiding.
  const showApproveStep =
    from !== undefined &&
    from.kind !== 'native' &&
    route?.kind === 'swap' &&
    amountIn !== undefined &&
    amountIn > 0n;
  const longTermApproved =
    effectiveAllowance !== undefined && approvalKind(effectiveAllowance) === 'unlimited';
  const approveLabel = needsApproval
    ? tx.approveStage === 'wallet'
      ? copy.approve.approving
      : tx.approveStage === 'pending'
        ? copy.approve.confirming
        : copy.approve.action(from?.symbol ?? '')
    : effectiveAllowance === undefined
      ? copy.approve.loading
      : longTermApproved
        ? copy.approve.longTermActive
        : copy.approve.approved;
  const approveNote = needsApproval
    ? copy.approve.note(from?.symbol ?? '')
    : effectiveAllowance === undefined
      ? null
      : longTermApproved
        ? copy.approve.longTermNote
        : copy.approve.approvedNote;
  const swapLabel =
    tx.swapStage === 'wallet'
      ? copy.swap.ladder.swapping
      : tx.swapStage === 'pending'
        ? copy.swap.ladder.confirming
        : copy.swap.ladder.swap;

  const selectorProps = {
    nativeToken,
    wrappedToken: wrapped.token,
    communityTokens: catalog.communityTokens,
    searchResults: catalog.searchResults,
    searchStatus: catalog.searchStatus,
    search: catalog.search,
    onSearchChange: catalog.setSearch,
    hasMore: catalog.hasMore,
    onLoadMore: catalog.loadMore,
    isLoading: catalog.isLoading || wrapped.isLoading,
  };

  if (screen === 'unconfigured') {
    return (
      <StateCard
        title={copy.swap.states.unconfiguredTitle}
        description={copy.swap.states.unconfiguredBody}
      >
        <Link to="/" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
          {copy.swap.states.backHome}
        </Link>
      </StateCard>
    );
  }

  if (screen === 'disconnected') {
    return (
      <StateCard title={copy.swap.states.connectTitle} description={copy.swap.states.connectBody}>
        <div className="[&>button]:w-full sm:[&>button]:w-auto">{connectAction}</div>
      </StateCard>
    );
  }

  if (screen === 'wrong-chain') {
    return (
      <StateCard description={copy.swap.states.wrongChainBody}>
        <Link to="/" className={buttonStyles('ghost', 'md', 'w-full sm:w-auto')}>
          {copy.swap.states.backHome}
        </Link>
      </StateCard>
    );
  }

  if (receiptView === 'receipt' && tx.receipt !== null) {
    return (
      <SwapReceipt record={tx.receipt} onDismiss={dismissReceipt} />
    );
  }

  if (screen === 'resolving' || tx.isHydrating || pair.status === 'loading') {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className={CARD}>
          <div className="rounded-2xl bg-elevated p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">{copy.swap.from}</span>
              <Skeleton className="h-10 w-28 rounded-2xl" />
            </div>
            <input
              data-testid="swap-from-amount"
              name="swap-from-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={amountInput}
              onChange={(event) => {
                setAmountInput(event.target.value);
                setUsedNativeMax(false);
              }}
              placeholder={copy.swap.amountPlaceholder}
              aria-label={copy.swap.from}
              className="mt-2 h-12 w-full bg-transparent text-3xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted"
            />
            <Skeleton className="mt-2 h-3.5 w-32" />
          </div>
          <div className="relative my-1.5 flex justify-center">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted opacity-60">
              <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="rounded-2xl bg-elevated p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">{copy.swap.to}</span>
              <Skeleton className="h-10 w-28 rounded-2xl" />
            </div>
            <div className="mt-2 flex min-h-12 items-center justify-between gap-3">
              <span className="shrink-0 whitespace-nowrap text-xs text-muted">
                {copy.swap.expected}
              </span>
              <Skeleton className="h-7 w-32" />
            </div>
          </div>
        </div>
        <div className="space-y-2.5 rounded-2xl border border-line bg-elevated p-3">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
        <Skeleton className="h-12 w-full rounded-2xl" />
      </div>
    );
  }

  if (screen === 'invalid-pair') {
    const side = pair.unknownSide ?? 'from';
    return (
      <StateCard title={copy.swap.states.invalidTitle} description={copy.swap.states.invalidBody}>
        <TokenSelect
          side={side}
          selected={side === 'from' ? from : to}
          {...selectorProps}
          onSelect={(token) => handleSelect(side, token)}
          triggerLabel={copy.swap.states.chooseToken}
          triggerClassName={buttonStyles('primary', 'md', 'w-full sm:w-auto')}
          disabled={catalog.isLoading}
        />
        <Link to="/" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
          {copy.swap.states.backHome}
        </Link>
      </StateCard>
    );
  }

  if (screen === 'no-route') {
    return (
      <StateCard title={copy.swap.states.noRouteTitle} description={copy.swap.states.noRouteBody}>
        {routeState.failingHopLabel !== undefined ? (
          <p className="w-full text-xs leading-5 text-muted">
            {copy.swap.states.noRouteHop(routeState.failingHopLabel)}
          </p>
        ) : null}
        <TokenSelect
          side="to"
          selected={to}
          {...selectorProps}
          onSelect={(token) => handleSelect('to', token)}
          triggerLabel={copy.swap.states.changeToken}
          triggerClassName={buttonStyles('primary', 'md', 'w-full sm:w-auto')}
          disabled={catalog.isLoading}
        />
        <Link to="/" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
          {copy.swap.states.backHome}
        </Link>
      </StateCard>
    );
  }

  if (screen === 'empty-pool') {
    const hop = routeState.failingHopLabel;
    return (
      <StateCard
        title={copy.swap.states.emptyPoolTitle}
        description={copy.swap.states.emptyPoolBody}
      >
        {hop !== undefined ? (
          <p className="w-full text-xs leading-5 text-muted">
            {copy.swap.states.emptyPoolHop(hop)}
          </p>
        ) : null}
        <TokenSelect
          side="to"
          selected={to}
          {...selectorProps}
          onSelect={(token) => handleSelect('to', token)}
          triggerLabel={copy.swap.states.changeToken}
          triggerClassName={buttonStyles('primary', 'md', 'w-full sm:w-auto')}
          disabled={catalog.isLoading}
        />
        <Link to="/" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
          {copy.swap.states.backHome}
        </Link>
      </StateCard>
    );
  }

  if (screen === 'route-error') {
    return (
      <StateCard
        title={copy.swap.states.quoteErrorTitle}
        description={copy.swap.states.quoteErrorBody}
      >
        <Button
          variant="primary"
          onClick={() => {
            routeState.retry();
            wrapped.refetch();
          }}
          leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
        >
          {copy.swap.states.retry}
        </Button>
        <Link to="/" className={buttonStyles('ghost', 'md', 'w-full sm:w-auto')}>
          {copy.swap.states.backHome}
        </Link>
      </StateCard>
    );
  }

  if (from === undefined || to === undefined) {
    return <FormSkeleton />;
  }

  const balanceText =
    balance.balance === undefined
      ? copy.swap.balanceLoading
      : `${copy.swap.balanceLabel(from.symbol)} ${formatTokenAmount(balance.balance, fromDecimals)}`;
  const outText =
    quoteOut !== undefined && toDecimals !== undefined
      ? `${formatTokenAmount(quoteOut, toDecimals)} ${to.symbol}`
      : copy.common.unknown;

  const amountError = (() => {
    if (parsedAmount.kind === 'invalid') return copy.swap.states.amountInvalid;
    if (parsedAmount.kind === 'too-precise') {
      return copy.swap.states.amountTooPrecise(parsedAmount.digits);
    }
    if (insufficient && shortfall !== undefined) {
      return copy.swap.states.insufficient(from.symbol, formatTokenAmount(shortfall, fromDecimals));
    }
    if (tooSmall) return copy.swap.states.amountTooSmall;
    return null;
  })();

  const errorMessage = submitError ?? tx.error?.message ?? null;
  const showQuoteError = quote.isError;
  const recoveryAction =
    tx.error?.kind === 'nonce'
      ? { run: tx.resubmit, label: copy.txWatch.actions.resubmit }
      : tx.error?.kind === 'staleBlock'
        ? { run: () => window.location.reload(), label: copy.txWatch.actions.reload }
        : null;

  const maxAmount = () => {
    if (availableBalance === undefined) return;
    setAmountInput(formatUnits(availableBalance, fromDecimals ?? 0));
    setUsedNativeMax(nativeInput);
    setSubmitError(null);
  };

  const dismissedSwap =
    receiptView === 'dismissed' && tx.receipt !== null ? swapPostDismiss(tx.receipt) : null;

  return (
    <div className="space-y-4">
      {dismissedSwap !== null ? (
        <div className={CARD} data-testid="swap-success-strip">
          <p className="text-sm font-semibold text-foreground">
            {copy.receiptDismiss.swapStripTitle}
          </p>
          <p className="mt-1 text-base font-medium text-foreground">
            {copy.receiptDismiss.swapStripAmount(
              `${dismissedSwap.received} ${dismissedSwap.symbol}`,
            )}
          </p>
        </div>
      ) : null}
      <div className={CARD}>
        <div className="rounded-2xl bg-elevated p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">{copy.swap.from}</span>
            <TokenSelect
              side="from"
              selected={from}
              {...selectorProps}
              onSelect={(token) => handleSelect('from', token)}
            />
          </div>
          <input
            data-testid="swap-from-amount"
            name="swap-from-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={amountInput}
            onChange={(event) => {
              setAmountInput(event.target.value);
              setUsedNativeMax(false);
              setSubmitError(null);
              tx.clearError();
            }}
            placeholder={copy.swap.amountPlaceholder}
            aria-label={`${copy.swap.from} ${from.symbol}`}
            className="mt-2 h-12 w-full bg-transparent text-3xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs leading-5 text-muted">
              {balance.isLoading ? (
                <Skeleton className="h-3.5 w-28" />
              ) : balance.isError ? (
                copy.home.balanceError
              ) : (
                balanceText
              )}
            </span>
            <button
              type="button"
              onClick={maxAmount}
              disabled={balance.balance === undefined}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-brand-strong hover:bg-brand-soft disabled:opacity-50"
            >
              {copy.swap.max}
            </button>
          </div>
          {amountError !== null ? (
            <p
              className={cn(
                'mt-1.5 text-xs leading-5',
                insufficient || tooSmall ? 'text-danger-strong' : 'text-danger-strong',
              )}
              data-testid="swap-amount-error"
            >
              {amountError}
            </p>
          ) : null}
          {nativeInput && usedNativeMax ? (
            <p className="mt-1 text-[11px] leading-4 text-muted">
              {copy.swap.maxNativeNote(
                formatTokenAmount(NATIVE_GAS_RESERVE_WEI, fromDecimals),
                from.symbol,
              )}
            </p>
          ) : null}
          {nativeInput && insufficient ? (
            <p className="mt-1 text-[11px] leading-4 text-muted">
              {copy.swap.states.nativeGasNote(from.symbol)}
            </p>
          ) : null}
        </div>

        <div className="relative my-1.5 flex justify-center">
          <button
            type="button"
            aria-label={copy.swap.swapDirection}
            onClick={handleDirection}
            disabled={txBusy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-foreground shadow-soft hover:bg-elevated disabled:opacity-50"
          >
            <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="rounded-2xl bg-elevated p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">{copy.swap.to}</span>
            <TokenSelect
              side="to"
              selected={to}
              {...selectorProps}
              onSelect={(token) => handleSelect('to', token)}
            />
          </div>
          <div className="mt-2 flex min-h-12 items-center justify-between gap-3">
            <span className="shrink-0 whitespace-nowrap text-xs text-muted">
              {copy.swap.expected}
            </span>
            <span
              className="min-w-0 break-words text-right text-2xl font-semibold tracking-tight text-foreground"
              data-testid="swap-to-amount"
            >
              {isDebouncing || (route?.kind === 'swap' && quote.isLoading) ? (
                <Skeleton className="ml-auto h-7 w-32" />
              ) : (
                outText
              )}
            </span>
          </div>
        </div>

        {showApproveStep ? (
          <div className="mt-3 border-t border-line pt-3" data-testid="swap-approve-step">
            <Button
              variant={needsApproval ? 'primary' : 'secondary'}
              size="lg"
              className="w-full"
              data-testid="swap-approve"
              onClick={() => {
                if (amountIn !== undefined) tx.approve(amountIn);
              }}
              disabled={!needsApproval || !canApprove || tx.approveStage !== 'idle'}
              loading={tx.approveStage === 'wallet'}
            >
              {approveLabel}
            </Button>
            {approveNote !== null ? (
              <p className="mt-1.5 text-xs leading-5 text-muted" data-testid="swap-approve-note">
                {approveNote}
              </p>
            ) : null}
            {needsApproval && tx.isApproved ? (
              <p className="mt-1 text-xs leading-5 text-warning">
                {copy.swap.ladder.approvalShort}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {route !== null ? (
        <SwapInfo
          from={from}
          to={to}
          route={route}
          amountIn={amountIn}
          amountOut={quoteOut}
          minOut={minOut}
          slippagePercent={slippagePercent}
          slippageMode={slippageMode}
          customSlippage={customSlippage}
          customSlippageError={customSlippageError}
          onSelectSlippage={(percent, mode) => {
            if (mode === 'preset') handleSlippagePreset(percent);
            else {
              setSlippageMode('custom');
              handleSlippageCustom(customSlippage);
            }
          }}
          onCustomSlippageChange={handleSlippageCustom}
          priceImpactBps={impact}
          remainingSeconds={quote.remainingSeconds}
          isExpired={quote.isExpired}
          isFetching={quote.isFetching}
          isLoading={routeState.status === 'loading' || quote.isLoading || isDebouncing}
          feePercent={swapFee.percent}
        />
      ) : (
        <div className="space-y-2.5 rounded-2xl border border-line bg-elevated p-3">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      )}

      {highImpactBlocked ? (
        <div
          role="alert"
          className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-3 text-sm leading-6 text-danger-strong"
        >
          <p>{copy.swap.priceImpactHigh}</p>
          <Button
            variant="danger"
            size="sm"
            className="mt-2"
            onClick={() => setHighImpactAck(true)}
          >
            {copy.swap.priceImpactAck}
          </Button>
        </div>
      ) : null}

      {showQuoteError ? (
        <div
          role="alert"
          className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-3 text-sm leading-6 text-danger-strong"
        >
          <p>{copy.swap.states.quoteErrorTitle}</p>
          <p className="mt-1 text-xs leading-5 text-muted">{copy.swap.states.quoteErrorBody}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => {
              void quote.refetch();
            }}
            leadingIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            {copy.swap.states.quoteErrorRetry}
          </Button>
        </div>
      ) : null}

      {errorMessage !== null ? (
        <div
          role="alert"
          className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-3 text-sm leading-6 text-danger-strong"
        >
          <p>{errorMessage}</p>
          {tx.error?.action === 'swap' ? (
            <p className="mt-1 text-xs leading-5 text-muted">{copy.swap.errors.failedNote}</p>
          ) : null}
          {recoveryAction !== null ||
          submitError !== null ||
          (tx.error?.action === 'approve' ? canApprove : tx.error !== null && canSwap) ? (
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={recoveryAction !== null ? recoveryAction.run : handleRetry}
              leadingIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {recoveryAction !== null
                ? recoveryAction.label
                : (tx.error?.retryLabel ?? copy.swap.states.retry)}
            </Button>
          ) : null}
        </div>
      ) : null}

      <section aria-label={copy.pages.swap.title} className="space-y-2">
        <ActionStack>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            data-testid="swap-submit"
            onClick={() => {
              void handlePrimary();
            }}
            disabled={!canSwap || needsApproval || isPreparing || tx.swapStage !== 'idle'}
            loading={tx.swapStage === 'wallet' || isPreparing}
          >
            {isPreparing ? copy.swap.quoteRefreshing : swapLabel}
          </Button>
        </ActionStack>

        {tx.watch.hash !== null ? <TxWatchCard watch={tx.watch} onResubmit={tx.resubmit} /> : null}

        <p className="text-[11px] leading-5 text-muted">{copy.swap.ladder.note}</p>
      </section>
    </div>
  );
}
