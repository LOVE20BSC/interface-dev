import { describe, expect, it } from 'vitest';
import { formatAmount, formatUnits, UNKNOWN } from '@/shared/lib/format';

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
});
