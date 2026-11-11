import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  formatAmount,
  formatBpsPercent,
  formatDateTime,
  formatPercent,
  formatRate,
  formatTokenAmount,
  formatUnits,
  UNKNOWN,
} from '@/shared/lib/format';

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

describe('formatTokenAmount', () => {
  it('is the single token rule: max 6 decimals, trailing zeros trimmed', () => {
    expect(formatTokenAmount(1_234_500_000_000_000_000n, 18)).toBe('1.2345');
    expect(formatTokenAmount(9_999_885_749_000_000_000_000n, 18)).toBe('9,999.885749');
    expect(formatTokenAmount(99_998_199_990_000_000_000_000_000n, 18)).toBe('99,998,199.99');
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
