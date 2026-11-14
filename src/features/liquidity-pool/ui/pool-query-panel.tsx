import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatRate, formatTokenAmount } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { CopyableAddress } from '@/shared/ui/copyable-address';
import { Skeleton } from '@/shared/ui/skeleton';
import type { PoolStateResult } from '@/features/liquidity-pool/model/use-pool-state';
import type { LiquidityToken } from '@/features/liquidity-pool/lib/liquidity-types';

export interface PoolQueryPanelProps {
  readonly token: LiquidityToken;
  readonly native: LiquidityToken;
  readonly pool: PoolStateResult;
  readonly onGoAdd: () => void;
}

const CARD = 'rounded-3xl border border-line bg-surface p-5 shadow-soft';
const ROW = 'flex items-start justify-between gap-3';

/**
 * 社区流动性查询：只看不改，**只给全局数据**（owner 2026-11-14）。
 *
 * 两张卡：① 池子总览（交易对地址可点击复制 + 流动性凭证总量）；② 储备与价格
 * （两侧储备 + 双向价格同时列出）。个人数据（我的占比 / 我的凭证）不再出现在这里
 * ——那是「我的流动性」的事。没有池子时明确说「这个代币还没有流动性池」。
 *
 * 交易对地址走全局的 `shared/ui/copyable-address`（owner 2026-11-14「所有地址都能点击
 * 复制」）：整段地址显示、点击复制、`title` 是完整地址，与其它页面同一个组件。
 */
export function PoolQueryPanel({ token, native, pool, onGoAdd }: PoolQueryPanelProps) {
  if (pool.isLoading && pool.snapshot === undefined) {
    return (
      <div className={CARD}>
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full rounded-2xl" />
          <Skeleton className="h-10 w-full rounded-2xl" />
        </div>
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
  // 价格用 6 位小数再裁掉尾零：反向价格常常很小（1 TestX ≈ 0.0001 ETH），
  // 2 位会被截成 0。
  const RATE_OPTIONS = { maxFractionDigits: 6 } as const;
  const tokenPerNative = formatRate(
    reserveToken,
    reserveNative,
    native.decimals,
    token.decimals,
    RATE_OPTIONS,
  );
  const nativePerToken = formatRate(
    reserveNative,
    reserveToken,
    token.decimals,
    native.decimals,
    RATE_OPTIONS,
  );

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <p className="text-sm font-semibold text-foreground">{copy.liquidity.query.title}</p>
        <dl className="mt-3 space-y-3 text-sm">
          <div className={cn(ROW, 'flex-wrap sm:flex-nowrap')}>
            <dt className="shrink-0 text-muted">{copy.liquidity.query.pairLabel}</dt>
            <dd className="min-w-0 text-right">
              <CopyableAddress
                address={snapshot.pairAddress}
                label={copy.liquidity.query.pairLabel}
                display="full"
                testId="liquidity-query-pair"
              />
            </dd>
          </div>
          <div className={ROW}>
            <dt className="text-muted">{copy.liquidity.query.supplyLabel}</dt>
            <dd className="font-medium text-foreground" data-testid="liquidity-query-supply">
              {formatTokenAmount(snapshot.totalSupply, 18)}
            </dd>
          </div>
        </dl>
      </div>

      <div className={CARD}>
        <p className="text-sm font-semibold text-foreground">{copy.liquidity.query.priceTitle}</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className={ROW}>
            <dt className="text-muted">{copy.liquidity.query.reserveLabel(token.symbol)}</dt>
            <dd className="font-medium text-foreground" data-testid="liquidity-query-reserve-token">
              {formatTokenAmount(reserveToken, token.decimals)} {token.symbol}
            </dd>
          </div>
          <div className={ROW}>
            <dt className="text-muted">{copy.liquidity.query.reserveLabel(native.symbol)}</dt>
            <dd
              className="font-medium text-foreground"
              data-testid="liquidity-query-reserve-native"
            >
              {formatTokenAmount(reserveNative, native.decimals)} {native.symbol}
            </dd>
          </div>
          <div className="space-y-1 border-t border-line pt-2">
            <p className="font-medium text-foreground" data-testid="liquidity-query-price">
              {copy.liquidity.query.priceValue(native.symbol, tokenPerNative, token.symbol)}
            </p>
            <p className="font-medium text-foreground" data-testid="liquidity-query-price-reverse">
              {copy.liquidity.query.priceValue(token.symbol, nativePerToken, native.symbol)}
            </p>
            <p className="text-[11px] leading-4 text-muted">{copy.liquidity.query.priceHint}</p>
          </div>
        </dl>
      </div>
    </div>
  );
}
