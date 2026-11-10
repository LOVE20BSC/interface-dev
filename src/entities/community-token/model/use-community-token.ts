import { useReadContract } from 'wagmi';
import { communityTokenAbi, launchAbi } from '@/config/abis';
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
 *   1. address book's default token for the default symbol;
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

  const nameRead = useReadContract({
    address: tokenAddress,
    abi: communityTokenAbi,
    functionName: 'name',
    query: { enabled: tokenAddress !== undefined },
  });
  const symbolRead = useReadContract({
    address: tokenAddress,
    abi: communityTokenAbi,
    functionName: 'symbol',
    query: { enabled: tokenAddress !== undefined },
  });
  const decimalsRead = useReadContract({
    address: tokenAddress,
    abi: communityTokenAbi,
    functionName: 'decimals',
    query: { enabled: tokenAddress !== undefined },
  });

  const refetch = () => {
    lookup.refetch();
    nameRead.refetch();
    symbolRead.refetch();
    decimalsRead.refetch();
  };

  const isMetadataLoading =
    tokenAddress !== undefined &&
    (nameRead.isLoading || symbolRead.isLoading || decimalsRead.isLoading);

  const metadataError =
    tokenAddress !== undefined && (nameRead.isError || symbolRead.isError || decimalsRead.isError);

  let status: CommunityTokenStatus;
  if (tokenAddress !== undefined) {
    status = 'ready';
  } else if (symbol !== DEFAULT_SYMBOL && launchAddress === undefined) {
    // Without Launch there is no way to resolve a non-default symbol.
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

  return {
    status,
    address: tokenAddress,
    name:
      nameRead.data !== undefined && nameRead.data.length > 0 ? nameRead.data : BRAND_FALLBACK.name,
    symbol:
      symbolRead.data !== undefined && symbolRead.data.length > 0
        ? symbolRead.data
        : symbol.length > 0
          ? symbol
          : DEFAULT_SYMBOL,
    decimals: decimalsRead.data,
    isMetadataLoading,
    metadataError,
    refetch,
  };
}
