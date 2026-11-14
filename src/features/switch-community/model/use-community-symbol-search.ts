import { useEffect, useMemo } from 'react';
import { configuredAddress } from '@/config/networks';
import { useSwapCatalog } from '@/features/swap-token/model/use-swap-catalog';

export type CommunitySearchStatus = 'idle' | 'loading' | 'found' | 'empty' | 'error';

export interface CommunitySymbolMatch {
  readonly symbol: string;
  /** True when the symbol matched exactly (Launch.tokenAddressBySymbol), not by prefix. */
  readonly exact: boolean;
}

export interface CommunitySymbolSearch {
  readonly query: string;
  readonly matches: readonly CommunitySymbolMatch[];
  readonly status: CommunitySearchStatus;
}

/**
 * 社区切换的 symbol 搜索 (owner 2026-11-14 09:30: 「可以支持输入代币的symbol来直接
 * 切换」). Reuses the Launch catalog the swap token picker already owns instead
 * of reading the registry twice: the exact lookup (`tokenAddressBySymbol`)
 * resolves any full symbol, and the pages already loaded give prefix matches.
 * No extra polling — the catalog reads once per search value / menu open.
 */
export function useCommunitySymbolSearch(query: string): CommunitySymbolSearch {
  const launchAddress = configuredAddress('launch');
  const catalog = useSwapCatalog(launchAddress);
  const { setSearch } = catalog;
  const trimmed = query.trim();

  useEffect(() => {
    setSearch(trimmed);
  }, [setSearch, trimmed]);

  const matches = useMemo(() => {
    if (trimmed.length === 0) return [] as CommunitySymbolMatch[];
    const lower = trimmed.toLowerCase();
    const seen = new Set<string>();
    const result: CommunitySymbolMatch[] = [];
    const exact = catalog.searchResults[0];
    if (exact !== undefined) {
      seen.add(exact.symbol.toLowerCase());
      result.push({ symbol: exact.symbol, exact: true });
    }
    for (const token of catalog.communityTokens) {
      const key = token.symbol.toLowerCase();
      if (seen.has(key) || !key.startsWith(lower)) continue;
      seen.add(key);
      result.push({ symbol: token.symbol, exact: false });
    }
    // The current community stays listed (a no-op pick closes the menu instead of
    // silently pretending to switch); it is not forced to the top.
    return result;
  }, [catalog.communityTokens, catalog.searchResults, trimmed]);

  const status: CommunitySearchStatus = (() => {
    if (trimmed.length === 0) return 'idle';
    if (catalog.searchStatus === 'error') return 'error';
    if (catalog.searchStatus === 'loading') return 'loading';
    if (matches.length > 0) return 'found';
    if (catalog.searchStatus === 'empty') return 'empty';
    if (catalog.isLoading) return 'loading';
    return 'empty';
  })();

  return { query: trimmed, matches, status };
}
