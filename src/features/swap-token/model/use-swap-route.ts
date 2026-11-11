import { useCallback, useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { launchAbi, love20TokenAbi, uniswapV2FactoryAbi, uniswapV2PairAbi } from '@/config/abis';
import { isConfiguredAddress, type HexAddress } from '@/config/networks';
import {
  evaluateRoute,
  findSwapPath,
  type HopPairRead,
  type SwapPairRead,
} from '@/features/swap-token/lib/swap-route';
import type {
  SwapPairInfo,
  SwapRoute,
  SwapRouteToken,
  SwapToken,
} from '@/features/swap-token/lib/swap-types';
import { sameAddress, swapTokenKey } from '@/features/swap-token/lib/swap-types';
import type { SwapRouteStatus } from '@/features/swap-token/lib/swap-state';
import { shortenAddress } from '@/shared/lib/format';
import type { WrappedNative } from './use-wrapped-native';

export interface SwapRouteState {
  readonly status: SwapRouteStatus;
  readonly route: SwapRoute | null;
  readonly allPairs: readonly SwapPairRead[];
  readonly failingHopLabel: string | undefined;
  readonly retry: () => void;
}

interface RouteHookInput {
  readonly from: SwapToken | undefined;
  readonly to: SwapToken | undefined;
  readonly wrapped: WrappedNative;
  readonly factory: HexAddress | undefined;
  readonly launch: HexAddress | undefined;
  readonly enabled: boolean;
  readonly nativeSymbol: string;
}

interface ReadStatusResult {
  readonly status?: string;
  readonly result?: unknown;
}

function addressResult(value: unknown): HexAddress | undefined {
  return typeof value === 'string' && isConfiguredAddress(value) ? value : undefined;
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

function hopLabel(path: readonly SwapRouteToken[], index: number | null): string | undefined {
  if (index === null) return undefined;
  const from = path[index];
  const to = path[index + 1];
  if (from === undefined || to === undefined) return undefined;
  return `${from.symbol} → ${to.symbol}`;
}

function routeToken(token: SwapToken, address: HexAddress, fallbackSymbol: string): SwapRouteToken {
  return {
    address,
    kind: token.kind,
    symbol: token.symbol.length > 0 ? token.symbol : fallbackSymbol,
    decimals: token.decimals ?? 18,
  };
}

/**
 * Resolves WETH-rooted parent paths, then validates every hop through
 * factory.getPair + pair.getReserves in Multicall3 batches. No route read is
 * issued for an unconfigured deployment, a disconnected wallet, or a selection
 * that has not finished resolving.
 */
export function useSwapRoute(input: RouteHookInput): SwapRouteState {
  const { from, to, wrapped, factory, launch, enabled, nativeSymbol } = input;
  const client = usePublicClient();
  const [status, setStatus] = useState<SwapRouteStatus>('idle');
  const [route, setRoute] = useState<SwapRoute | null>(null);
  const [allPairs, setAllPairs] = useState<readonly SwapPairRead[]>([]);
  const [failingHopLabel, setFailingHopLabel] = useState<string | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);

  const fromKey = from !== undefined ? swapTokenKey(from) : '';
  const toKey = to !== undefined ? swapTokenKey(to) : '';
  const wrappedAddress = wrapped.address;

  /* eslint-disable react-hooks/set-state-in-effect -- reset derived state when inputs are unavailable */
  useEffect(() => {
    if (!enabled || from === undefined || to === undefined || wrappedAddress === undefined) {
      setStatus('idle');
      setRoute(null);
      setAllPairs([]);
      setFailingHopLabel(undefined);
      return;
    }
    if (client === undefined || factory === undefined || launch === undefined) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    const run = async () => {
      setStatus('loading');
      setRoute(null);
      setAllPairs([]);
      setFailingHopLabel(undefined);

      try {
        const fromInternal = from.kind === 'native' ? wrappedAddress : from.address;
        const toInternal = to.kind === 'native' ? wrappedAddress : to.address;
        if (fromInternal === undefined || toInternal === undefined) {
          setStatus('error');
          return;
        }

        if (
          (from.kind === 'native' && to.kind === 'wrapped') ||
          (from.kind === 'wrapped' && to.kind === 'native')
        ) {
          if (cancelled) return;
          setRoute({
            kind: from.kind === 'native' ? 'wrap' : 'unwrap',
            path: [],
            pathAddresses: [],
            pairs: [],
            displayPath: [nativeSymbol, wrapped.symbol ?? nativeSymbol],
          });
          setStatus('ready');
          return;
        }

        if (sameAddress(fromInternal, toInternal)) {
          setStatus('missing-pair');
          return;
        }

        const parentMap = new Map<string, HexAddress>();
        let frontier = uniqueAddresses(
          [fromInternal, toInternal].filter((address) => !sameAddress(address, wrappedAddress)),
        );
        for (let depth = 0; depth < 2; depth += 1) {
          if (frontier.length === 0) break;
          const responses = (await client.multicall({
            contracts: frontier.map((address) => ({
              address: launch,
              abi: launchAbi,
              functionName: 'parentToken' as const,
              args: [address] as const,
            })),
            allowFailure: true,
          })) as readonly ReadStatusResult[];
          const next: HexAddress[] = [];
          responses.forEach((response, index) => {
            const address = frontier[index];
            if (address === undefined) return;
            const parent = addressResult(response.result);
            if (parent === undefined) return;
            parentMap.set(address.toLowerCase(), parent);
            if (!sameAddress(parent, wrappedAddress) && !sameAddress(parent, address)) {
              next.push(parent);
            }
          });
          frontier = uniqueAddresses(next);
        }

        const path = findSwapPath(fromInternal, toInternal, wrappedAddress, (address) =>
          parentMap.get(address.toLowerCase()),
        );
        if (path === null) {
          if (cancelled) return;
          setStatus('missing-pair');
          setFailingHopLabel(undefined);
          return;
        }

        const known = new Map<string, SwapRouteToken>();
        known.set(fromInternal.toLowerCase(), routeToken(from, fromInternal, from.symbol));
        known.set(toInternal.toLowerCase(), routeToken(to, toInternal, to.symbol));
        if (wrapped.token !== undefined && !known.has(wrappedAddress.toLowerCase())) {
          known.set(
            wrappedAddress.toLowerCase(),
            routeToken(wrapped.token, wrappedAddress, wrapped.symbol ?? nativeSymbol),
          );
        }

        const unknown = path.filter((address) => !known.has(address.toLowerCase()));
        const metadataCalls = unknown.flatMap((address) => [
          { address, abi: love20TokenAbi, functionName: 'symbol' as const },
          { address, abi: love20TokenAbi, functionName: 'decimals' as const },
        ]);
        let metadataResponses: readonly ReadStatusResult[] = [];
        if (metadataCalls.length > 0) {
          metadataResponses = (await client.multicall({
            contracts: metadataCalls,
            allowFailure: true,
          })) as readonly ReadStatusResult[];
        }
        unknown.forEach((address, index) => {
          const symbolResult = metadataResponses[index * 2];
          const decimalsResult = metadataResponses[index * 2 + 1];
          if (
            symbolResult?.status === 'success' &&
            typeof symbolResult.result === 'string' &&
            symbolResult.result.length > 0 &&
            decimalsResult?.status === 'success' &&
            typeof decimalsResult.result === 'number'
          ) {
            known.set(address.toLowerCase(), {
              address,
              kind: 'community',
              symbol: symbolResult.result,
              decimals: decimalsResult.result,
            });
          }
        });
        if (path.some((address) => !known.has(address.toLowerCase()))) {
          if (cancelled) return;
          setStatus('error');
          return;
        }

        const routeTokens = path.map((address) => {
          const token = known.get(address.toLowerCase());
          if (token === undefined) {
            return {
              address,
              kind: 'community' as const,
              symbol: shortenAddress(address),
              decimals: 18,
            };
          }
          return token;
        });
        const displayPath = routeTokens.map((token) => token.symbol);
        const failLabel = (index: number | null) => hopLabel(routeTokens, index);

        const pairCalls = path.slice(0, -1).map((address, index) => ({
          address: factory,
          abi: uniswapV2FactoryAbi,
          functionName: 'getPair' as const,
          args: [address, path[index + 1] as HexAddress] as const,
        }));
        const pairResponses = (await client.multicall({
          contracts: pairCalls,
          allowFailure: true,
        })) as readonly ReadStatusResult[];

        interface MutableHop {
          pair: HexAddress | undefined;
          token0: HexAddress | undefined;
          token1: HexAddress | undefined;
          reserve0: bigint | undefined;
          reserve1: bigint | undefined;
        }
        const hops: MutableHop[] = [];
        const detailCalls: {
          address: HexAddress;
          abi: typeof uniswapV2PairAbi;
          functionName: 'getReserves' | 'token0' | 'token1';
        }[] = [];
        pairResponses.forEach((response) => {
          const pair = response.status === 'success' ? addressResult(response.result) : undefined;
          hops.push({
            pair,
            token0: undefined,
            token1: undefined,
            reserve0: undefined,
            reserve1: undefined,
          });
          if (pair === undefined) return;
          detailCalls.push(
            { address: pair, abi: uniswapV2PairAbi, functionName: 'getReserves' },
            { address: pair, abi: uniswapV2PairAbi, functionName: 'token0' },
            { address: pair, abi: uniswapV2PairAbi, functionName: 'token1' },
          );
        });

        const details =
          detailCalls.length > 0
            ? ((await client.multicall({
                contracts: detailCalls,
                allowFailure: true,
              })) as readonly ReadStatusResult[])
            : [];
        let detailIndex = 0;
        for (let index = 0; index < hops.length; index += 1) {
          const hop = hops[index];
          if (hop === undefined || hop.pair === undefined) continue;
          const reserves = details[detailIndex];
          const token0 = details[detailIndex + 1];
          const token1 = details[detailIndex + 2];
          detailIndex += 3;
          if (
            reserves?.status === 'success' &&
            Array.isArray(reserves.result) &&
            typeof reserves.result[0] === 'bigint' &&
            typeof reserves.result[1] === 'bigint' &&
            token0?.status === 'success' &&
            typeof token0.result === 'string' &&
            isConfiguredAddress(token0.result) &&
            token1?.status === 'success' &&
            typeof token1.result === 'string' &&
            isConfiguredAddress(token1.result)
          ) {
            hop.token0 = token0.result;
            hop.token1 = token1.result;
            hop.reserve0 = reserves.result[0];
            hop.reserve1 = reserves.result[1];
          }
        }
        // HopPairRead is readonly by contract; rebuild with the values we just filled.
        const resolvedHops: HopPairRead[] = hops.map((hop) => ({
          pair: hop.pair,
          token0: hop.token0,
          token1: hop.token1,
          reserve0: hop.reserve0,
          reserve1: hop.reserve1,
        }));
        const check = evaluateRoute(path, resolvedHops);
        if (cancelled) return;

        const pairsForDetail = check.allPairs as readonly SwapPairInfo[];
        setAllPairs(pairsForDetail);
        setRoute({
          kind: 'swap',
          path: routeTokens,
          pathAddresses: path,
          pairs: pairsForDetail,
          displayPath,
        });
        if (check.status === 'ready') {
          setStatus('ready');
          setFailingHopLabel(undefined);
        } else if (check.status === 'empty-pool') {
          setStatus('empty-pool');
          setFailingHopLabel(failLabel(check.failingHop));
        } else {
          setStatus('missing-pair');
          setFailingHopLabel(failLabel(check.failingHop));
        }
      } catch {
        if (cancelled) return;
        setStatus('error');
        setRoute(null);
        setAllPairs([]);
        setFailingHopLabel(undefined);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // Primitive keys keep the effect from rerunning on equivalent objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    client,
    enabled,
    factory,
    fromKey,
    launch,
    nativeSymbol,
    refreshKey,
    toKey,
    wrappedAddress,
    wrapped.symbol,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const retry = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  return {
    status,
    route,
    allPairs,
    failingHopLabel,
    retry,
  };
}
