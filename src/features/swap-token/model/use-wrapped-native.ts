import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { uniswapV2Router02Abi, weth9Abi } from '@/config/abis';
import { configuredAddress, isConfiguredAddress, type HexAddress } from '@/config/networks';
import type { SwapToken } from '@/features/swap-token/lib/swap-types';

export interface WrappedNative {
  readonly address: HexAddress | undefined;
  readonly symbol: string | undefined;
  readonly decimals: number | undefined;
  readonly token: SwapToken | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

/**
 * Router.WETH() is authoritative; the address book's weth entry is only a
 * bootstrap fallback so a cold read still renders without inventing an address.
 */
export function useWrappedNative(): WrappedNative {
  const router = configuredAddress('router');
  const configuredWeth = configuredAddress('weth');

  const routerWeth = useReadContract({
    address: router,
    abi: uniswapV2Router02Abi,
    functionName: 'WETH',
    query: { enabled: router !== undefined },
  });

  const address = isConfiguredAddress(routerWeth.data) ? routerWeth.data : configuredWeth;

  const metadataContracts = useMemo(() => {
    if (address === undefined) return [];
    return [
      { address, abi: weth9Abi, functionName: 'symbol' as const },
      { address, abi: weth9Abi, functionName: 'decimals' as const },
    ];
  }, [address]);

  const metadata = useReadContracts({
    contracts: metadataContracts,
    query: { enabled: metadataContracts.length > 0 },
  });

  const symbolResult = metadata.data?.[0];
  const decimalsResult = metadata.data?.[1];
  const symbol =
    symbolResult?.status === 'success' &&
    typeof symbolResult.result === 'string' &&
    symbolResult.result.length > 0
      ? symbolResult.result
      : undefined;
  const decimals =
    decimalsResult?.status === 'success' && typeof decimalsResult.result === 'number'
      ? decimalsResult.result
      : undefined;

  const token =
    address !== undefined && symbol !== undefined && decimals !== undefined
      ? ({ kind: 'wrapped', address, symbol, decimals } satisfies SwapToken)
      : undefined;

  const isError =
    routerWeth.isError ||
    metadata.isError ||
    symbolResult?.status === 'failure' ||
    decimalsResult?.status === 'failure';

  return {
    address,
    symbol,
    decimals,
    token,
    isLoading:
      address === undefined
        ? router === undefined || routerWeth.isLoading
        : metadata.isLoading || symbol === undefined || decimals === undefined,
    isError,
    refetch: () => {
      void routerWeth.refetch();
      void metadata.refetch();
    },
  };
}
