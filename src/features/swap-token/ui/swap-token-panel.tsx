import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { ArrowDownUp, Check, RefreshCw } from '@/shared/ui/icons';
import { NETWORK, configuredAddress, explorerAddressUrl, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatTokenAmount, formatUnits } from '@/shared/lib/format';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { StickyAction } from '@/shared/ui/sticky-action';
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
import { swapRecordMatchesPair } from '@/features/swap-token/lib/swap-receipt-record';
import { selectSwapScreenState } from '@/features/swap-token/lib/swap-state';
import { useSwapBalance } from '@/features/swap-token/model/use-swap-balance';
import { useSwapCatalog } from '@/features/swap-token/model/use-swap-catalog';
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

const TEXT_LINK =
  'inline-flex items-center text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40';

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

function SwapTechnicalDetails({
  entries,
  summary,
}: {
  readonly entries: readonly { readonly label: string; readonly address: HexAddress | undefined }[];
  readonly summary: string;
}) {
  return (
    <details className="group rounded-2xl border border-line bg-surface/70 p-4">
      <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:hidden">
        <span className="inline-flex items-center gap-2">
          {summary}
          <span className="text-xs font-normal text-muted group-open:hidden" aria-hidden="true">
            ＋
          </span>
          <span
            className="hidden text-xs font-normal text-muted group-open:inline"
            aria-hidden="true"
          >
            －
          </span>
        </span>
      </summary>
      <dl className="mt-3 space-y-2.5">
        {entries.map((entry) => {
          const href = entry.address !== undefined ? explorerAddressUrl(entry.address) : null;
          return (
            <div
              key={`${entry.label}-${entry.address ?? ''}`}
              className="flex items-start justify-between gap-3 text-xs"
            >
              <dt className="shrink-0 text-muted">{entry.label}</dt>
              <dd className="min-w-0 break-all text-right font-mono text-[11px] leading-5">
                {entry.address === undefined ? (
                  <span className="font-sans text-muted">{copy.common.notConfigured}</span>
                ) : href === null ? (
                  <span className="text-foreground">{entry.address}</span>
                ) : (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-strong underline-offset-4 hover:underline"
                  >
                    {entry.address}
                  </a>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}

function StateCard({
  title,
  description,
  children,
  technical,
}: {
  readonly title?: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly technical?: ReactNode;
}) {
  return (
    <Card>
      {title !== undefined ? <CardTitle>{title}</CardTitle> : null}
      <CardDescription>{description}</CardDescription>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {children}
      </div>
      {technical !== undefined ? <div className="mt-4">{technical}</div> : null}
    </Card>
  );
}

/**
 * 通用兑换 (UX spec §3.5). One card, one information block, one primary action.
 * All reads are scoped to the selected pair; when the environment has no router
 * or the wallet is disconnected this component renders a single state card and
 * issues no quote/route request.
 */
export function SwapTokenPanel({
  isConnected,
  isWrongChain,
  connectAction,
}: SwapTokenPanelProps) {
  const router = configuredAddress('router');
  const factory = configuredAddress('factory');
  const launch = configuredAddress('launch');
  const configured = router !== undefined && factory !== undefined && launch !== undefined;
  const { address: account } = useAccount();

  const wrapped = useWrappedNative();
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

  const receiptVisible =
    tx.receipt !== null &&
    from !== undefined &&
    to !== undefined &&
    swapRecordMatchesPair(tx.receipt, from, to);

  const resetInput = () => {
    setAmountInput('');
    setDebouncedAmount('');
    setSubmitError(null);
    setHighImpactAck(false);
    setUsedNativeMax(false);
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
    tx.receipt !== null;

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

  const approveLabel =
    tx.approveStage === 'wallet'
      ? copy.swap.ladder.approving
      : tx.approveStage === 'pending'
        ? copy.swap.ladder.confirming
        : copy.swap.ladder.approve;
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

  const advancedEntries =
    route === null
      ? router !== undefined
        ? [{ label: copy.swap.advanced.router, address: router }]
        : []
      : [
          ...route.pairs.map((pairInfo, index) => ({
            label: copy.swap.advanced.pair(
              route.path[index]?.symbol ?? '',
              route.path[index + 1]?.symbol ?? '',
            ),
            address: pairInfo.address,
          })),
          ...(router !== undefined ? [{ label: copy.swap.advanced.router, address: router }] : []),
        ];

  const emptyPoolPair = routeState.allPairs[routeState.allPairs.length - 1];

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

  if (receiptVisible) {
    return (
      <SwapReceipt
        record={tx.receipt as NonNullable<typeof tx.receipt>}
        onSwapAgain={() => {
          tx.clearReceipt();
          resetInput();
        }}
      />
    );
  }

  if (screen === 'resolving' || tx.isHydrating || pair.status === 'loading') {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className={CARD}>
          <div className="rounded-2xl bg-slate-50/70 p-3">
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
              className="mt-2 h-12 w-full bg-transparent text-3xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted/40"
            />
            <Skeleton className="mt-2 h-3.5 w-32" />
          </div>
          <div className="relative my-1.5 flex justify-center">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted opacity-60">
              <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <div className="rounded-2xl bg-slate-50/70 p-3">
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
        <div className="space-y-2.5 rounded-2xl border border-line bg-slate-50/70 p-3">
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
      <StateCard
        title={copy.swap.states.noRouteTitle}
        description={copy.swap.states.noRouteBody}
        technical={
          advancedEntries.length > 0 ? (
            <SwapTechnicalDetails entries={advancedEntries} summary={copy.swap.advanced.summary} />
          ) : undefined
        }
      >
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
    const pairEntry =
      emptyPoolPair !== undefined
        ? [
            {
              label: hop ?? copy.swap.advanced.pair(from?.symbol ?? '', to?.symbol ?? ''),
              address: emptyPoolPair.address,
            },
          ]
        : [];
    return (
      <StateCard
        title={copy.swap.states.emptyPoolTitle}
        description={copy.swap.states.emptyPoolBody}
        technical={
          <SwapTechnicalDetails
            entries={[
              ...pairEntry,
              ...(router !== undefined
                ? [{ label: copy.swap.advanced.router, address: router }]
                : []),
            ]}
            summary={copy.swap.advanced.summary}
          />
        }
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

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <div className="rounded-2xl bg-slate-50/70 p-3">
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
            className="mt-2 h-12 w-full bg-transparent text-3xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted/40"
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
                insufficient || tooSmall ? 'text-danger' : 'text-danger',
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-foreground shadow-soft hover:bg-slate-50 disabled:opacity-50"
          >
            <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="rounded-2xl bg-slate-50/70 p-3">
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
        />
      ) : (
        <div className="space-y-2.5 rounded-2xl border border-line bg-slate-50/70 p-3">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      )}

      {highImpactBlocked ? (
        <div
          role="alert"
          className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-3 text-sm leading-6 text-danger"
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
          className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-3 text-sm leading-6 text-danger"
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
          className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-3 text-sm leading-6 text-danger"
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
        {needsApproval ? (
          <>
            <StickyAction>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                data-testid="swap-approve"
                onClick={() => {
                  if (amountIn !== undefined) tx.approve(amountIn);
                }}
                disabled={!canApprove || tx.approveStage !== 'idle'}
                loading={tx.approveStage === 'wallet'}
              >
                {approveLabel}
              </Button>
            </StickyAction>
            <div className="space-y-2">
              <Button variant="secondary" size="md" className="w-full" disabled>
                {copy.swap.ladder.swapStep}
              </Button>
              {tx.isApproved ? (
                <p className="text-xs leading-5 text-warning">{copy.swap.ladder.approvalShort}</p>
              ) : (
                <p className="text-xs leading-5 text-muted">{copy.swap.ladder.approvalNote}</p>
              )}
            </div>
          </>
        ) : (
          <>
            {tx.isApproved ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                <Check className="h-4 w-4" aria-hidden="true" />
                {copy.swap.ladder.approved}
              </p>
            ) : null}
            <StickyAction>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                data-testid="swap-submit"
                onClick={() => {
                  void handlePrimary();
                }}
                disabled={!canSwap || isPreparing || tx.swapStage !== 'idle'}
                loading={tx.swapStage === 'wallet' || isPreparing}
              >
                {isPreparing ? copy.swap.quoteRefreshing : swapLabel}
              </Button>
            </StickyAction>
          </>
        )}

        {tx.watch.hash !== null ? <TxWatchCard watch={tx.watch} onResubmit={tx.resubmit} /> : null}

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[11px] leading-5 text-muted">{copy.swap.ladder.note}</span>
          <Link to="/" className={TEXT_LINK}>
            {copy.swap.states.backHome}
          </Link>
        </div>
      </section>

      {advancedEntries.length > 0 ? (
        <SwapTechnicalDetails entries={advancedEntries} summary={copy.swap.advanced.summary} />
      ) : null}
    </div>
  );
}
