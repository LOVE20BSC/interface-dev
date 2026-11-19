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

/**
 * `formatTokenAmount` with one extra guarantee for money that actually moves:
 * a **non-zero** amount the display rule would collapse to `0` renders as
 * `< 0.000001` (the smallest visible amount) instead of a literal `0`.
 *
 * A bare `0` therefore always means exactly zero. 批量转账 uses this for the
 * batch total, per-row amounts, receipt totals and the before → after balances,
 * so a 0.0000001 ETH transfer can never look like 「什么都没转」.
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
  // 极小值能显示到 12 位小数；再小才退化成「< 最小可见单位」。
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
 * 极小百分比的显示（owner 2026-11-19）：占比小到两位小数会变成 0.00% 时，依次用
 * 6 位、8 位小数显示（如 0.000012%、0.00000xxx%）；8 位仍为 0 才显示
 * <0.00000001%，让用户知道「有份额但极小」，而不是误读成 0。
 */
export function formatTinyPercent(value: number, locale: string = DEFAULT_LOCALE): string {
  if (!Number.isFinite(value)) return UNKNOWN;
  if (value <= 0) return formatPercent(value, { locale });
  // 用格式化后的字符串判断是否为 0：Number() 解析会破坏千分位与非默认 locale。
  // 依次尝试 2 / 6 / 8 位小数，覆盖 0.00000xxx 这类极小占比（owner 2026-11-19）。
  for (const digits of [2, 6, 8]) {
    const formatted = formatPercent(value, { locale, maxFractionDigits: digits });
    if (formatted !== '0') return formatted;
  }
  return '<' + formatPercent(0.00000001, { locale, maxFractionDigits: 8 });
}
