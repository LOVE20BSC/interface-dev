import { useEffect, useRef, useState } from 'react';
import { useBlockNumber, useReadContract } from 'wagmi';
import { uniswapV2Router02Abi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy';
import { QUOTE_MAX_AGE_SECONDS } from '@/features/swap-token/lib/swap-amount';

export interface SwapQuote {
  readonly amountOut: bigint | undefined;
  readonly quotedAt: number | undefined;
  readonly ageSeconds: number;
  readonly remainingSeconds: number;
  readonly isExpired: boolean;
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly errorMessage: string | null;
  readonly refetch: () => Promise<bigint | undefined>;
}

export interface SwapQuoteInput {
  readonly router: HexAddress | undefined;
  readonly path: readonly HexAddress[] | undefined;
  readonly amountIn: bigint | undefined;
  readonly enabled: boolean;
}

/**
 * Router.getAmountsOut is the only quote. No AMM formula is reimplemented and no
 * fee ratio is assumed. Freshness is a 30s countdown refreshed on the next block
 * or expiry; once expired the primary action is disabled until fresh data lands.
 */
export function useSwapQuote(input: SwapQuoteInput): SwapQuote {
  const { router, path, amountIn, enabled } = input;
  const [now, setNow] = useState(() => Date.now());
  const watchBlocks = enabled && router !== undefined;
  const blockNumber = useBlockNumber({
    watch: watchBlocks,
    query: { enabled: watchBlocks },
  });
  const lastBlockRef = useRef<bigint | undefined>(undefined);
  const lastExpiryRef = useRef<number>(0);

  const read = useReadContract({
    address: router,
    abi: uniswapV2Router02Abi,
    functionName: 'getAmountsOut',
    args: amountIn !== undefined && path !== undefined ? [amountIn, [...path]] : undefined,
    query: {
      enabled: enabled && router !== undefined && path !== undefined && amountIn !== undefined,
    },
  });

  const amounts = Array.isArray(read.data) ? read.data : undefined;
  const amountOut =
    amounts !== undefined && path !== undefined && amounts.length === path.length
      ? amounts[amounts.length - 1]
      : undefined;
  const quotedAt =
    amountOut !== undefined && read.dataUpdatedAt > 0 ? read.dataUpdatedAt : undefined;

  /* eslint-disable react-hooks/set-state-in-effect -- display clock */
  useEffect(() => {
    if (quotedAt === undefined) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [quotedAt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const ageSeconds = quotedAt !== undefined ? Math.max(0, Math.floor((now - quotedAt) / 1000)) : 0;
  const isExpired = quotedAt !== undefined && ageSeconds >= QUOTE_MAX_AGE_SECONDS;
  const remainingSeconds =
    quotedAt !== undefined ? Math.max(0, QUOTE_MAX_AGE_SECONDS - ageSeconds) : 0;

  // A new block is a reason to refresh; no custom polling loop is started here.
  useEffect(() => {
    const current = blockNumber.data;
    if (current === undefined) return;
    if (lastBlockRef.current === undefined) {
      lastBlockRef.current = current;
      return;
    }
    if (lastBlockRef.current === current) return;
    lastBlockRef.current = current;
    if (quotedAt === undefined || read.isFetching) return;
    void read.refetch();
  }, [blockNumber.data, quotedAt, read]);

  // When the countdown reaches zero, try exactly once per quote revision.
  useEffect(() => {
    if (!isExpired || read.isFetching) return;
    if (lastExpiryRef.current === read.dataUpdatedAt) return;
    lastExpiryRef.current = read.dataUpdatedAt;
    void read.refetch();
  }, [isExpired, read]);

  return {
    amountOut,
    quotedAt,
    ageSeconds,
    remainingSeconds,
    isExpired,
    isLoading: enabled && read.isLoading,
    isFetching: read.isFetching,
    isError: enabled && read.isError,
    errorMessage: enabled && read.isError ? copy.swap.states.quoteErrorTitle : null,
    refetch: async () => {
      const result = await read.refetch();
      if (result.isError) return undefined;
      const value = Array.isArray(result.data) ? result.data[result.data.length - 1] : undefined;
      return typeof value === 'bigint' ? value : undefined;
    },
  };
}
