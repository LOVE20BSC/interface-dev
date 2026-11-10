import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DEFAULT_SYMBOL } from '@/config/networks';
import { useRecentCommunities } from '@/features/switch-community/model/use-recent-communities';

export interface CommunityContextValue {
  /** Always non-empty. Falls back to the address book's default symbol. */
  readonly symbol: string;
  /** True when the URL already carried ?symbol= (i.e. not seeded this render). */
  readonly fromUrl: boolean;
  /** Replaces ?symbol= in place, preserving every other query param. No reload. */
  readonly switchSymbol: (symbol: string) => void;
}

/**
 * `?symbol=` is the single source of truth for the current community token.
 * It is intentionally NOT persisted to localStorage (tkm's `_currentToken` did
 * that; ADR-0003 / UX spec reject it): refresh, share and back all read the URL.
 */
export function useCommunityContext(): CommunityContextValue {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSymbol = (searchParams.get('symbol') ?? '').trim();
  const symbol = rawSymbol.length > 0 ? rawSymbol : DEFAULT_SYMBOL;
  const { record } = useRecentCommunities();

  useEffect(() => {
    if (rawSymbol.length > 0) return;
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set('symbol', DEFAULT_SYMBOL);
        return next;
      },
      { replace: true },
    );
  }, [rawSymbol, setSearchParams]);

  const switchSymbol = useCallback(
    (nextSymbol: string) => {
      const trimmed = nextSymbol.trim();
      if (trimmed.length === 0 || trimmed === symbol) return;
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set('symbol', trimmed);
          return next;
        },
        { replace: true },
      );
      record(trimmed);
    },
    [record, setSearchParams, symbol],
  );

  return { symbol, fromUrl: rawSymbol.length > 0, switchSymbol };
}
