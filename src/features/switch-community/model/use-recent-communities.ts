import { useCallback, useEffect, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { configuredAddress, ZERO_ADDRESS } from '@/config/networks';
import { cache, type CacheScope } from '@/shared/lib/cache';

export interface RecentCommunity {
  readonly symbol: string;
  readonly at: number;
}

const BUSINESS_KEY = 'recentCommunities';
const MAX_RECENTS = 4;

function isRecentCommunity(value: unknown): value is RecentCommunity {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.symbol === 'string' &&
    record.symbol.length > 0 &&
    typeof record.at === 'number' &&
    Number.isFinite(record.at)
  );
}

/**
 * Recent communities are a convenience, not the source of truth: ?symbol= is.
 * They are scoped to the launch address and wallet and capped at 4.
 */
export function useRecentCommunities() {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const launchAddress =
    configuredAddress('launch') ?? configuredAddress('tokenAddress') ?? ZERO_ADDRESS;
  const [recent, setRecent] = useState<readonly RecentCommunity[]>([]);

  const scope: CacheScope = {
    chainId,
    contractAddress: launchAddress,
    wallet: account ?? ZERO_ADDRESS,
  };

  // Storage is an external system; this effect re-reads it when the
  // wallet/chain scope changes. The rule is suppressed at the two sync points.
  useEffect(() => {
    if (account === undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external storage sync
      setRecent([]);
      return;
    }
    const stored = cache.get<unknown>(scope, BUSINESS_KEY);
    if (!Array.isArray(stored)) {
      setRecent([]);
      return;
    }
    setRecent(stored.filter(isRecentCommunity).slice(0, MAX_RECENTS));
    // scope is derived from primitives; depend on them so the object identity
    // does not cause a re-read on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, chainId, launchAddress]);

  const record = useCallback(
    (symbol: string) => {
      if (account === undefined || symbol.length === 0) return;
      setRecent((previous) => {
        const next = [
          { symbol, at: Date.now() },
          ...previous.filter((entry) => entry.symbol !== symbol),
        ].slice(0, MAX_RECENTS);
        cache.set(scope, BUSINESS_KEY, next);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account, chainId, launchAddress],
  );

  return { recent, record };
}
