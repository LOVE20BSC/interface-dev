/**
 * Address + amount formatting. Unknown values render as an em dash, never as 0:
 * "0" reads as "my money is gone" (ADR-0003 §4).
 *
 * All locale-sensitive formatters take an explicit locale (default `zh-CN`) so a
 * future language switcher can pass its locale instead of editing this module.
 * The default strings are byte-for-byte what the UI rendered before the parameter
 * existed: grouping `,`, decimal `.`, and the same truncation rules.
 *
 * Displayed token amounts follow one magnitude-aware rule (owner 2026-11-19):
 * always group the integer part, then keep at most 6 fraction digits below 1,
 * 4 digits from 1 to 999, 2 digits from 1,000 to 999,999, and no fraction at all
 * from 1,000,000 up. Truncation is never rounded up, and `TOKEN_AMOUNT_MAX_FRACTION_DIGITS`
 * (6) is the cap for the smallest bucket; fees, rates and percentages use
 * `RATE_MAX_FRACTION_DIGITS` (2). All user-facing token numbers must go through
 * `formatTokenAmount` (or `formatRate`/`formatPercent`) so the same value
 * renders identically on every surface.
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

export function normalizedDigits(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value));
}

/**
 * Shared amount core: `value` scaled by `decimals`, group the integer part, trim
 * the fraction, then cap it at `maxFractionDigits`. Never rounds up, so a balance
 * can never be overstated.
 */
export function formatScaled(
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
 * 数字显示规范（owner 2026-11-19）：小数位按数量级自适应，避免大数拖一长串小数。
 *
 * - |值| < 1        → 最多 6 位（小额仍可见）
 * - 1 ≤ |值| < 1e3  → 最多 4 位
 * - 1e3 ≤ |值| < 1e6 → 最多 2 位
 * - |值| ≥ 1e6      → 0 位（只显示整数部分）
 *
 * 一律截断、不四舍五入；整数部分始终千分位分组。百分比独立用两位。
 */
export function fractionDigitsForMagnitude(
  value: bigint | undefined | null,
  decimals: number,
): number {
  if (value === undefined || value === null || decimals < 0 || !Number.isInteger(decimals)) {
    return TOKEN_AMOUNT_MAX_FRACTION_DIGITS;
  }
  const absolute = value < 0n ? -value : value;
  const whole = absolute / 10n ** BigInt(decimals);
  if (whole >= 1_000_000n) return 0;
  if (whole >= 1_000n) return 2;
  if (whole >= 1n) return 4;
  return TOKEN_AMOUNT_MAX_FRACTION_DIGITS;
}

/**
 * 极小非零金额的显示位数（owner 2026-11-19：不要因为截断把「有余额」显示成 0）。
 * 取「第一个有效位 + 2 位」，最多到 12 位小数（再小就交给 formatVisibleTokenAmount
 * 的「< 最小可见单位」）；返回 undefined 表示按常规数量级规则即可。
 */
export function tinyFractionDigits(
  value: bigint | undefined | null,
  decimals: number,
): number | undefined {
  if (value === undefined || value === null || value === 0n || decimals <= 0) {
    return undefined;
  }
  const absolute = value < 0n ? -value : value;
  const unit = 10n ** BigInt(decimals);
  if (!Number.isInteger(decimals) || absolute >= unit) return undefined;
  const base = fractionDigitsForMagnitude(value, decimals);
  const first = (absolute % unit).toString().padStart(decimals, '0').search(/[1-9]/) + 1;
  return first <= base ? undefined : Math.min(decimals, first + 2, 12);
}

/**
 * Low-level amount formatter: integer part grouped with thousands separators and
 * at most `maxFractionDigits` decimals (truncated, never rounded up). Prefer
 * `formatTokenAmount` for displayed token balances, quotes and receipts; it
 * applies the magnitude-aware fraction rule documented above.
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
 * receipts, info rows and selectors). Fraction digits follow the magnitude rule
 * documented above (see `fractionDigitsForMagnitude`); pass `maxFractionDigits`
 * only for a surface that is explicitly a fee or a percentage.
 */
export function formatTokenAmount(
  value: bigint | undefined | null,
  decimals: number | undefined | null,
  options: AmountFormatOptions = {},
): string {
  if (decimals === undefined || decimals === null) return UNKNOWN;
  const tiny = tinyFractionDigits(value, decimals);
  const digits =
    options.maxFractionDigits ?? Math.max(fractionDigitsForMagnitude(value, decimals), tiny ?? 0);
  return formatAmount(value, decimals, digits, options.locale);
}

/**
 * Percent value (e.g. `0.5` → `0.5%` text sans the sign) with at most two
 * fraction digits. Values are truncated, never rounded up. `minimumFractionDigits`
 * exists for fixed preset labels such as `1.0`.
 */
/**
 * Locale-aware date/time display for future history surfaces. No user-facing
 * date exists yet, but keeping the locale explicit here prevents a later `toLocaleString()`
 * from silently pinning the browser locale.
 */
export function formatBuildId(buildId: string): string {
  return buildId.length > 12 ? buildId.slice(0, 12) : buildId;
}
