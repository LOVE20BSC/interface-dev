import type { HexAddress } from '@/config/networks';

export type SwapTokenKind = 'native' | 'wrapped' | 'community';

/** A selectable side of the swap pair. Native has no address. */
export interface SwapToken {
  readonly kind: SwapTokenKind;
  readonly address: HexAddress | undefined;
  readonly symbol: string;
  readonly decimals: number | undefined;
}

/** A resolved token as it appears on the router path (native is represented by WETH). */
export interface SwapRouteToken {
  readonly address: HexAddress;
  readonly kind: SwapTokenKind;
  readonly symbol: string;
  readonly decimals: number;
}

export interface SwapPairInfo {
  readonly address: HexAddress;
  readonly token0: HexAddress;
  readonly token1: HexAddress;
  readonly reserve0: bigint;
  readonly reserve1: bigint;
}

export type SwapRouteKind = 'swap' | 'wrap' | 'unwrap';

export interface SwapRoute {
  readonly kind: SwapRouteKind;
  /** Router path tokens: native is represented by WETH; the last one is output. */
  readonly path: readonly SwapRouteToken[];
  /** Plain address path for Router.getAmountsOut and execution. */
  readonly pathAddresses: readonly HexAddress[];
  /** One entry per path segment, in execution order. */
  readonly pairs: readonly SwapPairInfo[];
  /** Display symbols in selection order; native legs use the native symbol. */
  readonly displayPath: readonly string[];
}

export function sameAddress(a: string | undefined, b: string | undefined): boolean {
  return a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();
}

/**
 * Stable identity for URL/cache comparisons. Native is deliberately keyed by
 * kind, not by symbol, so a wrapped coin with the same ticker cannot collide.
 */
export function swapTokenKey(token: SwapToken): string {
  return token.kind === 'native'
    ? 'native'
    : `${token.kind}:${(token.address ?? '').toLowerCase()}`;
}
