/**
 * 手续费率 (UX spec §3.5) is not a frontend constant: `Stake` exposes the two
 * ratios the pair's 0.3%-style profile was configured with, and the fee the page
 * must show is their sum. Contract facts (core/src/Stake.sol `_initDexConfig`):
 * both getters are 1e18-fixed-point shares of the traded amount, the constructor
 * rejects `lp == 0`, `lp <= proto` and `lp + proto >= 1e18`; so the fee is
 * `lp + proto` (the local profile is `3e15 + 0` = 0.30%) and
 * `1e18 - lp - proto` is the *net* fraction that takes part in the swap, not the
 * fee. See docs/product/three-line/swap-fee.md §0.1 for the reconciliation with
 * the task wording.
 *
 * Everything here is pure so the three-line check can assert the exact text
 * without a browser (docs/product/three-line/swap-fee.md §1/§3).
 */

/** Both `Stake` fee getters use 1e18 = 100% fixed point. */
export const SWAP_FEE_RATIO_SCALE = 10n ** 18n;

/** Truncated to the same two fraction digits every rate/fee on the site uses. */
export const SWAP_FEE_DECIMALS = 2;

export interface SwapFeeRatios {
  readonly lpRatio: bigint;
  readonly protocolRatio: bigint;
}

export interface SwapFee {
  /** `lp + proto`, 1e18 fixed point. */
  readonly ratio: bigint;
  /** Display text without the sign, e.g. `0.30`; two decimals, truncated. */
  readonly percent: string;
}

/**
 * Integer percent text. Deliberately not `formatPercent(hundredths / 100)`:
 * `0.29 * 100` is `28.999999999999996` in IEEE 754 and `formatPercent` truncates,
 * so a float round-trip would print `0.28`. Hundredths are computed in BigInt and
 * rendered digit by digit instead.
 */
export function formatSwapFeePercent(ratio: bigint): string | undefined {
  if (ratio <= 0n || ratio >= SWAP_FEE_RATIO_SCALE) return undefined;
  const hundredths = (ratio * 10_000n) / SWAP_FEE_RATIO_SCALE;
  if (hundredths <= 0n) return undefined;
  const whole = hundredths / 100n;
  const fraction = hundredths % 100n;
  return `${whole.toString()}.${fraction.toString().padStart(SWAP_FEE_DECIMALS, '0')}`;
}

/**
 * `undefined` means "do not invent a number": the caller renders the neutral
 * 以链上费率为准 copy. That covers a missing address, a failed read (one or both
 * getters), and profiles that violate the contract's own invariants — the page
 * must never turn broken data into `110%` or `0.00%`.
 */
export function computeSwapFee(ratios: SwapFeeRatios | undefined): SwapFee | undefined {
  if (ratios === undefined) return undefined;
  const { lpRatio, protocolRatio } = ratios;
  if (lpRatio <= 0n || protocolRatio < 0n) return undefined;
  const ratio = lpRatio + protocolRatio;
  if (ratio >= SWAP_FEE_RATIO_SCALE) return undefined;
  const percent = formatSwapFeePercent(ratio);
  if (percent === undefined) return undefined;
  return { ratio, percent };
}
