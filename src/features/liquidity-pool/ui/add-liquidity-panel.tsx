import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { love20HubAbi, uniswapV2Router02Abi } from '@/config/abis';
import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatTokenAmount, formatUnits } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { StickyAction } from '@/shared/ui/sticky-action';
import { TxWatchCard } from '@/shared/ui/tx-watch-card';
import {
  applySlippageDown,
  planDualAdd,
} from '@/features/liquidity-pool/lib/liquidity-math';
import {
  deadlineFromNow,
  NATIVE_GAS_RESERVE_WEI,
  parseAmount,
  percentToBps,
} from '@/features/liquidity-pool/lib/liquidity-form';
import { formatRate } from '@/shared/lib/format';
import { useHubQuote } from '@/features/liquidity-pool/model/use-hub-quote';
import {
  useNativeBalance,
  useTokenAllowance,
  useTokenBalance,
} from '@/features/liquidity-pool/model/use-liquidity-reads';
import { useLiquidityTransaction } from '@/features/liquidity-pool/model/use-liquidity-transaction';
import type { PoolStateResult } from '@/features/liquidity-pool/model/use-pool-state';
import type { LiquidityToken } from '@/features/liquidity-pool/lib/liquidity-types';
import { LiquidityReceiptSheet } from '@/features/liquidity-pool/ui/liquidity-receipt';
import { LiquiditySettings } from '@/features/liquidity-pool/ui/liquidity-settings';

type AddMode = 'single' | 'dual';

export interface AddLiquidityPanelProps {
  readonly token: LiquidityToken;
  readonly wrapped: LiquidityToken | undefined;
  readonly native: LiquidityToken;
  readonly pool: PoolStateResult;
  readonly slippagePercent: number;
  readonly customSlippage: string;
  readonly customSlippageError: string | undefined;
  readonly onSelectSlippagePreset: (percent: number) => void;
  readonly onCustomSlippageChange: (value: string) => void;
  readonly isConnected: boolean;
}

const CARD = 'rounded-3xl border border-line bg-surface p-5 shadow-soft';
const INPUT =
  'mt-1.5 h-12 w-full rounded-2xl border border-line bg-elevated px-3 text-xl font-semibold text-foreground outline-none placeholder:text-muted/40 focus:border-brand/40 focus:ring-2 focus:ring-brand/20';

export function AddLiquidityPanel(props: AddLiquidityPanelProps) {
  const {
    token,
    wrapped,
    native,
    pool,
    slippagePercent,
    customSlippage,
    customSlippageError,
    onSelectSlippagePreset,
    onCustomSlippageChange,
    isConnected,
  } = props;
  const { address: account } = useAccount();
  const hub = configuredAddress('hub');
  const router = configuredAddress('router');

  const [mode, setMode] = useState<AddMode>('single');
  const [tokenInput, setTokenInput] = useState('');
  const [nativeInput, setNativeInput] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const tokenBalance = useTokenBalance(token, account);
  const nativeBalance = useNativeBalance(account);
  const tokenAllowanceHub = useTokenAllowance(token.address, account, hub);
  const tokenAllowanceRouter = useTokenAllowance(token.address, account, router);

  const refetchAll = () => {
    pool.refetch();
    tokenBalance.refetch();
    nativeBalance.refetch();
    tokenAllowanceHub.refetch();
    tokenAllowanceRouter.refetch();
  };
  const tx = useLiquidityTransaction(refetchAll);
  const refetchRef = useRef(refetchAll);
  useEffect(() => {
    refetchRef.current = refetchAll;
  });

  const singleConfigured = hub !== undefined;
  const singleAvailable = singleConfigured && pool.hasLiquidity;
  const effectiveMode: AddMode = mode === 'single' && !singleAvailable ? 'dual' : mode;
  const fallbackReason = (() => {
    if (mode !== 'single' || singleAvailable) return undefined;
    return singleConfigured ? copy.liquidity.add.fallbackEmptyPool : copy.liquidity.add.hubMissing;
  })();

  const parsedToken = parseAmount(tokenInput, token.decimals);
  const parsedNative = parseAmount(nativeInput, native.decimals);
  const tokenAmount = parsedToken.kind === 'ok' ? parsedToken.value : 0n;
  const nativeAmount = parsedNative.kind === 'ok' ? parsedNative.value : 0n;

  const reserves = pool.reserves;
  const reserveToken = reserves?.reserveToken ?? 0n;
  const reserveNative = reserves?.reserveNative ?? 0n;
  const totalSupply = pool.snapshot?.totalSupply ?? 0n;

  const quote = useHubQuote({
    hub,
    tokenAddress: token.address,
    amountTokenDesired: effectiveMode === 'single' ? tokenAmount : 0n,
    amountNativeDesired: effectiveMode === 'single' ? nativeAmount : 0n,
    enabled:
      effectiveMode === 'single' &&
      singleAvailable &&
      token.address !== undefined &&
      (tokenAmount > 0n || nativeAmount > 0n),
  });

  const plan = planDualAdd(reserveToken, reserveNative, totalSupply, tokenAmount, nativeAmount);

  const bps = percentToBps(slippagePercent);
  const minToken =
    effectiveMode === 'single' && quote.data !== undefined
      ? applySlippageDown(quote.data.usableAmountA, bps)
      : applySlippageDown(plan.amountA, bps);
  const minNative =
    effectiveMode === 'single' && quote.data !== undefined
      ? applySlippageDown(quote.data.usableAmountB, bps)
      : applySlippageDown(plan.amountB, bps);

  const firstMint = effectiveMode === 'dual' && plan.firstMint;
  const firstMintPrice =
    firstMint && tokenAmount > 0n && nativeAmount > 0n
      ? formatRate(tokenAmount, nativeAmount, native.decimals, token.decimals)
      : undefined;

  const nativeAvailable =
    nativeBalance.value === undefined
      ? undefined
      : nativeBalance.value > NATIVE_GAS_RESERVE_WEI
        ? nativeBalance.value - NATIVE_GAS_RESERVE_WEI
        : 0n;

  const amountError = (() => {
    if (parsedToken.kind === 'invalid' || parsedNative.kind === 'invalid') {
      return copy.liquidity.add.amountInvalid;
    }
    if (parsedToken.kind === 'too-precise') {
      return copy.liquidity.add.amountTooPrecise(parsedToken.digits);
    }
    if (parsedNative.kind === 'too-precise') {
      return copy.liquidity.add.amountTooPrecise(parsedNative.digits);
    }
    if (effectiveMode === 'dual' && tokenAmount === 0n && nativeAmount === 0n) return null;
    if (
      tokenBalance.value !== undefined &&
      tokenBalance.value < tokenAmount
    ) {
      return copy.liquidity.add.insufficient(
        token.symbol,
        formatTokenAmount(tokenAmount - tokenBalance.value, token.decimals),
      );
    }
    if (nativeAvailable !== undefined && nativeAvailable < nativeAmount) {
      return copy.liquidity.add.insufficient(
        native.symbol,
        formatTokenAmount(nativeAmount - nativeAvailable, native.decimals),
      );
    }
    return null;
  })();

  const requiredTokenAmount = effectiveMode === 'single' ? tokenAmount : plan.amountA;
  const spender =
    effectiveMode === 'single' ? hub : router;
  const allowance = effectiveMode === 'single' ? tokenAllowanceHub : tokenAllowanceRouter;
  const needsApproval =
    token.address !== undefined &&
    spender !== undefined &&
    requiredTokenAmount > 0n &&
    (allowance.value === undefined || allowance.value < requiredTokenAmount);

  // 授权成功后把额度/余额重新读一遍，主按钮才会从「允许使用」切到「确认添加」。
  const approvedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (tx.approvedKey === null || tx.approvedKey === approvedKeyRef.current) return;
    approvedKeyRef.current = tx.approvedKey;
    refetchRef.current();
  }, [tx.approvedKey]);

  const quoteReady =
    effectiveMode === 'single'
      ? quote.data !== undefined && quote.data.expectedLiquidity > 0n
      : plan.liquidity > 0n && plan.amountA > 0n && plan.amountB > 0n;

  const bothSidesRequired = effectiveMode === 'dual';
  const hasInput = tokenAmount > 0n || nativeAmount > 0n;
  const canSubmit =
    isConnected &&
    !pool.isLoading &&
    hasInput &&
    amountError === null &&
    quoteReady &&
    (!bothSidesRequired || (tokenAmount > 0n && nativeAmount > 0n)) &&
    (effectiveMode === 'single' ? token.address !== undefined && (tokenAmount > 0n || nativeAmount > 0n) : true) &&
    (effectiveMode === 'single' ? nativeAmount === 0n || nativeBalance.value !== undefined : true) &&
    !pool.isError &&
    tx.stage === 'idle' &&
    tx.approveStage === 'idle' &&
    tx.receipt === null;

  const setTokenMax = () => {
    if (tokenBalance.value === undefined) return;
    setTokenInput(formatUnits(tokenBalance.value, token.decimals));
    setSubmitError(null);
  };
  const setNativeMax = () => {
    if (nativeAvailable === undefined) return;
    setNativeInput(formatUnits(nativeAvailable, native.decimals));
    setSubmitError(null);
  };

  const handleApprove = async () => {
    if (token.address === undefined || spender === undefined) return;
    setSubmitError(null);
    await tx.approve({
      tokenAddress: token.address,
      kind: 'erc20',
      spender,
      amount: requiredTokenAmount,
    });
  };

  const handleSubmit = async () => {
    if (account === undefined) return;
    setSubmitError(null);
    const deadline = deadlineFromNow();
    if (effectiveMode === 'single' && hub !== undefined) {
      if (nativeAmount > 0n) {
        await tx.run(
          {
            address: hub,
            abi: love20HubAbi,
            functionName: 'addLiquidityWithNative',
            args: [
              {
                tokenAddress: token.address,
                amountTokenDesired: tokenAmount,
                amountTokenMin: minToken,
                amountNativeMin: minNative,
                to: account,
                deadline,
              },
            ],
            value: nativeAmount,
          },
          {
            title: copy.liquidity.add.receiptTitle,
            detail: copy.liquidity.add.receiptRefreshHint,
          },
        );
        return;
      }
      if (token.address !== undefined && wrapped?.address !== undefined) {
        await tx.run(
          {
            address: hub,
            abi: love20HubAbi,
            functionName: 'addLiquidityWithToken',
            args: [
              {
                tokenA: token.address,
                tokenB: wrapped.address,
                amountADesired: tokenAmount,
                amountBDesired: 0n,
                amountAMin: minToken,
                amountBMin: minNative,
                to: account,
                deadline,
              },
            ],
          },
          {
            title: copy.liquidity.add.receiptTitle,
            detail: copy.liquidity.add.receiptRefreshHint,
          },
        );
      }
      return;
    }

    if (router !== undefined && token.address !== undefined) {
      await tx.run(
        {
          address: router,
          abi: uniswapV2Router02Abi,
          functionName: 'addLiquidityETH',
          args: [token.address, plan.amountA, minToken, minNative, account, deadline],
          value: plan.amountB,
        },
        {
          title: copy.liquidity.add.receiptTitle,
          detail: copy.liquidity.add.receiptRefreshHint,
        },
      );
    }
  };

  const errorMessage = submitError ?? tx.error?.message ?? null;

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">{copy.liquidity.add.modeLabel}</span>
          <div className="flex rounded-full border border-line bg-elevated p-0.5 text-xs">
            {(['single', 'dual'] as const).map((value) => (
              <button
                key={value}
                type="button"
                data-testid={`liquidity-mode-${value}`}
                onClick={() => {
                  setMode(value);
                  setSubmitError(null);
                }}
                disabled={value === 'single' && !singleConfigured}
                aria-pressed={effectiveMode === value}
                className={cn(
                  'rounded-full px-3 py-1.5 font-medium transition-colors disabled:opacity-50',
                  effectiveMode === value
                    ? 'bg-surface text-brand-strong shadow-soft'
                    : 'text-muted hover:text-foreground',
                )}
              >
                {value === 'single' ? copy.liquidity.add.modeSingle : copy.liquidity.add.modeDual}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-muted">
          {effectiveMode === 'single' ? copy.liquidity.add.modeSingleHint : copy.liquidity.add.modeDualHint}
        </p>

        {fallbackReason !== undefined || (effectiveMode === 'single' && quote.isError) ? (
          <p
            className="mt-2 rounded-xl border border-warning/20 bg-warning-soft/50 p-2 text-[11px] leading-4 text-warning"
            data-testid="liquidity-fallback-note"
          >
            {fallbackReason !== undefined
              ? `${copy.liquidity.add.fallbackTitle}${fallbackReason}`
              : copy.liquidity.add.quoteFailed}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="liquidity-token-amount" className="text-xs font-medium text-muted">
                {copy.liquidity.add.amountTokenLabel} · {token.symbol}
              </label>
              <span className="text-[11px] leading-4 text-muted" data-testid="liquidity-balance-token">
                {tokenBalance.isLoading
                  ? copy.liquidity.balanceLoading
                  : `${copy.liquidity.balanceLabel(token.symbol)} ${formatTokenAmount(tokenBalance.value, token.decimals)}`}
              </span>
            </div>
            <div className="relative">
              <input
                id="liquidity-token-amount"
                data-testid="liquidity-token-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={tokenInput}
                onChange={(event) => {
                  setTokenInput(event.target.value);
                  setSubmitError(null);
                  tx.clearError();
                }}
                placeholder={copy.liquidity.add.amountPlaceholder}
                className={INPUT}
              />
              <button
                type="button"
                onClick={setTokenMax}
                disabled={tokenBalance.value === undefined}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-brand-strong hover:bg-brand-soft disabled:opacity-50"
              >
                {copy.liquidity.add.max}
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="liquidity-native-amount" className="text-xs font-medium text-muted">
                {copy.liquidity.add.amountNativeLabel(native.symbol)}
              </label>
              <span className="text-[11px] leading-4 text-muted" data-testid="liquidity-balance-native">
                {nativeBalance.isLoading
                  ? copy.liquidity.balanceLoading
                  : `${copy.liquidity.balanceLabel(native.symbol)} ${formatTokenAmount(nativeBalance.value, native.decimals)}`}
              </span>
            </div>
            <div className="relative">
              <input
                id="liquidity-native-amount"
                data-testid="liquidity-native-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={nativeInput}
                onChange={(event) => {
                  setNativeInput(event.target.value);
                  setSubmitError(null);
                  tx.clearError();
                }}
                placeholder={copy.liquidity.add.amountPlaceholder}
                className={INPUT}
              />
              <button
                type="button"
                onClick={setNativeMax}
                disabled={nativeAvailable === undefined}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-brand-strong hover:bg-brand-soft disabled:opacity-50"
              >
                {copy.liquidity.add.max}
              </button>
            </div>
          </div>

          {effectiveMode === 'single' ? (
            <p className="text-[11px] leading-4 text-muted">{copy.liquidity.add.singleHint}</p>
          ) : (
            <p className="text-[11px] leading-4 text-muted">
              {firstMint ? copy.liquidity.add.firstMintHint : copy.liquidity.add.dualHint}
            </p>
          )}
          {nativeAmount > 0n ? (
            <p className="text-[11px] leading-4 text-muted">
              {copy.liquidity.add.nativeGasNote(native.symbol)}
            </p>
          ) : null}
          {amountError !== null ? (
            <p className="text-xs leading-5 text-danger-strong" data-testid="liquidity-amount-error">
              {amountError}
            </p>
          ) : null}
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <LiquiditySettings
            slippagePercent={slippagePercent}
            customSlippage={customSlippage}
            customSlippageError={customSlippageError}
            onSelectPreset={onSelectSlippagePreset}
            onCustomChange={onCustomSlippageChange}
          />
        </div>
      </div>

      <div className={CARD} data-testid="liquidity-quote">
        <p className="text-sm font-semibold text-foreground">{copy.liquidity.add.quoteTitle}</p>
        {effectiveMode === 'single' ? (
          quote.isLoading ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
          ) : quote.data !== undefined ? (
            <div className="mt-2 space-y-1.5 text-sm leading-6">
              {quote.data.willSwap ? (
                <p className="text-muted" data-testid="liquidity-quote-swap">
                  {copy.liquidity.add.quoteSwap(
                    formatTokenAmount(
                      quote.data.amountToSwap,
                      quote.data.swapTokenIn.toLowerCase() === token.address?.toLowerCase()
                        ? token.decimals
                        : native.decimals,
                    ),
                    quote.data.swapTokenIn.toLowerCase() === token.address?.toLowerCase()
                      ? token.symbol
                      : native.symbol,
                    formatTokenAmount(
                      quote.data.amountOutFromSwap,
                      quote.data.swapTokenOut.toLowerCase() === token.address?.toLowerCase()
                        ? token.decimals
                        : native.decimals,
                    ),
                    quote.data.swapTokenOut.toLowerCase() === token.address?.toLowerCase()
                      ? token.symbol
                      : native.symbol,
                  )}
                </p>
              ) : (
                <p className="text-muted">{copy.liquidity.add.quoteNoSwap}</p>
              )}
              <p className="text-foreground" data-testid="liquidity-quote-prepared">
                {copy.liquidity.add.quotePrepared(
                  formatTokenAmount(quote.data.preparedAmountA, token.decimals),
                  token.symbol,
                  formatTokenAmount(quote.data.preparedAmountB, native.decimals),
                  native.symbol,
                )}
              </p>
              <p className="text-foreground" data-testid="liquidity-quote-liquidity">
                {copy.liquidity.add.quoteLiquidity(formatTokenAmount(quote.data.expectedLiquidity, 18))}
              </p>
              <p className="text-muted" data-testid="liquidity-quote-min">
                {copy.liquidity.add.quoteMin(
                  formatTokenAmount(minToken, token.decimals),
                  token.symbol,
                  formatTokenAmount(minNative, native.decimals),
                  native.symbol,
                )}
              </p>
            </div>
          ) : quote.isError ? (
            <div className="mt-2">
              <p className="text-sm text-danger-strong">{copy.liquidity.add.quoteErrorTitle}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{copy.liquidity.add.quoteErrorBody}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => quote.refetch()}
              >
                {copy.liquidity.add.quoteErrorRetry}
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted" data-testid="liquidity-quote-hint">
              {effectiveMode === 'single' ? copy.liquidity.add.singleHint : copy.liquidity.add.dualHint}
            </p>
          )
        ) : (
          <div className="mt-2 space-y-1.5 text-sm leading-6">
            {firstMint && firstMintPrice !== undefined ? (
              <p className="text-muted" data-testid="liquidity-quote-first-mint">
                {copy.liquidity.add.quoteFirstMint(firstMintPrice, token.symbol, native.symbol)}
              </p>
            ) : null}
            <p className="text-foreground" data-testid="liquidity-quote-prepared">
              {copy.liquidity.add.quotePrepared(
                formatTokenAmount(plan.amountA, token.decimals),
                token.symbol,
                formatTokenAmount(plan.amountB, native.decimals),
                native.symbol,
              )}
            </p>
            <p className="text-foreground" data-testid="liquidity-quote-liquidity">
              {copy.liquidity.add.quoteLiquidity(formatTokenAmount(plan.liquidity, 18))}
            </p>
            <p className="text-muted" data-testid="liquidity-quote-min">
              {copy.liquidity.add.quoteMin(
                formatTokenAmount(minToken, token.decimals),
                token.symbol,
                formatTokenAmount(minNative, native.decimals),
                native.symbol,
              )}
            </p>
          </div>
        )}
        {effectiveMode === 'single' && quote.data !== undefined && nativeAmount > 0n ? (
          <p className="mt-2 text-[11px] leading-4 text-muted">
            {copy.liquidity.add.maxNativeNote(
              formatTokenAmount(NATIVE_GAS_RESERVE_WEI, native.decimals),
              native.symbol,
            )}
          </p>
        ) : null}
      </div>

      {errorMessage !== null ? (
        <div
          role="alert"
          data-testid="liquidity-add-error"
          className="rounded-2xl border border-danger/20 bg-danger-soft/50 p-3 text-sm leading-6 text-danger-strong"
        >
          <p>{errorMessage}</p>
          {tx.error?.kind === 'nonce' ? (
            <Button variant="secondary" size="sm" className="mt-2" onClick={tx.resubmit}>
              {copy.txWatch.actions.resubmit}
            </Button>
          ) : null}
        </div>
      ) : null}

      {needsApproval ? (
        <>
          <StickyAction>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              data-testid="liquidity-add-approve"
              onClick={() => {
                void handleApprove();
              }}
              disabled={tx.approveStage !== 'idle' || amountError !== null}
              loading={tx.approveStage === 'wallet'}
            >
              {copy.liquidity.add.approveToken(token.symbol)}
            </Button>
          </StickyAction>
          <p className="text-xs leading-5 text-muted">{copy.liquidity.add.approveNote}</p>
          {tx.approveWatch.hash !== null ? <TxWatchCard watch={tx.approveWatch} /> : null}
        </>
      ) : (
        <>
          <StickyAction>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              data-testid="liquidity-add-submit"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={!canSubmit}
              loading={tx.stage === 'wallet'}
            >
              {tx.stage === 'pending' ? copy.liquidity.add.submitting : copy.liquidity.add.submit}
            </Button>
          </StickyAction>
          {allowance.value !== undefined && requiredTokenAmount > 0n ? (
            <p className="flex items-center gap-1.5 text-xs leading-5 text-success">
              {copy.liquidity.add.approvedToken(token.symbol)}
            </p>
          ) : null}
          {tx.watch.hash !== null ? <TxWatchCard watch={tx.watch} onResubmit={tx.resubmit} /> : null}
        </>
      )}

      <LiquidityReceiptSheet
        record={tx.receipt}
        onDismiss={tx.clearReceipt}
        onAgain={tx.clearReceipt}
      />

      {effectiveMode === 'single' && quote.isError ? (
        <button
          type="button"
          onClick={() => setMode('dual')}
          className="w-full rounded-2xl border border-line px-3 py-2 text-xs font-medium text-brand-strong hover:bg-elevated"
        >
          {copy.liquidity.add.modeDual}
        </button>
      ) : null}
    </div>
  );
}

