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
 * 极小百分比的显示（owner 2026-11-19）：占比小于 0.01% 时至少要「看得见」——按
 * 第一个有效位 + 2 位有效数字输出，不设位数上限；极长（超 60 位小数）时用
 * 科学计数法，绝不再退化成 0 或 `< 最小可见`。
 *
 * 字符串由 `toString()` 的精确十进制展开截断而来，**只截断、不四舍五入**
 * （资金安全：连续 9 也不能进位）。
 *
 * 例：0.000012 → `0.000012`；0.0000000001 → `0.0000000001`；
 * 1.23e-120 → `1.23e-120`。
 */
export function formatTinyPercent(value: number, locale: string = DEFAULT_LOCALE): string {
  if (!Number.isFinite(value)) return UNKNOWN;
  if (value <= 0) return formatPercent(value, { locale });
  if (value >= 0.01) return formatPercent(value, { locale });

  const plain = toPlainDecimal(value);
  const fraction = plain.split('.')[1] ?? '';
  const firstSignificant = fraction.search(/[1-9]/);
  if (firstSignificant < 0) return formatPercent(value, { locale });
  const decimals = firstSignificant + 3; // 第一个有效位 + 再 2 位
  if (decimals > 60) {
    // 过长的 0 串不再铺开：用科学计数法展示，尾数同样截断。
    const [mantissa = '', power = ''] = value.toExponential(2).split('e');
    const truncated = mantissa.slice(0, mantissa.includes('.') ? 4 : mantissa.length);
    return `${truncated}e${power}`;
  }
  return `0.${fraction.slice(0, decimals).replace(/0+$/, '')}`;
}
