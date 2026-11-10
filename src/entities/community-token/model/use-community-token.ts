import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { launchAbi, love20TokenAbi } from '@/config/abis';
import {
  BRAND_FALLBACK,
  DEFAULT_SYMBOL,
  configuredAddress,
  isConfiguredAddress,
  type HexAddress,
} from '@/config/networks';

export type CommunityTokenStatus = 'ready' | 'loading' | 'unconfigured' | 'unknown' | 'error';

export interface CommunityToken {
  readonly status: CommunityTokenStatus;
  readonly address: HexAddress | undefined;
  /** On-chain name() when readable, otherwise the brand fallback (never faked data). */
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number | undefined;
  readonly isMetadataLoading: boolean;
  readonly metadataError: boolean;
  readonly refetch: () => void;
}

/**
 * Resolve the current community token:
 *   1. the address book's default token when ?symbol= names the genesis symbol;
 *   2. otherwise Launch.tokenAddressBySymbol(?symbol=);
 *   3. brand falls back to LOVE20 only when the chain cannot be read.
 *
 * A zero address from Launch means "unknown community", not "no data".
 */
export function useCommunityToken(symbol: string): CommunityToken {
  const defaultAddress = configuredAddress('tokenAddress');
  const launchAddress = configuredAddress('launch');
  const useDefault = symbol === DEFAULT_SYMBOL && defaultAddress !== undefined;

  const lookup = useReadContract({
    address: launchAddress,
    abi: launchAbi,
    functionName: 'tokenAddressBySymbol',
    args: [symbol],
    query: { enabled: !useDefault && launchAddress !== undefined },
  });

  const tokenAddress: HexAddress | undefined = useDefault
    ? defaultAddress
    : isConfiguredAddress(lookup.data)
      ? lookup.data
      : undefined;

  const metadataContracts = useMemo(() => {
    if (tokenAddress === undefined) return [];
    return [
      { address: tokenAddress, abi: love20TokenAbi, functionName: 'name' as const },
      { address: tokenAddress, abi: love20TokenAbi, functionName: 'symbol' as const },
      { address: tokenAddress, abi: love20TokenAbi, functionName: 'decimals' as const },
    ];
  }, [tokenAddress]);

  const metadataRead = useReadContracts({
    contracts: metadataContracts,
    query: { enabled: metadataContracts.length > 0 },
  });

  const refetch = () => {
    lookup.refetch();
    metadataRead.refetch();
  };

  const results = metadataRead.data;
  const nameResult = results?.[0];
  const symbolResult = results?.[1];
  const decimalsResult = results?.[2];
  const readName =
    nameResult?.status === 'success' && typeof nameResult.result === 'string'
      ? nameResult.result
      : undefined;
  const readSymbol =
    symbolResult?.status === 'success' && typeof symbolResult.result === 'string'
      ? symbolResult.result
      : undefined;
  const readDecimals =
    decimalsResult?.status === 'success' && typeof decimalsResult.result === 'number'
      ? decimalsResult.result
      : undefined;

  const isMetadataLoading = tokenAddress !== undefined && metadataRead.isLoading;

  const metadataError =
    tokenAddress !== undefined &&
    (metadataRead.isError ||
      nameResult?.status === 'failure' ||
      symbolResult?.status === 'failure' ||
      decimalsResult?.status === 'failure');

  let status: CommunityTokenStatus;
  if (tokenAddress !== undefined) {
    status = 'ready';
  } else if (symbol !== DEFAULT_SYMBOL && launchAddress === undefined) {
    status = 'unconfigured';
  } else if (lookup.isLoading) {
    status = 'loading';
  } else if (lookup.isError) {
    status = 'error';
  } else if (lookup.isSuccess && !isConfiguredAddress(lookup.data)) {
    status = 'unknown';
  } else {
    status = defaultAddress === undefined ? 'unconfigured' : 'unknown';
  }

  const name = readName !== undefined && readName.length > 0 ? readName : BRAND_FALLBACK.name;
  const chainSymbol = readSymbol !== undefined && readSymbol.length > 0 ? readSymbol : undefined;

  return {
    status,
    address: tokenAddress,
    name,
    symbol: chainSymbol ?? (symbol.length > 0 ? symbol : BRAND_FALLBACK.symbol),
    decimals: readDecimals,
    isMetadataLoading,
    metadataError,
    refetch,
  };
}
