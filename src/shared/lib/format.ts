/**
 * Address + amount formatting. Unknown values render as an em dash, never as 0:
 * "0" reads as "my money is gone" (ADR-0003 §4).
 */

export const UNKNOWN = '—';

export function shortenAddress(address: string, front = 4, back = 4): string {
  if (!address.startsWith('0x') || address.length < 2 + front + back) return address;
  return `${address.slice(0, 2 + front)}…${address.slice(-back)}`;
}

export function isSameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && a.toLowerCase() === b.toLowerCase();
}

/** BigInt-safe unit formatting without pulling viem into the shared layer. */
export function formatUnits(value: bigint, decimals: number): string {
  if (decimals < 0 || !Number.isInteger(decimals)) return UNKNOWN;
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;
  const fractionText =
    decimals === 0 ? '' : `.${fraction.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
  return `${negative ? '-' : ''}${whole.toString()}${fractionText === '.' ? '' : fractionText}`;
}

/** `99799100` → `99,799,100`. Pure string grouping, so huge balances are exact. */
function groupInteger(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Token amount for display: integer part grouped with thousands separators and
 * at most `maxFractionDigits` decimals (truncated, never rounded up so a balance
 * is never overstated). Trailing zeros are trimmed.
 *
 * `undefined` / `null` means "not loaded", which stays `—`: rendering 0 would
 * read as "my money is gone" (ADR-0003 §4).
 */
export function formatAmount(
  value: bigint | undefined | null,
  decimals: number,
  maxFractionDigits = 2,
): string {
  if (value === undefined || value === null) return UNKNOWN;
  const raw = formatUnits(value, decimals);
  if (raw === UNKNOWN) return UNKNOWN;
  const [whole = '0', fraction] = raw.split('.');
  const grouped = groupInteger(whole);
  if (fraction === undefined || maxFractionDigits <= 0) return grouped;
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');
  return trimmed.length > 0 ? `${grouped}.${trimmed}` : grouped;
}

export function formatPhase(value: bigint | undefined | null): string {
  if (value === undefined || value === null) return UNKNOWN;
  return value.toString();
}

export function formatBuildId(buildId: string): string {
  return buildId.length > 12 ? buildId.slice(0, 12) : buildId;
}
