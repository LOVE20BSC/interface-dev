import { describe, expect, it } from 'vitest';
import { formatSharePercent } from './share-percent';

describe('formatSharePercent', () => {
  it('formats normal shares with two decimals, truncated and trimmed', () => {
    expect(formatSharePercent(1n, 1n)).toBe('100');
    expect(formatSharePercent(1n, 2n)).toBe('50');
    expect(formatSharePercent(1n, 3n)).toBe('33.33');
    expect(formatSharePercent(4472n, 4695n)).toBe('95.25');
  });

  it('truncates instead of rounding at the 100% boundary', () => {
    // 99.99999999999999998% 不能因为浮点进位显示成 100%。
    expect(formatSharePercent(10n ** 24n - 1000n, 10n ** 24n)).toBe('99.99');
  });

  it('keeps tiny but positive shares as 0.{x}yyyy instead of 0%', () => {
    expect(formatSharePercent(1n, 100_000n)).toBe('0.001');
    expect(formatSharePercent(1n, 1_000_000n)).toBe('0.0001');
    expect(formatSharePercent(1n, 10n ** 24n)).toBe('0.0000000000000000000001');
  });

  it('keeps "unknown" and a real zero apart', () => {
    expect(formatSharePercent(undefined, 10n)).toBeUndefined();
    expect(formatSharePercent(10n, undefined)).toBeUndefined();
    expect(formatSharePercent(0n, 0n)).toBe('0');
    expect(formatSharePercent(0n, 10n)).toBe('0');
    expect(formatSharePercent(5n, 0n)).toBeUndefined();
  });
});
