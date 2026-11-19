import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  formatAmount,
  formatTokenAmount,
  formatUnits,
  fractionDigitsForMagnitude,
  TOKEN_AMOUNT_MAX_FRACTION_DIGITS,
  UNKNOWN,
} from '@/shared/lib/format';
import {
  formatBpsPercent,
  formatDateTime,
  formatPercent,
  formatRate,
} from '@/shared/lib/format-rates';
import { formatTinyPercent, formatVisibleTokenAmount } from '@/shared/lib/format-tiny';

const E18 = 10n ** 18n;

describe('formatUnits', () => {
  it('keeps the raw, ungrouped unit string for internal use', () => {
    expect(formatUnits(99799100n * E18, 18)).toBe('99799100');
    expect(formatUnits(12345n, 1)).toBe('1234.5');
    expect(formatUnits(0n, 18)).toBe('0');
  });

  it('returns the unknown marker for an invalid decimals value', () => {
    expect(formatUnits(1n, -1)).toBe(UNKNOWN);
    expect(formatUnits(1n, 1.5)).toBe(UNKNOWN);
  });
});

describe('formatAmount', () => {
  it('never turns an unknown value into 0', () => {
    expect(formatAmount(undefined, 18)).toBe(UNKNOWN);
    expect(formatAmount(null, 18)).toBe(UNKNOWN);
  });

  it('renders a known zero as 0', () => {
    expect(formatAmount(0n, 18)).toBe('0');
    expect(formatAmount(0n, 0)).toBe('0');
  });

  it('groups the integer part with thousands separators', () => {
    expect(formatAmount(1n, 0)).toBe('1');
    expect(formatAmount(999n, 0)).toBe('999');
    expect(formatAmount(1000n, 0)).toBe('1,000');
    expect(formatAmount(1234n, 0)).toBe('1,234');
    expect(formatAmount(99799100n, 0)).toBe('99,799,100');
    expect(formatAmount(99799100n * E18, 18)).toBe('99,799,100');
    expect(formatAmount(1234567890n * E18, 18)).toBe('1,234,567,890');
  });

  it('keeps at most two decimals, trims trailing zeros and never rounds up', () => {
    expect(formatAmount(12345n, 1)).toBe('1,234.5');
    expect(formatAmount(150n, 2)).toBe('1.5');
    expect(formatAmount(199n, 2)).toBe('1.99');
    expect(formatAmount(1999n, 3)).toBe('1.99');
    expect(formatAmount(1234567n, 3)).toBe('1,234.56');
    expect(formatAmount(1n, 4)).toBe('0');
    expect(formatAmount(5n, 3)).toBe('0');
  });

  it('honours maxFractionDigits = 0 without dropping the grouping', () => {
    expect(formatAmount(12345n, 1, 0)).toBe('1,234');
    expect(formatAmount(1234n * E18, 18, 0)).toBe('1,234');
  });

  it('groups values far beyond Number.MAX_SAFE_INTEGER exactly', () => {
    const huge = 123456789012345678901234567890n;
    expect(formatAmount(huge, 0)).toBe('123,456,789,012,345,678,901,234,567,890');
    expect(formatAmount(huge * E18, 18)).toBe('123,456,789,012,345,678,901,234,567,890');
  });

  it('groups negative values consistently', () => {
    expect(formatAmount(-12345n, 1)).toBe('-1,234.5');
  });

  it('uses the explicit locale for grouping and decimal separators', () => {
    expect(DEFAULT_LOCALE).toBe('zh-CN');
    // The default stays byte-identical to the previous hard-coded output.
    expect(formatAmount(1234567n, 2, 2)).toBe('12,345.67');
    expect(formatAmount(1234567n, 2, 2, 'zh-CN')).toBe('12,345.67');
    // A non-default locale actually reaches grouping and the decimal point.
    expect(formatAmount(1234567n, 2, 2, 'de-DE')).toBe('12.345,67');
    expect(formatAmount(12345n, 1, 2, 'de-DE')).toBe('1.234,5');
    // Huge BigInts stay exact after locale grouping.
    expect(formatAmount(123456789012345678901234567890n, 0, 0, 'de-DE')).toBe(
      '123.456.789.012.345.678.901.234.567.890',
    );
  });
});

describe('formatDateTime', () => {
  it('formats dates through the explicit locale', () => {
    const instant = Date.UTC(2026, 0, 2, 12, 30);
    const en = formatDateTime(instant, 'en-US');
    const zh = formatDateTime(instant, 'zh-CN');
    expect(en).not.toBe(zh);
    expect(en).toMatch(/2026/);
    expect(zh).toMatch(/2026/);
    expect(formatDateTime(instant)).toBe(zh);
  });
});

describe('fractionDigitsForMagnitude', () => {
  it('picks the digit budget from the integer magnitude (owner 2026-11-19)', () => {
    // <1 → 6 位；1–999 → 4 位；1e3–1e6 → 2 位；≥1e6 → 0 位。
    expect(fractionDigitsForMagnitude(0n, 18)).toBe(6);
    expect(fractionDigitsForMagnitude(999_999_999_999_999_999n, 18)).toBe(6); // 0.999999999999999999
    expect(fractionDigitsForMagnitude(1n * E18, 18)).toBe(4); // 1
    expect(fractionDigitsForMagnitude(999n * E18, 18)).toBe(4); // 999.…
    expect(fractionDigitsForMagnitude(1_000n * E18, 18)).toBe(2); // 1,000
    expect(fractionDigitsForMagnitude(999_999n * E18, 18)).toBe(2); // 999,999
    expect(fractionDigitsForMagnitude(1_000_000n * E18, 18)).toBe(0); // 1,000,000
    expect(fractionDigitsForMagnitude(49_134_920_836n * E18, 18)).toBe(0);
  });

  it('reads the threshold from the integer part, not from the raw units', () => {
    // decimals = 0 时整数部分就是 value 本身，边界必须落在同一处。
    expect(fractionDigitsForMagnitude(999n, 0)).toBe(4);
    expect(fractionDigitsForMagnitude(1_000n, 0)).toBe(2);
    expect(fractionDigitsForMagnitude(1_000_000n, 0)).toBe(0);
  });

  it('uses the magnitude of negative values', () => {
    expect(fractionDigitsForMagnitude(-1n, 18)).toBe(6); // -1e-18
    expect(fractionDigitsForMagnitude(-1n * E18, 18)).toBe(4);
    expect(fractionDigitsForMagnitude(-1_000n * E18, 18)).toBe(2);
    expect(fractionDigitsForMagnitude(-1_000_000n * E18, 18)).toBe(0);
  });

  it('returns the six-digit default for unusable inputs', () => {
    expect(TOKEN_AMOUNT_MAX_FRACTION_DIGITS).toBe(6);
    expect(fractionDigitsForMagnitude(undefined, 18)).toBe(6);
    expect(fractionDigitsForMagnitude(null, 18)).toBe(6);
    expect(fractionDigitsForMagnitude(1n, -1)).toBe(6);
    expect(fractionDigitsForMagnitude(1n, 1.5)).toBe(6);
  });
});

describe('formatTokenAmount', () => {
  it('adapts the fraction digits to the magnitude, then trims trailing zeros', () => {
    // <1 → 6 位；1–999 → 4 位；1e3–1e6 → 2 位；≥1e6 → 0 位。
    expect(formatTokenAmount(123_456_789_000_000_000n, 18)).toBe('0.123456'); // 0.123456789
    expect(formatTokenAmount(223_606_797_000_000_000_000n, 18)).toBe('223.6067'); // 223.606797
    expect(formatTokenAmount(999_999_999_000_000_000_000n, 18)).toBe('999.9999'); // 999.999999
    expect(formatTokenAmount(9_999_885_749_000_000_000_000n, 18)).toBe('9,999.88');
    expect(formatTokenAmount(4_494_496_634_000_000_000_000n, 18)).toBe('4,494.49');
    expect(formatTokenAmount(99_998_199_990_000_000_000_000_000n, 18)).toBe('99,998,199');
    expect(formatTokenAmount(49_134_920_836_000_000_000_000_000_000n, 18)).toBe('49,134,920,836');
    expect(formatTokenAmount(1_234_500_000_000_000_000n, 18)).toBe('1.2345');
    // 语言环境参数与数量级规则同时生效。
    expect(formatTokenAmount(1_234_500_000_000_000_000_000n, 18, { locale: 'de-DE' })).toBe(
      '1.234,5',
    );
  });

  it('always truncates instead of rounding, even at a magnitude boundary', () => {
    // 截断不四舍五入：223.606797 → 223.6067（不是 .6068）、4,494.496634 → 4,494.49、
    // 999.999999 → 999.9999（不是 1,000）、0.123456789 → 0.123456（不是 .123457）。
    expect(formatTokenAmount(2_236_067_970_000_000_000_000n, 18)).toBe('2,236.06');
    expect(formatTokenAmount(1_999_999_999_999_999_999_999n, 18)).toBe('1,999.99');
    expect(formatTokenAmount(1n, 18)).toBe('0');
    expect(formatTokenAmount(1n, 6)).toBe('0.000001');
  });

  it('keeps a known zero but never turns an unknown value into zero', () => {
    expect(formatTokenAmount(0n, 18)).toBe('0');
    expect(formatTokenAmount(undefined, 18)).toBe(UNKNOWN);
    expect(formatTokenAmount(null, 18)).toBe(UNKNOWN);
    expect(formatTokenAmount(1n, undefined)).toBe(UNKNOWN);
  });

  it('allows an explicit cap only for fee/percentage surfaces', () => {
    expect(formatTokenAmount(1_999n, 3)).toBe('1.999');
    expect(formatTokenAmount(1_999n, 3, { maxFractionDigits: 2 })).toBe('1.99');
    expect(formatTokenAmount(1_999n, 3, { maxFractionDigits: 2, locale: 'de-DE' })).toBe('1,99');
  });
});

describe('formatVisibleTokenAmount', () => {
  it('never renders a non-zero amount the display rule truncates as a bare 0', () => {
    // 极小非零金额改为展示有效位（owner 2026-11-19）：1e-7 显示 0.0000001；
    // 1 wei（18 位）超出 12 位小数上限，退化为「< 最小可见单位」。
    expect(formatVisibleTokenAmount(1n, 18)).toBe('< 0.000000000001');
    expect(formatVisibleTokenAmount(100000000000n, 18)).toBe('0.0000001'); // 1e-7 ETH
    expect(formatVisibleTokenAmount(999999999999n, 18)).toBe('0.000000999');
    expect(formatVisibleTokenAmount(1000000000000n, 18)).toBe('0.000001');
  });

  it('keeps the exact-zero and unknown semantics of formatTokenAmount', () => {
    expect(formatVisibleTokenAmount(0n, 18)).toBe('0');
    expect(formatVisibleTokenAmount(undefined, 18)).toBe(UNKNOWN);
    expect(formatVisibleTokenAmount(null, 18)).toBe(UNKNOWN);
    expect(formatVisibleTokenAmount(1n, undefined)).toBe(UNKNOWN);
  });

  it('derives the smallest visible amount from the decimals and the cap', () => {
    // 12 位内优先显示有效位；只有超出 12 位才退化成「< 最小可见单位」。
    expect(formatVisibleTokenAmount(1n, 18)).toBe('< 0.000000000001');
    expect(formatVisibleTokenAmount(1n, 6)).toBe('0.000001');
    expect(formatVisibleTokenAmount(1n, 6)).toBe('0.000001');
    expect(formatVisibleTokenAmount(1n, 2)).toBe('0.01');
    // 显式 cap 同样决定「最小可见单位」，不是写死 6 位。
    expect(formatVisibleTokenAmount(1n, 18, { maxFractionDigits: 2 })).toBe('< 0.01');
  });
});

describe('formatPercent', () => {
  it('caps percentages at two fraction digits without rounding up', () => {
    expect(formatPercent(1.239)).toBe('1.23');
    expect(formatPercent(1.2)).toBe('1.2');
    expect(formatPercent(50)).toBe('50');
    expect(formatPercent(0.05)).toBe('0.05');
  });

  it('can keep a fixed number of digits for preset labels', () => {
    expect(formatPercent(0.1, { minimumFractionDigits: 1 })).toBe('0.1');
    expect(formatPercent(1, { minimumFractionDigits: 1 })).toBe('1.0');
  });

  it('returns the unknown marker for a non-finite percentage', () => {
    expect(formatPercent(Number.NaN)).toBe(UNKNOWN);
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe(UNKNOWN);
  });
});

describe('formatTinyPercent', () => {
  it('keeps the normal two-digit percentage when it is visible', () => {
    expect(formatTinyPercent(1.23)).toBe('1.23');
    expect(formatTinyPercent(0.5)).toBe('0.5');
    expect(formatTinyPercent(50)).toBe('50');
    // 两位小数照旧截断，不四舍五入。
    expect(formatTinyPercent(0.123456)).toBe('0.12');
  });

  it('renders a zero share as 0, never as the tiny marker', () => {
    expect(formatTinyPercent(0)).toBe('0');
  });

  it('switches to at most six fraction digits when two digits would render 0', () => {
    // 0.004 / 0.0001 / 0.000012 的两位小数都是 0.00，必须换成 6 位显示。
    expect(formatTinyPercent(0.004)).toBe('0.004');
    expect(formatTinyPercent(0.0001)).toBe('0.0001');
    expect(formatTinyPercent(0.000012)).toBe('0.000012');
    // 0.000001% 正好是 6 位可显示的最小值（不是 < 标记）。
    expect(formatTinyPercent(0.000001)).toBe('0.000001');
    // 6 位同样截断，不四舍五入。
    expect(formatTinyPercent(0.0000019)).toBe('0.000001');
  });

  it('shows tiny shares as 0.00000xxx instead of collapsing to 0', () => {
    // owner 2026-11-19：0.00000xxx 这类极小占比也要看得见。
    expect(formatTinyPercent(0.0000004)).toBe('0.0000004');
    expect(formatTinyPercent(0.0000001)).toBe('0.0000001');
    // 1e-9 远超 8 位小数：才退化为「< 最小可见百分比」。
    expect(formatTinyPercent(0.0000000001)).toBe('<0.00000001');
  });

  it('passes non-positive values through formatPercent', () => {
    expect(formatTinyPercent(-1.23)).toBe('-1.23');
    expect(formatTinyPercent(-0.05)).toBe(formatPercent(-0.05));
    expect(formatTinyPercent(-0.0000001)).toBe(formatPercent(-0.0000001));
  });

  it('returns the unknown marker for non-finite values', () => {
    expect(formatTinyPercent(Number.NaN)).toBe(UNKNOWN);
    expect(formatTinyPercent(Number.POSITIVE_INFINITY)).toBe(UNKNOWN);
    expect(formatTinyPercent(Number.NEGATIVE_INFINITY)).toBe(UNKNOWN);
  });
});

describe('formatBpsPercent', () => {
  it('renders basis points as a two-digit percentage', () => {
    expect(formatBpsPercent(0)).toBe('0');
    expect(formatBpsPercent(50)).toBe('0.5');
    expect(formatBpsPercent(123)).toBe('1.23');
    expect(formatBpsPercent(1234)).toBe('12.34');
    expect(formatBpsPercent(Number.NaN)).toBe(UNKNOWN);
  });
});

describe('formatRate', () => {
  it('groups the integer part and caps rates at two decimals', () => {
    expect(formatRate(2_000n * E18, E18, 18, 18)).toBe('2,000');
    expect(formatRate(1_993_801_200_000_000_000_000n, E18, 18, 18)).toBe('1,993.8');
    expect(formatRate(5n * 10n ** 14n, E18, 18, 18)).toBe('0');
  });

  it('returns the unknown marker for unusable inputs', () => {
    expect(formatRate(1n, 0n, 18, 18)).toBe(UNKNOWN);
    expect(formatRate(1n, E18, -1, 18)).toBe(UNKNOWN);
  });
});
