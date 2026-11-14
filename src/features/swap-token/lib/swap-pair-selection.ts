import { swapTokenKey, type SwapToken } from '@/features/swap-token/lib/swap-types';

export type SwapSide = 'from' | 'to';

export interface SwapPairSelection {
  readonly from: SwapToken;
  readonly to: SwapToken;
}

/**
 * Owner 2026-11-14: 「选择代币的时候，应该不让选择重复的代币，而不是让用户选择
 * 代币重复后再报错」. The picker hides the opposite side, but a programmatic
 * selection (deep link rewrite, recovery action, a stale sheet click) could still
 * ask for the token that is already on the other side.
 *
 * Selecting the token the other side already holds means "swap the direction":
 * from=ETH/to=WETH + picking WETH as 从 → 从=WETH, 到=ETH. Any other selection
 * only replaces its own side. The result always has two distinct tokens, so the
 * page can never reach the invalid-pair state through user selection.
 */
export function resolvePairSelection(
  current: { readonly from: SwapToken | undefined; readonly to: SwapToken | undefined },
  side: SwapSide,
  token: SwapToken,
): SwapPairSelection | null {
  const other = side === 'from' ? current.to : current.from;
  if (other !== undefined && swapTokenKey(other) === swapTokenKey(token)) {
    const previous = side === 'from' ? current.from : current.to;
    if (previous === undefined) return null;
    return side === 'from' ? { from: token, to: previous } : { from: previous, to: token };
  }
  if (side === 'from') {
    return current.to === undefined ? null : { from: token, to: current.to };
  }
  return current.from === undefined ? null : { from: current.from, to: token };
}
