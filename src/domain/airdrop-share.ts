/**
 * Share percentages for the airdrop surfaces.
 *
 * Shares are uint256 values (the snapshot uses 1e18 for 100%), so the conversion
 * stays in BigInt: a Number round-trip would silently lose precision for large
 * deployments. Output is trimmed to at most two decimals and never rounds up.
 * `null` means "cannot be displayed", never 0: a tiny-but-positive share is
 * shown as `<0.01%` instead of collapsing to 0%.
 */
const FRACTION_DIGITS = 2;
const SCALE = 10n ** BigInt(FRACTION_DIGITS);

export function formatSharePercent(share: bigint, totalShare: bigint): string | null {
  if (share < 0n || totalShare <= 0n) return null;
  if (share === 0n) return '0%';

  // percent × 100, so the integer part is the whole percent and the remainder
  // is the two-decimal fraction (e.g. 10.25% -> 1025).
  const hundredths = (share * 100n * SCALE) / totalShare;
  if (hundredths === 0n) return '<0.01%';

  const whole = hundredths / SCALE;
  const fraction = (hundredths % SCALE).toString().padStart(FRACTION_DIGITS, '0');
  const trimmed = fraction.replace(/0+$/, '');
  return trimmed.length > 0 ? `${whole.toString()}.${trimmed}%` : `${whole.toString()}%`;
}
