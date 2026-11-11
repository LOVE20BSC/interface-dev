import { useEffect, useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { useSearchParams } from 'react-router-dom';
import { launchAbi, love20TokenAbi } from '@/config/abis';
import {
  NETWORK,
  configuredAddress,
  isConfiguredAddress,
  type HexAddress,
} from '@/config/networks';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { swapTokenKey, type SwapToken } from '@/features/swap-token/lib/swap-types';
import type { WrappedNative } from './use-wrapped-native';

export type SwapPairStatus = 'loading' | 'ready' | 'invalid' | 'error';

export interface SwapPairState {
  readonly status: SwapPairStatus;
  readonly from: SwapToken | undefined;
  readonly to: SwapToken | undefined;
  /** Which side failed to resolve (invalid URL symbol), for 选择代币 recovery. */
  readonly unknownSide: 'from' | 'to' | undefined;
  readonly rawFrom: string;
  readonly rawTo: string;
  readonly selectFrom: (token: SwapToken) => void;
  readonly selectTo: (token: SwapToken) => void;
  readonly swapDirection: () => void;
}

interface SideResolution {
  readonly status: 'ready' | 'loading' | 'unknown' | 'error';
  readonly token: SwapToken | undefined;
}

interface LookupMetadata {
  readonly symbol: string | undefined;
  readonly decimals: number | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

type ReadResult = { readonly status?: string; readonly result?: unknown };

function metadataByAddress(
  addresses: readonly HexAddress[],
  results: readonly ReadResult[] | undefined,
  isLoading: boolean,
  isError: boolean,
): Map<string, LookupMetadata> {
  const map = new Map<string, LookupMetadata>();
  addresses.forEach((address, index) => {
    const symbolResult = results?.[index * 2];
    const decimalsResult = results?.[index * 2 + 1];
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
      isLoading,
      isError,
    });
  });
  return map;
}

function tokenFromMetadata(
  address: HexAddress,
  metadata: LookupMetadata | undefined,
): SideResolution {
  if (metadata === undefined) return { status: 'error', token: undefined };
  if (metadata.symbol !== undefined && metadata.decimals !== undefined) {
    return {
      status: 'ready',
      token: { kind: 'community', address, symbol: metadata.symbol, decimals: metadata.decimals },
    };
  }
  if (metadata.isLoading) return { status: 'loading', token: undefined };
  return { status: 'error', token: undefined };
}

/**
 * `?from` / `?to` are independent of `?symbol=` (§2.1). Missing values default
 * to the environment native coin and the current community token (falling back
 * to the genesis token), then are written back with `replace` so sharing the URL
 * reproduces the pair without adding history entries.
 */
export function useSwapPair(wrapped: WrappedNative): SwapPairState {
  const [searchParams, setSearchParams] = useSearchParams();
  const launchAddress = configuredAddress('launch');
  const rawFrom = (searchParams.get('from') ?? '').trim();
  const rawTo = (searchParams.get('to') ?? '').trim();

  const nativeToken = useMemo(
    (): SwapToken => ({
      kind: 'native',
      address: undefined,
      symbol: NETWORK.nativeCurrency.symbol,
      decimals: NETWORK.nativeCurrency.decimals,
    }),
    [],
  );

  const communitySymbol = useCommunityContext().symbol;
  const community = useCommunityToken(communitySymbol);
  const firstTokenAddress =
    configuredAddress('firstTokenAddress') ?? configuredAddress('tokenAddress');

  const firstTokenRead = useReadContracts({
    contracts:
      firstTokenAddress !== undefined
        ? [
            { address: firstTokenAddress, abi: love20TokenAbi, functionName: 'symbol' as const },
            { address: firstTokenAddress, abi: love20TokenAbi, functionName: 'decimals' as const },
          ]
        : [],
    query: { enabled: firstTokenAddress !== undefined },
  });

  const firstToken = useMemo((): SwapToken | undefined => {
    if (firstTokenAddress === undefined) return undefined;
    const symbolResult = firstTokenRead.data?.[0];
    const decimalsResult = firstTokenRead.data?.[1];
    if (
      symbolResult?.status !== 'success' ||
      typeof symbolResult.result !== 'string' ||
      symbolResult.result.length === 0 ||
      decimalsResult?.status !== 'success' ||
      typeof decimalsResult.result !== 'number'
    ) {
      return undefined;
    }
    return {
      kind: 'community',
      address: firstTokenAddress,
      symbol: symbolResult.result,
      decimals: decimalsResult.result,
    };
  }, [firstTokenAddress, firstTokenRead.data]);

  const defaultTarget = useMemo((): SwapToken | undefined => {
    if (
      community.status === 'ready' &&
      community.address !== undefined &&
      community.decimals !== undefined &&
      !community.isMetadataLoading &&
      !community.metadataError
    ) {
      return {
        kind: 'community',
        address: community.address,
        symbol: community.symbol,
        decimals: community.decimals,
      };
    }
    return firstToken;
  }, [community, firstToken]);

  const requireFromLookup =
    rawFrom.length > 0 &&
    rawFrom !== nativeToken.symbol &&
    !wrapped.isLoading &&
    rawFrom !== wrapped.symbol;
  const requireToLookup =
    rawTo.length > 0 &&
    rawTo !== nativeToken.symbol &&
    !wrapped.isLoading &&
    rawTo !== wrapped.symbol;

  const fromLookup = useReadContract({
    address: launchAddress,
    abi: launchAbi,
    functionName: 'tokenAddressBySymbol',
    args: [rawFrom],
    query: { enabled: launchAddress !== undefined && requireFromLookup },
  });
  const toLookup = useReadContract({
    address: launchAddress,
    abi: launchAbi,
    functionName: 'tokenAddressBySymbol',
    args: [rawTo],
    query: { enabled: launchAddress !== undefined && requireToLookup },
  });

  const fromAddress =
    requireFromLookup && isConfiguredAddress(fromLookup.data) ? fromLookup.data : undefined;
  const toAddress =
    requireToLookup && isConfiguredAddress(toLookup.data) ? toLookup.data : undefined;

  const lookupAddresses = useMemo(() => {
    const addresses: HexAddress[] = [];
    if (fromAddress !== undefined) addresses.push(fromAddress);
    if (toAddress !== undefined) addresses.push(toAddress);
    return addresses;
  }, [fromAddress, toAddress]);

  const lookups = useReadContracts({
    contracts: lookupAddresses.flatMap((address) => [
      { address, abi: love20TokenAbi, functionName: 'symbol' as const },
      { address, abi: love20TokenAbi, functionName: 'decimals' as const },
    ]),
    query: { enabled: lookupAddresses.length > 0 },
  });

  const lookupMetadata = useMemo(
    () => metadataByAddress(lookupAddresses, lookups.data, lookups.isLoading, lookups.isError),
    [lookupAddresses, lookups.data, lookups.isError, lookups.isLoading],
  );

  const resolveSide = (
    raw: string,
    lookup: typeof fromLookup,
    address: HexAddress | undefined,
    fallback: SwapToken | undefined,
  ): SideResolution => {
    if (raw.length === 0) {
      return fallback !== undefined
        ? { status: 'ready', token: fallback }
        : { status: 'loading', token: undefined };
    }
    if (raw === nativeToken.symbol) return { status: 'ready', token: nativeToken };
    if (wrapped.symbol !== undefined && raw === wrapped.symbol) {
      return wrapped.token !== undefined
        ? { status: 'ready', token: wrapped.token }
        : { status: wrapped.isLoading ? 'loading' : 'error', token: undefined };
    }
    if (lookup.isLoading) return { status: 'loading', token: undefined };
    if (lookup.isError) return { status: 'error', token: undefined };
    if (address === undefined) return { status: 'unknown', token: undefined };
    return tokenFromMetadata(address, lookupMetadata.get(address.toLowerCase()));
  };

  const fromResolution = resolveSide(rawFrom, fromLookup, fromAddress, nativeToken);
  const toResolution = resolveSide(rawTo, toLookup, toAddress, defaultTarget);

  const from = fromResolution.token;
  const to = toResolution.token;

  const status: SwapPairStatus = (() => {
    if (fromResolution.status === 'error' || toResolution.status === 'error') return 'error';
    if (fromResolution.status === 'loading' || toResolution.status === 'loading') return 'loading';
    if (fromResolution.status === 'unknown' || toResolution.status === 'unknown') return 'invalid';
    if (from === undefined || to === undefined) return 'loading';
    if (swapTokenKey(from) === swapTokenKey(to)) return 'invalid';
    return 'ready';
  })();

  useEffect(() => {
    if (rawFrom.length > 0 && rawTo.length > 0) return;
    if (status !== 'ready' || from === undefined || to === undefined) return;
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (rawFrom.length === 0) next.set('from', from.symbol);
        if (rawTo.length === 0) next.set('to', to.symbol);
        if (next.toString() === previous.toString()) return previous;
        return next;
      },
      { replace: true },
    );
  }, [from, rawFrom, rawTo, setSearchParams, status, to]);

  const setSide = (side: 'from' | 'to', token: SwapToken): void => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set(side, token.symbol);
        return next;
      },
      { replace: true },
    );
  };

  const unknownSide =
    fromResolution.status === 'unknown'
      ? 'from'
      : toResolution.status === 'unknown'
        ? 'to'
        : status === 'invalid'
          ? 'to'
          : undefined;

  return {
    status,
    from,
    to,
    unknownSide,
    rawFrom,
    rawTo,
    selectFrom: (token) => {
      setSide('from', token);
    },
    selectTo: (token) => {
      setSide('to', token);
    },
    swapDirection: () => {
      if (from === undefined || to === undefined) return;
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set('from', to.symbol);
          next.set('to', from.symbol);
          return next;
        },
        { replace: true },
      );
    },
  };
}
