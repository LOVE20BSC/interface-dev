/**
 * UX spec §4.1: approve the quoted mint cost plus a 1 % buffer, never an
 * unlimited allowance. The buffer covers a cost increase between the quote and
 * the mint transaction; it is *not* price slippage, and it must never be
 * labelled 「滑点」.
 *
 * Rounded up so allowance >= required at the moment the user confirms.
 */
const BUFFER_NUMERATOR = 101n;
const BUFFER_DENOMINATOR = 100n;

export function approveAmountFor(required: bigint): bigint {
  if (required <= 0n) return 0n;
  return (required * BUFFER_NUMERATOR + BUFFER_DENOMINATOR - 1n) / BUFFER_DENOMINATOR;
}
