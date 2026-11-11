/**
 * Address + amount formatting. Unknown values render as an em dash, never as 0:
 * "0" reads as "my money is gone" (ADR-0003 §4).
 *
 * All locale-sensitive formatters take an explicit locale (default `zh-CN`) so a
 * future language switcher can pass its locale instead of editing this module.
 * The default strings are byte-for-byte what the UI rendered before the parameter
 * existed: grouping `,`, decimal `.`, and the same truncation rules.
 */

export const DEFAULT_LOCALE = 'zh-CN';

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

interface LocaleSeparators {
  readonly group: string;
  readonly decimal: string;
}

const separatorCache = new Map<string, LocaleSeparators>();

function separatorsFor(locale: string): LocaleSeparators {
  const cached = separatorCache.get(locale);
  if (cached !== undefined) return cached;
  const parts = new Intl.NumberFormat(locale).formatToParts(1_234_567.5);
  const group = parts.find((part) => part.type === 'group')?.value ?? ',';
  const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.';
  const separators = { group, decimal };
  separatorCache.set(locale, separators);
  return separators;
}

/** `99799100` → `99,799,100`. Pure string grouping, so huge balances are exact. */
function groupInteger(whole: string, locale: string): string {
  const { group } = separatorsFor(locale);
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
}

/**
 * Token amount for display: integer part grouped with thousands separators and
 * at most `maxFractionDigits` decimals (truncated, never rounded up so a balance
 * is never overstated). Trailing zeros are trimmed. The locale only changes the
 * separators; the default `zh-CN` output is unchanged.
 *
 * `undefined` / `null` means "not loaded", which stays `—`: rendering 0 would
 * read as "my money is gone" (ADR-0003 §4).
 */
export function formatAmount(
  value: bigint | undefined | null,
  decimals: number,
  maxFractionDigits = 2,
  locale: string = DEFAULT_LOCALE,
): string {
  if (value === undefined || value === null) return UNKNOWN;
  const raw = formatUnits(value, decimals);
  if (raw === UNKNOWN) return UNKNOWN;
  const [whole = '0', fraction] = raw.split('.');
  const grouped = groupInteger(whole, locale);
  if (fraction === undefined || maxFractionDigits <= 0) return grouped;
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');
  return trimmed.length > 0 ? `${grouped}${separatorsFor(locale).decimal}${trimmed}` : grouped;
}

export function formatPhase(
  value: bigint | undefined | null,
  locale: string = DEFAULT_LOCALE,
): string {
  if (value === undefined || value === null) return UNKNOWN;
  return new Intl.NumberFormat(locale, { useGrouping: false }).format(value);
}

export function formatBuildId(buildId: string): string {
  return buildId.length > 12 ? buildId.slice(0, 12) : buildId;
}

/**
 * Locale-aware date/time display for future history surfaces. No user-facing
 * date exists yet, but keeping the locale explicit here prevents a later `toLocaleString()`
 * from silently pinning the browser locale.
 */
export function formatDateTime(
  value: Date | number,
  locale: string = DEFAULT_LOCALE,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}
