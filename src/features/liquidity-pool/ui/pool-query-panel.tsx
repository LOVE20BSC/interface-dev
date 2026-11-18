import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { isHexAddress } from '@/config/deployments/types';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatPercent, formatRate, formatTokenAmount } from '@/shared/lib/format';
import { ArrowDownUp } from '@/shared/ui/icons';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { CopyableAddress } from '@/shared/ui/copyable-address';
import { Skeleton } from '@/shared/ui/skeleton';
import { TokenPicker, type TokenPickerGroup, type TokenPickerItem } from '@/shared/ui/token-picker';
import {
  addressLpPosition,
  type AddressLpPosition,
} from '@/features/liquidity-pool/lib/liquidity-math';
import type { LiquidityToken } from '@/features/liquidity-pool/lib/liquidity-types';
import { usePairBalance } from '@/features/liquidity-pool/model/use-pair-balance';
import type { LiquidityCatalog } from '@/features/liquidity-pool/model/use-liquidity-catalog';
import type { PoolStateResult } from '@/features/liquidity-pool/model/use-pool-state';

export interface PoolQueryPanelProps {
  /** 交易对里的社区代币一侧（「基础代币」；来自 Launch 目录或自定义地址）。 */
  readonly token: LiquidityToken;
  /** 目标代币 = 包装原生币（Router.WETH() 一侧；元数据未就绪时显示 `—`，不臆造符号）。 */
  readonly target: LiquidityToken | undefined;
  readonly pool: PoolStateResult;
  readonly catalog: LiquidityCatalog;
  readonly isConnected: boolean;
  /** 选社区代币即换池子：整页的 token 状态由页面持有。 */
  readonly onSelectToken: (token: LiquidityToken) => void;
}

/** pair 的 LP 凭证精度固定 18（Uniswap V2 `UniswapV2ERC20.decimals`）。 */
const LP_DECIMALS = 18;
const EMPTY_CELL = copy.liquidity.query.none;
/** 价格用 6 位小数再裁掉尾零：反向价格常常很小（1 社区代币 = 0.0005 WETH）。 */
const RATE_OPTIONS = { maxFractionDigits: 6 } as const;

const ROW = 'flex items-start justify-between gap-3 text-sm';
const CARD = 'p-5';

/**
 * 社区流动性查询（owner 2026-11-16：布局与交互对齐旧库 LOVE20TKM
 * `components/Dex/LiquidityQuery.tsx`，并支持查询任意地址）。
 *
 * 四块，顺序与旧库一致：
 * 1. 选择交易对：左「社区代币」选择器（Launch 目录）/ 右「目标代币」只读包装原生币；
 *    下方居中的「流动性凭证地址」可点击复制。
 * 2. 交易对统计：凭证总数量、两侧总数量、价格行 + 方向切换；loading `加载中…`、
 *    无池 `交易对不存在`。
 * 3. 查询地址：输入 + 提交（查询 / 重新查询 / 查询中…）+ 重置；未连接提示；
 *    已连接时默认填当前钱包地址并自动查一次。
 * 4. 查询结果：该地址凭证数量与份额、按储备比例折算的可兑换两币数量；
 *    无池 / 该地址没有 LP / 读取失败各有独立态。
 *
 * 读链只有三个标准 view（`pair.balanceOf(addr)` / `pair.totalSupply()` /
 * `pair.getReserves()`），纯 `eth_call`：**未连接钱包也能查任意地址**，不签任何交易。
 * 储备与 `totalSupply` 复用页面的 `usePoolState` 快照，查询卡与统计卡永远同源。
 */
export function PoolQueryPanel({
  token,
  target,
  pool,
  catalog,
  isConnected,
  onSelectToken,
}: PoolQueryPanelProps) {
  const { address: account } = useAccount();
  const [priceTargetToBase, setPriceTargetToBase] = useState(true);
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState<`0x${string}` | undefined>(undefined);
  /** 默认地址只在「第一次拿到钱包地址」时填一次：手改 / 重置之后不再覆盖。 */
  const defaultFilled = useRef(false);

  useEffect(() => {
    if (defaultFilled.current || account === undefined) return;
    defaultFilled.current = true;
    setInput(account);
    setSubmitted(account);
  }, [account]);

  const targetSymbol = target?.symbol ?? EMPTY_CELL;
  const targetDecimals = target?.decimals;

  const trimmed = input.trim();
  const isValidAddress = isHexAddress(trimmed);
  const addressError =
    trimmed.length > 0 && !isValidAddress ? copy.liquidity.query.addressInvalid : undefined;

  const {
    balance,
    isLoading: balanceLoading,
    isError: balanceError,
    refetch: refetchBalance,
  } = usePairBalance(pool.pairAddress, submitted);

  const snapshot = pool.snapshot;
  const reserves = pool.reserves;
  const hasPool =
    snapshot !== undefined &&
    pool.hasLiquidity &&
    snapshot.totalSupply > 0n &&
    reserves !== undefined;

  const position = useMemo((): AddressLpPosition | undefined => {
    if (balance === undefined || snapshot === undefined || reserves === undefined) return undefined;
    return addressLpPosition(
      balance,
      snapshot.totalSupply,
      reserves.reserveToken,
      reserves.reserveNative,
    );
  }, [balance, reserves, snapshot]);

  const queryLoading =
    submitted !== undefined && (pool.isLoading || (balanceLoading && !balanceError));

  // ── 交易对统计（第 2 块）的数值 ─────────────────────────────────────────
  // 价格行沿用旧库方向：默认 1 包装原生币 = X 社区代币，箭头切到反向。元数据未就绪时显示 `—`。
  const price = useMemo(() => {
    if (reserves === undefined || targetDecimals === undefined) {
      return { current: EMPTY_CELL, reverse: EMPTY_CELL };
    }
    return {
      current: formatRate(
        reserves.reserveToken,
        reserves.reserveNative,
        targetDecimals,
        token.decimals,
        RATE_OPTIONS,
      ),
      reverse: formatRate(
        reserves.reserveNative,
        reserves.reserveToken,
        token.decimals,
        targetDecimals,
        RATE_OPTIONS,
      ),
    };
  }, [reserves, targetDecimals, token.decimals]);

  // ── 选择交易对：TokenPicker 的数据面 ────────────────────────────────────
  const tokenByKey = useMemo(() => {
    const map = new Map<string, LiquidityToken>();
    const add = (entry: LiquidityToken) => {
      if (entry.address === undefined) return;
      map.set(entry.address.toLowerCase(), entry);
    };
    add(token);
    for (const entry of catalog.communityTokens) add(entry);
    for (const entry of catalog.searchResults) add(entry);
    if (catalog.custom.token !== undefined) add(catalog.custom.token);
    return map;
  }, [catalog.communityTokens, catalog.custom.token, catalog.searchResults, token]);

  const toItem = (entry: LiquidityToken): TokenPickerItem => {
    const key = entry.address?.toLowerCase() ?? entry.symbol;
    return {
      key,
      symbol: entry.symbol,
      ...(entry.kind === 'custom' ? { badge: copy.liquidity.customBadge } : {}),
    };
  };

  const baseItems = useMemo(() => {
    const seen = new Set<string>();
    const items: TokenPickerItem[] = [];
    const push = (entry: LiquidityToken) => {
      const key = entry.address?.toLowerCase() ?? entry.symbol;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        key,
        symbol: entry.symbol,
        ...(entry.kind === 'custom' ? { badge: copy.liquidity.customBadge } : {}),
      });
    };
    push(token);
    for (const entry of catalog.communityTokens) push(entry);
    if (catalog.custom.token !== undefined) push(catalog.custom.token);
    return items;
  }, [catalog.communityTokens, catalog.custom.token, token]);

  const groups: readonly TokenPickerGroup[] = [
    {
      key: 'community',
      label: copy.liquidity.query.baseLabel,
      items: baseItems,
      ...(baseItems.length === 0 ? { emptyLabel: copy.liquidity.query.noCommunityTokens } : {}),
    },
  ];

  const selectedItem = useMemo(
    (): TokenPickerItem => ({
      key: token.address?.toLowerCase() ?? token.symbol,
      symbol: token.symbol,
    }),
    [token.address, token.symbol],
  );

  const handleSelect = (item: TokenPickerItem) => {
    const entry = tokenByKey.get(item.key);
    if (entry !== undefined) onSelectToken(entry);
  };

  // ── 查询地址（第 3 块）的提交态 ─────────────────────────────────────────
  const submitLabel = queryLoading
    ? copy.liquidity.query.submitting
    : submitted !== undefined && trimmed.toLowerCase() === submitted.toLowerCase()
      ? copy.liquidity.query.resubmit
      : copy.liquidity.query.submit;

  const runQuery = () => {
    if (!isValidAddress) return;
    setSubmitted(trimmed as `0x${string}`);
    // 「查询 / 重新查询」都必须真的重读一次链：同值 setSubmitted 不会触发 hook 重取，
    // 所以池子与凭证余额在这里无条件 refetch（用户点它就是要新数据）。
    pool.refetch();
    refetchBalance();
  };

  const resetQuery = () => {
    setInput('');
    setSubmitted(undefined);
  };

  return (
    <div className="space-y-4">
      {/* ① 选择交易对 */}
      <Card className={CARD}>
        <p className="text-sm font-semibold text-foreground">{copy.liquidity.query.pairTitle}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-[11px] leading-4 text-muted">
              {copy.liquidity.query.baseLabel}
            </p>
            <TokenPicker
              optionTestIdPrefix="liquidity-query"
              triggerTestId="liquidity-query-base"
              triggerAriaLabel={copy.liquidity.query.pickerTitle}
              labels={{
                title: copy.liquidity.query.pickerTitle,
                searchPlaceholder: copy.liquidity.query.searchPlaceholder,
                searchHint: copy.liquidity.query.searchHint,
                searchEmpty: copy.liquidity.query.searchEmpty,
                searchLoading: copy.liquidity.query.searchLoading,
                loadMore: copy.liquidity.query.loadMore,
              }}
              groups={groups}
              searchResults={catalog.searchResults.map(toItem)}
              searchResultsGroupKey="community"
              searchStatus={catalog.searchStatus}
              search={catalog.search}
              onSearchChange={catalog.setSearch}
              selected={selectedItem}
              onSelect={handleSelect}
              hasMore={catalog.hasMore}
              onLoadMore={catalog.loadMore}
              isLoading={catalog.isLoading}
              triggerClassName="w-full justify-between"
            />
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[11px] leading-4 text-muted">
              {copy.liquidity.query.targetLabel}
            </p>
            <div
              data-testid="liquidity-query-target"
              className="flex h-10 items-center rounded-2xl border border-line bg-elevated px-3 text-sm font-semibold text-foreground"
            >
              {targetSymbol}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 border-t border-line pt-3">
          <span className="whitespace-nowrap text-xs text-muted">
            {copy.liquidity.query.lpAddressLabel}
          </span>
          {pool.pairAddress !== undefined ? (
            <CopyableAddress
              address={pool.pairAddress}
              label={copy.liquidity.query.lpAddressLabel}
              testId="liquidity-query-pair"
            />
          ) : (
            <span className="text-xs text-muted" data-testid="liquidity-query-pair-missing">
              {copy.liquidity.query.lpAddressMissing}
            </span>
          )}
        </div>
      </Card>

      {/* ② 交易对统计 */}
      <Card className={CARD}>
        <p className="text-center text-sm font-semibold text-foreground">
          {copy.liquidity.query.statsTitle}
        </p>
        {pool.isLoading && snapshot === undefined ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Skeleton className="h-4 w-4 rounded-full" />
            <span>{copy.liquidity.query.statsLoading}</span>
          </div>
        ) : pool.isError ? (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-muted">{copy.liquidity.states.readFailed}</p>
            <Button
              variant="secondary"
              size="sm"
              data-testid="liquidity-query-stats-retry"
              onClick={pool.refetch}
            >
              {copy.liquidity.query.retry}
            </Button>
          </div>
        ) : !hasPool || reserves === undefined || snapshot === undefined ? (
          <p
            className="mt-3 text-center text-sm text-muted"
            data-testid="liquidity-query-stats-empty"
          >
            {copy.liquidity.query.statsEmpty}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <dl className="space-y-2">
              <div className={ROW}>
                <dt className="text-muted">{copy.liquidity.query.statsLpTotal}</dt>
                <dd className="font-medium text-foreground" data-testid="liquidity-query-supply">
                  {formatTokenAmount(snapshot.totalSupply, LP_DECIMALS)}
                </dd>
              </div>
              <div className={ROW}>
                <dt className="text-muted">{copy.liquidity.query.statsTotal(token.symbol)}</dt>
                <dd
                  className="font-medium text-foreground"
                  data-testid="liquidity-query-total-token"
                >
                  {formatTokenAmount(reserves.reserveToken, token.decimals)}
                </dd>
              </div>
              <div className={ROW}>
                <dt className="text-muted">{copy.liquidity.query.statsTotal(targetSymbol)}</dt>
                <dd
                  className="font-medium text-foreground"
                  data-testid="liquidity-query-total-target"
                >
                  {targetDecimals === undefined
                    ? EMPTY_CELL
                    : formatTokenAmount(reserves.reserveNative, targetDecimals)}
                </dd>
              </div>
            </dl>
            <div className="flex items-center gap-2 border-t border-line pt-3">
              <p className="text-sm text-muted" data-testid="liquidity-query-price">
                {priceTargetToBase
                  ? copy.liquidity.query.price(targetSymbol, price.current, token.symbol)
                  : copy.liquidity.query.price(token.symbol, price.reverse, targetSymbol)}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                data-testid="liquidity-query-price-toggle"
                aria-label={copy.liquidity.query.priceToggle}
                title={copy.liquidity.query.priceToggle}
                onClick={() => setPriceTargetToBase((current) => !current)}
              >
                <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ③ 查询地址 */}
      <Card className={CARD}>
        <label
          htmlFor="liquidity-query-address"
          className="text-base font-semibold text-foreground"
        >
          {copy.liquidity.query.addressLabel}
        </label>
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            runQuery();
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="liquidity-query-address"
              data-testid="liquidity-query-address"
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={copy.liquidity.query.addressPlaceholder}
              className={cn(
                'h-11 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3 font-mono text-sm text-foreground outline-none',
                'placeholder:font-sans placeholder:text-muted focus:border-brand-strong/40 focus:ring-2 focus:ring-brand-strong/20',
              )}
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                size="md"
                data-testid="liquidity-query-submit"
                disabled={!isValidAddress || queryLoading}
              >
                {submitLabel}
              </Button>
              {submitted !== undefined ? (
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  data-testid="liquidity-query-reset"
                  onClick={resetQuery}
                >
                  {copy.liquidity.query.reset}
                </Button>
              ) : null}
            </div>
          </div>
          {addressError !== undefined ? (
            <p
              className="mt-1.5 text-[11px] leading-4 text-danger-strong"
              data-testid="liquidity-query-address-error"
            >
              {addressError}
            </p>
          ) : null}
          {!isConnected ? (
            <p
              className="mt-1.5 text-[11px] leading-4 text-warning"
              data-testid="liquidity-query-disconnected"
            >
              {copy.liquidity.query.disconnectedHint}
            </p>
          ) : null}
        </form>
      </Card>

      {/* ④ 查询结果 */}
      {submitted === undefined ? null : (
        <Card className={CARD} data-testid="liquidity-query-result">
          {pool.isError || balanceError ? (
            <div className="space-y-2">
              <p className="text-sm text-muted">{copy.liquidity.query.readFailed}</p>
              <Button
                variant="secondary"
                size="sm"
                data-testid="liquidity-query-result-retry"
                onClick={() => {
                  pool.refetch();
                  refetchBalance();
                }}
              >
                {copy.liquidity.query.retry}
              </Button>
            </div>
          ) : pool.isLoading && snapshot === undefined ? (
            <p
              className="text-center text-sm text-muted"
              data-testid="liquidity-query-result-loading"
            >
              {copy.liquidity.query.submitting}
            </p>
          ) : !hasPool ? (
            <div className="text-center" data-testid="liquidity-query-empty">
              <p className="text-sm font-medium text-foreground">
                {copy.liquidity.query.noPoolTitle}
              </p>
              <p className="mt-1 text-sm text-muted">
                {copy.liquidity.query.noPoolBody(token.symbol, targetSymbol)}
              </p>
            </div>
          ) : queryLoading || position === undefined ? (
            <p
              className="text-center text-sm text-muted"
              data-testid="liquidity-query-result-loading"
            >
              {copy.liquidity.query.submitting}
            </p>
          ) : position.lpAmount === 0n ? (
            <p className="text-center text-sm text-muted" data-testid="liquidity-query-no-lp">
              {copy.liquidity.query.noLp}
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {copy.liquidity.query.resultLpTitle}
                </p>
                <dl className="mt-2 space-y-2">
                  <div className={ROW}>
                    <dt className="text-muted">{copy.liquidity.query.resultLpAmount}</dt>
                    <dd className="font-medium text-foreground" data-testid="liquidity-query-lp">
                      {formatTokenAmount(position.lpAmount, LP_DECIMALS)}
                    </dd>
                  </div>
                  <div className={ROW}>
                    <dt className="text-muted">{copy.liquidity.query.resultShare}</dt>
                    <dd className="font-medium text-foreground" data-testid="liquidity-query-share">
                      {position.sharePercent === undefined
                        ? EMPTY_CELL
                        : `${formatPercent(position.sharePercent)}%`}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="border-t border-line pt-4">
                <p className="text-sm font-semibold text-foreground">
                  {copy.liquidity.query.resultConvertibleTitle}
                </p>
                <dl className="mt-2 space-y-2">
                  <div className={ROW}>
                    <dt className="text-muted">{token.symbol}</dt>
                    <dd
                      className="font-medium text-foreground"
                      data-testid="liquidity-query-convertible-token"
                    >
                      {formatTokenAmount(position.amountToken, token.decimals)}
                    </dd>
                  </div>
                  <div className={ROW}>
                    <dt className="text-muted">{targetSymbol}</dt>
                    <dd
                      className="font-medium text-foreground"
                      data-testid="liquidity-query-convertible-target"
                    >
                      {targetDecimals === undefined
                        ? EMPTY_CELL
                        : formatTokenAmount(position.amountNative, targetDecimals)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
