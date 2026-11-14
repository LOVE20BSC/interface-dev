import { describe, expect, it } from 'vitest';
import { swapBalanceLine } from './swap-balance-line';

describe('swapBalanceLine', () => {
  it('writes 余额 + symbol once, then the grouped amount', () => {
    expect(swapBalanceLine('TestLOVE20', 1_234_500_000_000_000_000_000n, 18)).toBe(
      '余额 TestLOVE20 1,234.5',
    );
  });

  it('keeps at most six fraction digits (truncated, never rounded up)', () => {
    // 0.123456789 → 0.123456, both sides use the same rule.
    expect(swapBalanceLine('TestWETH', 123_456_789_000_000_000n, 18)).toBe(
      '余额 TestWETH 0.123456',
    );
  });

  it('renders a zero balance as 0, not as an unknown dash', () => {
    expect(swapBalanceLine('TestWETH', 0n, 18)).toBe('余额 TestWETH 0');
  });

  it('renders an unknown balance as — and never as 0', () => {
    expect(swapBalanceLine('TestWETH', undefined, 18)).toBe('余额 TestWETH —');
  });

  it('never writes a precision label, including non-18 decimals', () => {
    const line = swapBalanceLine('TestUSDC', 12_345_678n, 6);
    expect(line).toBe('余额 TestUSDC 12.345678');
    expect(line).not.toContain('精度');
  });

  it('falls back to — when decimals are unknown (loading token metadata)', () => {
    expect(swapBalanceLine('TestWETH', 10n ** 18n, undefined)).toBe('余额 TestWETH —');
  });
});
