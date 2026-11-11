import { useMemo, useState } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { launchAbi, love20TokenAbi } from '@/config/abis';
import { isConfiguredAddress, type HexAddress } from '@/config/networks';
import type { SwapToken } from '@/features/swap-token/lib/swap-types';

export const SWAP_TOKEN_PAGE_SIZE = 20;

export type SwapTokenSearchStatus = 'idle' | 'loading' | 'found' | 'empty' | 'error';

export interface SwapCatalog {
  readonly communityTokens: readonly SwapToken[];
  readonly searchResults: readonly SwapToken[];
  readonly searchStatus: SwapTokenSearchStatus;
  readonly search: string;
  readonly setSearch: (value: string) => void;
  readonly total: bigint | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly refetch: () => void;
}

interface TokenMetadata {
  readonly symbol: string | undefined;
  readonly decimals: number | undefined;
}

function uniqueAddresses(addresses: readonly HexAddress[]): HexAddress[] {
  const seen = new Set<string>();
  const result: HexAddress[] = [];
  for (const address of addresses) {
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(address);
  }
  return result;
}

/**
 * Token universe = environment native/wrapped (owned by the caller) plus the
 * on-chain Launch registry. No hardcoded community list: pages of 20 are read
 * through Launch.tokens, and the search box resolves an exact symbol through
 * Launch.tokenAddressBySymbol (UX spec §3.5).
 */
export function useSwapCatalog(launchAddress: HexAddress | undefined): SwapCatalog {
  const [pageCount, setPageCount] = useState(1);
  const [search, setSearch] = useState('');

  const pageContracts = useMemo(() => {
    if (launchAddress === undefined) return [];
    return Array.from({ length: pageCount }, (_, index) => ({
      address: launchAddress,
      abi: launchAbi,
      functionName: 'tokens' as const,
      args: [BigInt(index * SWAP_TOKEN_PAGE_SIZE), BigInt(SWAP_TOKEN_PAGE_SIZE), false] as const,
    }));
  }, [launchAddress, pageCount]);

  const pages = useReadContracts({
    contracts: pageContracts,
    query: { enabled: pageContracts.length > 0 },
  });

  const pageAddresses = useMemo(() => {
    const addresses: HexAddress[] = [];
    for (const page of pages.data ?? []) {
      if (page.status !== 'success' || !Array.isArray(page.result)) continue;
      const list = page.result[0];
      if (!Array.isArray(list)) continue;
      for (const address of list) {
        if (isConfiguredAddress(address)) addresses.push(address);
      }
    }
    return uniqueAddresses(addresses);
  }, [pages.data]);

  const total = useMemo(() => {
    for (const page of pages.data ?? []) {
      if (page.status === 'success' && Array.isArray(page.result)) {
        const count = page.result[1];
        if (typeof count === 'bigint') return count;
      }
    }
    return undefined;
  }, [pages.data]);

  const trimmedSearch = search.trim();
  const lookup = useReadContract({
    address: launchAddress,
    abi: launchAbi,
    functionName: 'tokenAddressBySymbol',
    args: [trimmedSearch],
    query: { enabled: launchAddress !== undefined && trimmedSearch.length > 0 },
  });

  const searchAddress =
    trimmedSearch.length > 0 && isConfiguredAddress(lookup.data) ? lookup.data : undefined;

  const metadataAddresses = useMemo(
    () =>
      uniqueAddresses([...pageAddresses, ...(searchAddress !== undefined ? [searchAddress] : [])]),
    [pageAddresses, searchAddress],
  );

  const metadataContracts = useMemo(
    () =>
      metadataAddresses.flatMap((address) => [
        { address, abi: love20TokenAbi, functionName: 'symbol' as const },
        { address, abi: love20TokenAbi, functionName: 'decimals' as const },
      ]),
    [metadataAddresses],
  );

  const metadata = useReadContracts({
    contracts: metadataContracts,
    query: { enabled: metadataContracts.length > 0 },
  });

  const metadataByAddress = useMemo(() => {
    const map = new Map<string, TokenMetadata>();
    metadataAddresses.forEach((address, index) => {
      const symbolResult = metadata.data?.[index * 2];
      const decimalsResult = metadata.data?.[index * 2 + 1];
      map.set(address.toLowerCase(), {
        symbol:
          symbolResult?.status === 'success' &&
          typeof symbolResult.result === 'string' &&
          symbolResult.result.length > 0
            ? symbolResult.result
            : undefined,
        decimals:
          decimalsResult?.status === 'success' && typeof decimalsResult.result === 'number'
            ? decimalsResult.result
            : undefined,
      });
    });
    return map;
  }, [metadata.data, metadataAddresses]);

  const communityTokens = useMemo(
    () =>
      pageAddresses.flatMap((address): SwapToken[] => {
        const entry = metadataByAddress.get(address.toLowerCase());
        if (entry?.symbol === undefined) return [];
        return [
          {
            kind: 'community',
            address,
            symbol: entry.symbol,
            decimals: entry.decimals,
          },
        ];
      }),
    [metadataByAddress, pageAddresses],
  );

  const exactResult = useMemo((): SwapToken | undefined => {
    if (searchAddress === undefined) return undefined;
    const entry = metadataByAddress.get(searchAddress.toLowerCase());
    if (entry?.symbol === undefined) return undefined;
    return {
      kind: 'community',
      address: searchAddress,
      symbol: entry.symbol,
      decimals: entry.decimals,
    };
  }, [metadataByAddress, searchAddress]);

  const searchStatus: SwapTokenSearchStatus = (() => {
    if (trimmedSearch.length === 0) return 'idle';
    if (launchAddress === undefined) return 'error';
    if (lookup.isLoading) return 'loading';
    if (lookup.isError) return 'error';
    if (searchAddress === undefined) return lookup.isSuccess ? 'empty' : 'loading';
    if (exactResult !== undefined) return 'found';
    return metadata.isLoading ? 'loading' : 'empty';
  })();

  const isError =
    pages.isError ||
    metadata.isError ||
    metadata.data?.some((entry) => entry.status === 'failure') === true;

  return {
    communityTokens,
    searchResults: exactResult !== undefined ? [exactResult] : [],
    searchStatus,
    search,
    setSearch,
    total,
    isLoading: launchAddress !== undefined && (pages.isLoading || metadata.isLoading),
    isError,
    hasMore: total !== undefined && BigInt(pageAddresses.length) < total,
    loadMore: () => {
      if (total === undefined || BigInt(pageAddresses.length) >= total) return;
      setPageCount((value) => value + 1);
    },
    refetch: () => {
      void pages.refetch();
      void metadata.refetch();
      void lookup.refetch();
    },
  };
}
