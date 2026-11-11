import { sameAddress } from './swap-types';
import type { HexAddress } from '@/config/networks';

/** Maximum number of tokens on a path (2 pairs / 2 hops). Spec §3.5. */
export const MAX_ROUTE_TOKENS = 3;

/** How far we climb each side. A 3-token path is at most 2 edges from each end. */
const MAX_ANCESTOR_STEPS = 2;

export type ParentLookup = (token: HexAddress) => HexAddress | undefined;

/**
 * The pair graph is the Launch parent tree rooted at WETH. For any path of at
 * most 3 tokens the lowest common ancestor is reachable by climbing at most two
 * parents from each endpoint, so we never walk the whole tree.
 */
export function ancestorChain(
  token: HexAddress,
  weth: HexAddress,
  parentOf: ParentLookup,
): HexAddress[] {
  const chain: HexAddress[] = [token];
  if (sameAddress(token, weth)) return chain;

  let current = token;
  for (let step = 0; step < MAX_ANCESTOR_STEPS; step += 1) {
    const parent = parentOf(current);
    if (parent === undefined || parent === '0x0000000000000000000000000000000000000000') break;
    if (sameAddress(parent, current)) break;
    chain.push(parent);
    if (sameAddress(parent, weth)) break;
    current = parent;
  }
  return chain;
}

/**
 * Shortest path on the parent tree: A → ... → LCA → ... → B.
 * Returns null when the endpoints are identical, disconnected, or the path
 * would exceed the token budget (caller renders 无路径).
 */
export function findSwapPath(
  from: HexAddress,
  to: HexAddress,
  weth: HexAddress,
  parentOf: ParentLookup,
  maxTokens: number = MAX_ROUTE_TOKENS,
): HexAddress[] | null {
  if (sameAddress(from, to)) return null;

  const fromChain = ancestorChain(from, weth, parentOf);
  const toChain = ancestorChain(to, weth, parentOf);
  const toIndex = new Map<string, number>();
  toChain.forEach((address, index) => {
    toIndex.set(address.toLowerCase(), index);
  });

  for (let i = 0; i < fromChain.length; i += 1) {
    const address = fromChain[i];
    if (address === undefined) continue;
    const j = toIndex.get(address.toLowerCase());
    if (j === undefined) continue;

    const path = [...fromChain.slice(0, i + 1), ...toChain.slice(0, j).reverse()];
    if (path.length > maxTokens) return null;
    return path;
  }
  return null;
}

export interface HopPairRead {
  readonly pair: HexAddress | undefined;
  readonly token0: HexAddress | undefined;
  readonly token1: HexAddress | undefined;
  readonly reserve0: bigint | undefined;
  readonly reserve1: bigint | undefined;
}

export interface SwapPairRead {
  readonly address: HexAddress;
  readonly token0: HexAddress;
  readonly token1: HexAddress;
  readonly reserve0: bigint;
  readonly reserve1: bigint;
}

export type RouteCheckStatus = 'ready' | 'missing-pair' | 'empty-pool';

export interface RouteCheck {
  readonly status: RouteCheckStatus;
  /** Index into `path` where the route is broken, when status is not ready. */
  readonly failingHop: number | null;
  /** Pairs that can be used for execution; empty unless status is ready. */
  readonly pairs: readonly SwapPairRead[];
  /** Every pair read, including a zero-liquidity one, for 技术详情. */
  readonly allPairs: readonly SwapPairRead[];
}

/**
 * Validates every hop with factory.getPair + pair.getReserves. A pair that does
 * not exist is 无路径; a pair that exists with a zero reserve is the protocol's
 * normal empty-pool state and gets its own copy and next steps.
 */
export function evaluateRoute(
  path: readonly HexAddress[],
  hops: readonly HopPairRead[],
): RouteCheck {
  const allPairs: SwapPairRead[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const hop = hops[index];
    if (hop === undefined || hop.pair === undefined || hop.token0 === undefined) {
      return { status: 'missing-pair', failingHop: index, pairs: [], allPairs };
    }
    if (hop.token1 === undefined || hop.reserve0 === undefined || hop.reserve1 === undefined) {
      return { status: 'missing-pair', failingHop: index, pairs: [], allPairs };
    }
    const pair: SwapPairRead = {
      address: hop.pair,
      token0: hop.token0,
      token1: hop.token1,
      reserve0: hop.reserve0,
      reserve1: hop.reserve1,
    };
    allPairs.push(pair);
    if (pair.reserve0 === 0n || pair.reserve1 === 0n) {
      return { status: 'empty-pool', failingHop: index, pairs: [], allPairs };
    }
  }
  return { status: 'ready', failingHop: null, pairs: allPairs, allPairs };
}
