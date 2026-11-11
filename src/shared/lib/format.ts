/**
 * Address + amount formatting. Unknown values render as an em dash, never as 0:
 * "0" reads as "my money is gone" (ADR-0003 §4).
 *
 * All locale-sensitive formatters take an explicit locale (default `zh-CN`) so a
 * future language switcher can pass its locale instead of editing this module.
 * The default strings are byte-for-byte what the UI rendered before the parameter
 * existed: grouping `,`, decimal `.`, and the same truncation rules.
 *
 * Displayed token amounts have exactly one rule: group the integer part, trim the
 * fractional part, and keep at most `TOKEN_AMOUNT_MAX_FRACTION_DIGITS` (6) digits.
 * Six digits keep small balances visible instead of collapsing them to `0.00`,
 * while fees, rates and percentages use `RATE_MAX_FRACTION_DIGITS` (2). All
 * user-facing token numbers must go through `formatTokenAmount` (or
 * `formatRate`/`formatPercent`) so the same value renders identically on every
 * surface.
 */

export const DEFAULT_LOCALE = 'zh-CN';

export const UNKNOWN = '—';

/** Displayed token amounts never show more than this many fraction digits. */
export const TOKEN_AMOUNT_MAX_FRACTION_DIGITS = 6;

/** Rates, fees and percentages never show more than this many fraction digits. */
export const RATE_MAX_FRACTION_DIGITS = 2;

export interface AmountFormatOptions {
  readonly maxFractionDigits?: number;
  readonly locale?: string;
}

export interface PercentFormatOptions extends AmountFormatOptions {
  /** Keep trailing zeros up to this many digits (slippage preset labels). */
  readonly minimumFractionDigits?: number;
}

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

function normalizedDigits(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value));
}

/**
 * Shared amount core: `value` scaled by `decimals`, group the integer part, trim
 * the fraction, then cap it at `maxFractionDigits`. Never rounds up, so a balance
 * can never be overstated.
 */
function formatScaled(
  value: bigint,
  decimals: number,
  maxFractionDigits: number,
  locale: string,
  minimumFractionDigits = 0,
): string {
  const raw = formatUnits(value, decimals);
  if (raw === UNKNOWN) return UNKNOWN;
  const [whole = '0', fraction] = raw.split('.');
  const grouped = groupInteger(whole, locale);
  const max = normalizedDigits(maxFractionDigits, 0);
  if (max <= 0) return grouped;
  const min = Math.min(normalizedDigits(minimumFractionDigits, 0), max);
  const trimmed = (fraction ?? '').slice(0, max).replace(/0+$/, '');
  const padded = trimmed.padEnd(min, '0');
  return padded.length > 0 ? `${grouped}${separatorsFor(locale).decimal}${padded}` : grouped;
}

/**
 * Low-level amount formatter: integer part grouped with thousands separators and
 * at most `maxFractionDigits` decimals (truncated, never rounded up). Prefer
 * `formatTokenAmount` for displayed token balances, quotes and receipts; it
 * applies the single 6-digit rule.
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
  return formatScaled(value, decimals, maxFractionDigits, locale);
}

/**
 * The one formatter for displayed token amounts (balances, quotes, minimums,
 * receipts, info rows and selectors). Defaults to six fraction digits so small
 * balances stay visible; pass `maxFractionDigits` only for a surface that is
 * explicitly a fee or a percentage.
 */
export function formatTokenAmount(
  value: bigint | undefined | null,
  decimals: number | undefined | null,
  options: AmountFormatOptions = {},
): string {
  if (decimals === undefined || decimals === null) return UNKNOWN;
  return formatAmount(
    value,
    decimals,
    options.maxFractionDigits ?? TOKEN_AMOUNT_MAX_FRACTION_DIGITS,
    options.locale,
  );
}

/**
 * Percent value (e.g. `0.5` → `0.5%` text sans the sign) with at most two
 * fraction digits. Values are truncated, never rounded up. `minimumFractionDigits`
 * exists for fixed preset labels such as `1.0`.
 */
export function formatPercent(value: number, options: PercentFormatOptions = {}): string {
  if (!Number.isFinite(value)) return UNKNOWN;
  const digits = normalizedDigits(options.maxFractionDigits, RATE_MAX_FRACTION_DIGITS);
  const scaled = Math.trunc(value * 10 ** digits);
  return formatScaled(
    BigInt(scaled),
    digits,
    digits,
    options.locale ?? DEFAULT_LOCALE,
    options.minimumFractionDigits,
  );
}

/** Basis points → percentage with at most two decimals, e.g. 123 → `1.23`. */
export function formatBpsPercent(bps: number): string {
  if (!Number.isFinite(bps)) return UNKNOWN;
  const clamped = Math.max(0, Math.round(bps));
  return formatAmount(BigInt(clamped), 2, RATE_MAX_FRACTION_DIGITS);
}

/**
 * 1 FROM ≈ rate TO, derived from the amount quote so no extra chain read is
 * needed. Rates are display-only, use the two-digit rate rule and never round
 * up; the UI still labels the value 预计.
 */
export function formatRate(
  quoteOut: bigint,
  amountIn: bigint,
  fromDecimals: number,
  toDecimals: number,
  options: AmountFormatOptions = {},
): string {
  if (
    amountIn <= 0n ||
    quoteOut < 0n ||
    fromDecimals < 0 ||
    toDecimals < 0 ||
    !Number.isInteger(fromDecimals) ||
    !Number.isInteger(toDecimals)
  ) {
    return UNKNOWN;
  }
  const digits = normalizedDigits(options.maxFractionDigits, RATE_MAX_FRACTION_DIGITS);
  const scale = 10n ** BigInt(digits);
  const numerator = quoteOut * 10n ** BigInt(fromDecimals) * scale;
  const denominator = amountIn * 10n ** BigInt(toDecimals);
  if (denominator === 0n) return UNKNOWN;
  return formatScaled(numerator / denominator, digits, digits, options.locale ?? DEFAULT_LOCALE);
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
