import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { copy } from '@/shared/config/copy-pages';
import {
  formatBpsPercent,
  formatPercent,
  formatRate,
  formatTokenAmount,
} from '@/shared/lib/format';
import { SLIPPAGE_PRESETS } from '@/features/swap-token/lib/swap-amount';
import type { SwapRoute, SwapToken } from '@/features/swap-token/lib/swap-types';
import { Skeleton } from '@/shared/ui/skeleton';

export interface SwapInfoProps {
  readonly from: SwapToken;
  readonly to: SwapToken;
  readonly route: SwapRoute;
  readonly amountIn: bigint | undefined;
  readonly amountOut: bigint | undefined;
  readonly minOut: bigint | undefined;
  readonly slippagePercent: number;
  readonly slippageMode: 'preset' | 'custom';
  readonly customSlippage: string;
  readonly customSlippageError: string | undefined;
  readonly onSelectSlippage: (percent: number, mode: 'preset' | 'custom') => void;
  readonly onCustomSlippageChange: (value: string) => void;
  readonly priceImpactBps: number | undefined;
  readonly remainingSeconds: number;
  readonly isExpired: boolean;
  readonly isFetching: boolean;
  readonly isLoading: boolean;
}

const ACTIVE_PILL = 'border-brand bg-brand-soft text-brand-strong';
const IDLE_PILL = 'border-line bg-surface text-foreground hover:bg-elevated';

function Row({
  label,
  children,
  valueClassName,
  testId,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly valueClassName?: string;
  readonly testId?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs leading-5 text-muted">{label}</dt>
      <dd
        className={cn('min-w-0 text-right text-xs leading-5 text-foreground', valueClassName)}
        {...(testId !== undefined ? { 'data-testid': testId } : {})}
      >
        {children}
      </dd>
    </div>
  );
}

/**
 * The page's single information block. The path row is always present, even for
 * one pair, because the spec treats it as orientation rather than decoration.
 * The fee percentage is not invented: the pair ABI exposes no fee field, so the
 * row states 以链上费率为准.
 */
export function SwapInfo(props: SwapInfoProps) {
  const {
    from,
    to,
    route,
    amountIn,
    amountOut,
    minOut,
    slippagePercent,
    slippageMode,
    customSlippage,
    customSlippageError,
    onSelectSlippage,
    onCustomSlippageChange,
    priceImpactBps,
    remainingSeconds,
    isExpired,
    isFetching,
    isLoading,
  } = props;

  const isWrap = route.kind === 'wrap' || route.kind === 'unwrap';
  const rate =
    amountOut !== undefined && amountIn !== undefined && amountIn > 0n
      ? formatRate(amountOut, amountIn, from.decimals ?? 0, to.decimals ?? 0)
      : undefined;
  const minOutText = minOut !== undefined ? formatTokenAmount(minOut, to.decimals) : undefined;
  const impactVisible = priceImpactBps !== undefined && priceImpactBps > 100;
  const impactHigh = priceImpactBps !== undefined && priceImpactBps > 1000;

  return (
    <dl className="space-y-2.5 rounded-2xl border border-line bg-elevated p-3">
      <div className="text-xs leading-5 text-foreground" data-testid="swap-rate">
        {isWrap ? (
          copy.swap.rateWrap(from.symbol, to.symbol)
        ) : rate !== undefined ? (
          copy.swap.rate(from.symbol, rate, to.symbol)
        ) : isLoading ? (
          <Skeleton className="h-3.5 w-40" />
        ) : (
          copy.common.unknown
        )}
      </div>

      <Row
        label={copy.swap.pathLabel}
        testId="swap-path"
        valueClassName="font-mono text-[11px] leading-5 text-muted"
      >
        {route.displayPath.join(' → ')}
      </Row>

      <Row label={copy.swap.minOutLabel} testId="swap-min-out" valueClassName="font-medium">
        {isWrap ? (
          amountIn !== undefined ? (
            `${formatTokenAmount(amountIn, to.decimals)} ${to.symbol}`
          ) : (
            copy.common.unknown
          )
        ) : minOutText !== undefined ? (
          `${minOutText} ${to.symbol}`
        ) : isLoading ? (
          <Skeleton className="ml-auto h-3.5 w-20" />
        ) : (
          copy.common.unknown
        )}
      </Row>

      {!isWrap ? (
        <div className="pt-0.5">
          <div className="flex items-center justify-between gap-3">
            <span className="shrink-0 whitespace-nowrap text-xs text-muted">
              {copy.swap.slippageLabel}
            </span>
            <div
              className="flex flex-wrap justify-end gap-1.5"
              role="group"
              aria-label={copy.swap.slippageLabel}
            >
              {SLIPPAGE_PRESETS.map((preset) => {
                const active = slippageMode === 'preset' && slippagePercent === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={active}
                    data-testid={`swap-slippage-${preset}`}
                    onClick={() => onSelectSlippage(preset, 'preset')}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                      active ? ACTIVE_PILL : IDLE_PILL,
                    )}
                  >
                    {formatPercent(preset, { minimumFractionDigits: 1 })}%
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={slippageMode === 'custom'}
                onClick={() => onSelectSlippage(slippagePercent, 'custom')}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  slippageMode === 'custom' ? ACTIVE_PILL : IDLE_PILL,
                )}
              >
                {copy.swap.slippageCustom}
              </button>
            </div>
          </div>
          {slippageMode === 'custom' ? (
            <div className="mt-2">
              <label className="flex items-center justify-end gap-1 text-xs text-muted">
                <input
                  type="text"
                  inputMode="decimal"
                  value={customSlippage}
                  onChange={(event) => onCustomSlippageChange(event.target.value)}
                  placeholder={copy.swap.slippageCustomPlaceholder}
                  aria-label={copy.swap.slippageLabel}
                  className="h-8 w-20 rounded-lg border border-line bg-surface px-2 text-right text-xs text-foreground outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
                />
                <span>{copy.swap.slippageCustomUnit}</span>
              </label>
              {customSlippageError !== undefined ? (
                <p className="mt-1 text-right text-[11px] leading-4 text-danger-strong">
                  {customSlippageError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <Row label={copy.swap.feeLabel} testId="swap-fee">
        {isWrap ? copy.swap.feeNone : copy.swap.feeChain}
      </Row>

      {impactVisible && priceImpactBps !== undefined ? (
        <Row
          label={copy.swap.priceImpactLabel}
          testId="swap-price-impact"
          valueClassName={
            impactHigh ? 'font-medium text-danger-strong' : 'font-medium text-warning'
          }
        >
          {copy.swap.priceImpactValue(formatBpsPercent(priceImpactBps))}
        </Row>
      ) : null}

      {!isWrap && amountOut !== undefined ? (
        <div className="flex items-center justify-between gap-3 border-t border-line/70 pt-2">
          <span className="text-[11px] leading-5 text-muted">
            {isExpired ? copy.swap.expired : null}
          </span>
          <span className="text-[11px] leading-5 text-muted" data-testid="swap-quote-freshness">
            {isExpired
              ? null
              : isFetching
                ? copy.swap.quoteRefreshing
                : copy.swap.freshnessCountdown(String(remainingSeconds))}
          </span>
        </div>
      ) : null}
    </dl>
  );
}
