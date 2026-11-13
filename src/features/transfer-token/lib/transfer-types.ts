import type { HexAddress } from '@/config/networks';

/**
 * 代币转账 page token universe.
 *
 * One type covers every selectable asset: the chain native coin (no address),
 * community tokens discovered through Launch, WETH9, the LP token from the
 * address book and an operator-supplied custom ERC20. `kind` only drives copy
 * and the "no address" native branch — the write is always "transfer to an
 * address" (native value transfer or ERC20 `transfer`).
 */
export type TransferTokenKind = 'native' | 'community' | 'wrapped' | 'lp' | 'custom';

export interface TransferToken {
  readonly kind: TransferTokenKind;
  readonly address: HexAddress | undefined;
  readonly symbol: string;
  readonly decimals: number;
  /** Short tag shown in the picker (e.g. 自定义). */
  readonly badge?: string;
}

/** Stable identity for selection comparisons; native is keyed by kind. */
export function transferTokenKey(token: TransferToken): string {
  return token.kind === 'native'
    ? 'native'
    : `${token.kind}:${(token.address ?? '').toLowerCase()}`;
}

export function isSameTransferToken(
  a: TransferToken | undefined,
  b: TransferToken | undefined,
): boolean {
  if (a === undefined || b === undefined) return false;
  return transferTokenKey(a) === transferTokenKey(b);
}

/**
 * Display-only reserve for 全部 on the native coin: the network fee is paid in
 * the same asset, so the max button leaves a small buffer and the copy says 约.
 * Same 0.001 value the 兑换 page uses; it is never part of the amount maths.
 */
export const NATIVE_FEE_RESERVE_WEI = 10n ** 15n;
