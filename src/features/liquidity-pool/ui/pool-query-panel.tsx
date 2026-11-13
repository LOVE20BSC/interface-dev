import { useState } from 'react';
import { copy } from '@/shared/config/copy-pages';
import { formatPercent, formatRate, formatTokenAmount, shortenAddress } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { sharePercent } from '@/features/liquidity-pool/lib/liquidity-math';
import type { PoolStateResult } from '@/features/liquidity-pool/model/use-pool-state';
import type { LiquidityToken } from '@/features/liquidity-pool/lib/liquidity-types';

export interface PoolQueryPanelProps {
  readonly token: LiquidityToken;
  readonly native: LiquidityToken;
  readonly pool: PoolStateResult;
  readonly onGoAdd: () => void;
}

/**
 * 社区流动性查询：只看不改。
 *
 * 没有池子时明确说「这个代币还没有流动性池」，并把「去添加」作为下一步；有池子时
 * 展示交易对地址、两侧储备、流动性凭证总量、我的占比与双向价格（价格方向可切换，
 * 数字都来自储备，标「≈」）。
 */
export function PoolQueryPanel({ token, native, pool, onGoAdd }: PoolQueryPanelProps) {
  const [direction, setDirection] = useState<'tokenPerNative' | 'nativePerToken'>('tokenPerNative');

  if (pool.isLoading && pool.snapshot === undefined) {
    return (
      <div className="space-y-3 rounded-3xl border border-line bg-surface p-5 shadow-soft">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full rounded-2xl" />
        <Skeleton className="h-10 w-full rounded-2xl" />
      </div>
    );
  }

  if (pool.isError) {
    return (
      <Card>
        <CardTitle>{copy.liquidity.states.readFailed}</CardTitle>
        <CardDescription>{copy.liquidity.add.quoteErrorBody}</CardDescription>
        <Button variant="secondary" size="md" className="mt-4" onClick={pool.refetch}>
          {copy.liquidity.states.retry}
        </Button>
      </Card>
    );
  }

  const snapshot = pool.snapshot;
  const reserves = pool.reserves;
  const hasPool = snapshot !== undefined && pool.hasLiquidity && reserves !== undefined;

  if (!hasPool) {
    return (
      <Card data-testid="liquidity-query-empty">
        <CardTitle>{copy.liquidity.query.emptyTitle}</CardTitle>
        <CardDescription>{copy.liquidity.query.emptyBody}</CardDescription>
        <Button variant="primary" size="md" className="mt-4 w-full sm:w-auto" onClick={onGoAdd}>
          {copy.liquidity.query.emptyAdd}
        </Button>
      </Card>
    );
  }

  const reserveToken = reserves.reserveToken;
  const reserveNative = reserves.reserveNative;
  const share = sharePercent(snapshot.lpBalance, snapshot.totalSupply);
  const tokenPerNative = formatRate(
    reserveToken,
    reserveNative,
    native.decimals,
    token.decimals,
  );
  const nativePerToken = formatRate(
    reserveNative,
    reserveToken,
    token.decimals,
    native.decimals,
  );
  const priceText =
    direction === 'tokenPerNative'
      ? copy.liquidity.query.priceValue(native.symbol, tokenPerNative, token.symbol)
      : copy.liquidity.query.priceValue(token.symbol, nativePerToken, native.symbol);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
        <p className="text-sm font-semibold text-foreground">{copy.liquidity.query.title}</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted">{copy.liquidity.query.pairLabel}</dt>
            <dd className="min-w-0 text-right" data-testid="liquidity-query-pair">
              <span className="break-all font-mono text-[11px] leading-5 text-foreground">
                {snapshot.pairAddress}
              </span>
              <span className="ml-1 text-[11px] text-muted">
                {shortenAddress(snapshot.pairAddress, 6, 4)}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{copy.liquidity.query.reserveLabel(token.symbol)}</dt>
            <dd className="font-medium text-foreground" data-testid="liquidity-query-reserve-token">
              {formatTokenAmount(reserveToken, token.decimals)} {token.symbol}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{copy.liquidity.query.reserveLabel(native.symbol)}</dt>
            <dd className="font-medium text-foreground" data-testid="liquidity-query-reserve-native">
              {formatTokenAmount(reserveNative, native.decimals)} {native.symbol}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{copy.liquidity.query.supplyLabel}</dt>
            <dd className="font-medium text-foreground" data-testid="liquidity-query-supply">
              {formatTokenAmount(snapshot.totalSupply, 18)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{copy.liquidity.query.myShareLabel}</dt>
            <dd className="font-medium text-foreground" data-testid="liquidity-query-share">
              {share === undefined || share === 0
                ? copy.liquidity.query.none
                : `${formatPercent(share)}%`}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground" data-testid="liquidity-query-price">
            {priceText}
          </p>
          <Button
            variant="secondary"
            size="sm"
            data-testid="liquidity-query-price-toggle"
            onClick={() =>
              setDirection((current) =>
                current === 'tokenPerNative' ? 'nativePerToken' : 'tokenPerNative',
              )
            }
          >
            {copy.liquidity.query.priceDirection}
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-muted">{copy.liquidity.query.priceHint}</p>
      </div>
    </div>
  );
}
