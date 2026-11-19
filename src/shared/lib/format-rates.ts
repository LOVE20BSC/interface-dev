import {
  DEFAULT_LOCALE,
  formatAmount,
  formatScaled,
  normalizedDigits,
  UNKNOWN,
  type AmountFormatOptions,
  type PercentFormatOptions,
} from '@/shared/lib/format';

const RATE_MAX_FRACTION_DIGITS = 2;

/**
 * Rate / phase / bps formatters. They are imported only by lazy pages（兑换、流动性、
 * 关于、治理）, so they live here instead of `format.ts`: `format.ts` is in the first-screen
 * chunk, and keeping these there costs entry gzip for users who never open those pages.
 */

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
  const digits =
    options.maxFractionDigits === undefined
      ? 2
      : Math.max(0, Math.min(6, Math.trunc(options.maxFractionDigits)));
  const scale = 10n ** BigInt(digits);
  const numerator = quoteOut * 10n ** BigInt(fromDecimals) * scale;
  const denominator = amountIn * 10n ** BigInt(toDecimals);
  if (denominator === 0n) return UNKNOWN;
  return formatAmount(numerator / denominator, digits, digits, options.locale ?? DEFAULT_LOCALE);
}

/** Basis points -> percentage with at most two decimals, e.g. 123 -> `1.23`. */
export function formatBpsPercent(bps: number): string {
  if (!Number.isFinite(bps)) return UNKNOWN;
  const clamped = Math.max(0, Math.round(bps));
  return formatAmount(BigInt(clamped), 2, 2);
}

/** Phase number: grouping off (it is an ordinal, not money). */
export function formatPhase(
  value: bigint | undefined | null,
  locale: string = DEFAULT_LOCALE,
): string {
  if (value === undefined || value === null) return UNKNOWN;
  return new Intl.NumberFormat(locale, { useGrouping: false }).format(value);
}

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

export function formatDateTime(
  value: Date | number,
  locale: string = DEFAULT_LOCALE,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}
