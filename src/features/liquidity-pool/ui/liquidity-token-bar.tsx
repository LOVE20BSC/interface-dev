import { copy } from '@/shared/config/copy-pages';
import type { LiquidityCatalog } from '@/features/liquidity-pool/model/use-liquidity-catalog';
import type { LiquidityToken } from '@/features/liquidity-pool/lib/liquidity-types';
import { TokenPicker } from '@/shared/ui/token-picker';
import { Button } from '@/shared/ui/button';

/**
 * 社区代币选择器（共享 token picker）+ 自定义代币地址。
 *
 * 加池、我的流动性、社区查询三块共用同一个选择结果：换代币就是换一个池子。
 * 自定义地址和「代币转账」同一口径：先看字节码，再读 symbol/decimals，读不到
 * 就给人话错误，不把未验证的地址当 token 用。
 */
export interface LiquidityTokenBarProps {
  readonly catalog: LiquidityCatalog;
  readonly selected: LiquidityToken | undefined;
  readonly onSelect: (token: LiquidityToken) => void;
}

export function LiquidityTokenBar({ catalog, selected, onSelect }: LiquidityTokenBarProps) {
  const options = catalog.communityTokens.flatMap((token) =>
    token.address !== undefined ? [{ token }] : [],
  );
  const searchResults = catalog.searchResults.flatMap((token) =>
    token.address !== undefined ? [{ token }] : [],
  );

  const custom = catalog.custom;
  const customError = (() => {
    if (customInputIsAddress(catalog.customInput) && custom.status === 'idle') {
      return copy.liquidity.customInvalid;
    }
    if (custom.status === 'no-code') return copy.liquidity.customNoCode;
    if (custom.status === 'unreadable') return copy.liquidity.customUnreadable;
    return undefined;
  })();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted">{copy.liquidity.tokenLabel}</span>
        <TokenPicker
          optionTestIdPrefix="liquidity-token"
          triggerTestId="liquidity-token"
          triggerAriaLabel={copy.liquidity.tokenSheetTitle}
          labels={{
            title: copy.liquidity.tokenSheetTitle,
            searchPlaceholder: copy.liquidity.searchPlaceholder,
            searchHint: copy.liquidity.searchHint,
            searchEmpty: copy.liquidity.searchEmpty,
            searchLoading: copy.liquidity.searchLoading,
            loadMore: copy.liquidity.loadMore,
          }}
          groups={[
            {
              key: 'community',
              label: copy.liquidity.groupCommunity,
              items: options.map(({ token }) => ({
                key: token.address?.toLowerCase() ?? token.symbol,
                symbol: token.symbol,
              })),
              emptyLabel: copy.liquidity.noCommunityTokens,
            },
          ]}
          searchResults={searchResults.map(({ token }) => ({
            key: token.address?.toLowerCase() ?? token.symbol,
            symbol: token.symbol,
            ...(token.kind === 'custom' ? { badge: copy.liquidity.customBadge } : {}),
          }))}
          searchResultsGroupKey="community"
          searchStatus={catalog.searchStatus}
          search={catalog.search}
          onSearchChange={catalog.setSearch}
          selected={
            selected !== undefined
              ? {
                  key: selected.address?.toLowerCase() ?? selected.symbol,
                  symbol: selected.symbol,
                  ...(selected.kind === 'custom' ? { badge: copy.liquidity.customBadge } : {}),
                }
              : undefined
          }
          onSelect={(item) => {
            const match = [...options, ...searchResults].find(
              ({ token }) => (token.address?.toLowerCase() ?? token.symbol) === item.key,
            );
            if (match !== undefined) onSelect(match.token);
          }}
          hasMore={catalog.hasMore}
          onLoadMore={catalog.loadMore}
          isLoading={catalog.isLoading}
        />
      </div>

      <div className="rounded-2xl border border-line bg-elevated p-3">
        <label htmlFor="liquidity-custom-address" className="text-xs font-medium text-muted">
          {copy.liquidity.customTitle}
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id="liquidity-custom-address"
            data-testid="liquidity-custom-address"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={catalog.customInput}
            onChange={(event) => catalog.setCustomInput(event.target.value)}
            placeholder={copy.liquidity.customPlaceholder}
            className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-surface px-2.5 font-mono text-xs text-foreground outline-none placeholder:font-sans placeholder:text-muted/70 focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
          />
          <Button
            variant="secondary"
            size="sm"
            data-testid="liquidity-custom-add"
            onClick={() => catalog.addCustomToken(catalog.customInput)}
            disabled={catalog.customInput.trim().length === 0}
          >
            {copy.liquidity.customAdd}
          </Button>
        </div>
        {custom.status === 'checking' ? (
          <p className="mt-1.5 text-[11px] leading-4 text-muted">
            {copy.liquidity.customChecking}
          </p>
        ) : null}
        {customError !== undefined ? (
          <p
            className="mt-1.5 text-[11px] leading-4 text-danger-strong"
            data-testid="liquidity-custom-error"
          >
            {customError}
          </p>
        ) : null}
        {custom.status === 'ok' && custom.token !== undefined ? (
          <p className="mt-1.5 text-[11px] leading-4 text-success">
            {custom.token.symbol} · {copy.liquidity.decimalsLabel(String(custom.token.decimals))}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** 只有「长得像地址」的输入才提示格式错误，普通搜索词不打断。 */
function customInputIsAddress(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && /^0x/i.test(trimmed) && trimmed.length !== 42;
}
