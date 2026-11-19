import { formatUnits } from 'viem';
import {
  DEFAULT_LOCALE,
  fractionDigitsForMagnitude,
  formatTokenAmount,
  tinyFractionDigits,
  UNKNOWN,
  type AmountFormatOptions,
} from '@/shared/lib/format';
import { formatPercent } from '@/shared/lib/format-rates';

/** Smallest non-zero amount the amount rule can display, in base units. */
function smallestVisibleTokenAmount(decimals: number, maxFractionDigits: number): bigint {
  const digits = maxFractionDigits < 0 ? 0 : Math.trunc(maxFractionDigits);
  if (decimals <= digits) return 1n;
  return 10n ** BigInt(decimals - digits);
}

/** 把 `toString()` 可能带的科学计数法展开成普通十进制字符串（不丢位、不再四舍五入）。 */
function toPlainDecimal(value: number): string {
  const text = value.toString();
  if (!text.includes('e')) return text;
  const [mantissa = '', power = '0'] = text.split('e');
  const exponent = Number(power);
  const [intPart = '0', fracPart = ''] = mantissa.split('.');
  const digits = intPart + fracPart;
  const point = intPart.length + exponent;
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * `formatTokenAmount` with one extra guarantee for money that actually moves:
 * a **non-zero** amount the display rule would collapse to `0` renders as
 * `< 最小可见单位` instead of a literal `0`.
 *
 * A bare `0` therefore always means exactly zero. 批量转账 uses this for the
 * batch total, per-row amounts, receipt totals and the before → after balances,
 * so a 0.0000001 ETH transfer can never look like 「什么都没转」。
 */
export function formatVisibleTokenAmount(
  value: bigint | undefined | null,
  decimals: number | undefined | null,
  options: AmountFormatOptions = {},
): string {
  const formatted = formatTokenAmount(value, decimals, options);
  if (
    formatted !== '0' ||
    value === undefined ||
    value === null ||
    value === 0n ||
    decimals === undefined ||
    decimals === null
  ) {
    return formatted;
  }
  // 极小值按有效位显示；只有显式 maxFractionDigits 压到更小才退化。
  const smallest = smallestVisibleTokenAmount(
    decimals,
    options.maxFractionDigits ??
      Math.max(
        fractionDigitsForMagnitude(value, decimals),
        tinyFractionDigits(value, decimals) ?? 0,
      ),
  );
  return `< ${formatUnits(smallest, decimals)}`;
}

/**
 * 极小百分比的显示（owner 2026-11-19）：采用 `0.{x}yyyy` 形式——
 * `x` 是小数点后前导 0 的个数，`yyyy` 是随后的**最多 4 位非零数字**；
 * 只截断、不四舍五入，也不设 `x` 的上限（多小都显示出来）。
 *
 * 例：0.0000123 → `0.0000123`（x=4，后接有效数字 123）；
 * 0.0009999999 → `0.0009999`；0.0000004 → `0.0000004`；
 * 0.005 → `0.005`。
 *
 * 占比 ≥ 0.01% 时仍走两位小数的 `formatPercent`（截断）。
 */
export function formatTinyPercent(value: number, locale: string = DEFAULT_LOCALE): string {
  if (!Number.isFinite(value)) return UNKNOWN;
  if (value <= 0) return formatPercent(value, { locale });
  if (value >= 0.01) return formatPercent(value, { locale });

  const plain = toPlainDecimal(value);
  const fraction = plain.split('.')[1] ?? '';
  const leadingZeros = /^0*/.exec(fraction)?.[0].length ?? 0;
  const significant = fraction.slice(leadingZeros).replace(/0+$/, '').slice(0, 4);
  if (significant.length === 0) return formatPercent(value, { locale });
  return `0.${'0'.repeat(leadingZeros)}${significant}`;
}
