import { describe, expect, it } from 'vitest';
import {
  DEADLINE_SECONDS,
  deadlineFromNow,
  DEFAULT_SLIPPAGE_PERCENT,
  isSlippageValid,
  parseAmount,
  parseWithdrawPercent,
  percentToBps,
} from '@/features/liquidity-pool/lib/liquidity-form';

describe('parseAmount', () => {
  it('parses exact decimals and truncation rules', () => {
    expect(parseAmount('100000', 18)).toEqual({ kind: 'ok', value: 100000n * 10n ** 18n });
    expect(parseAmount('0.5', 18)).toEqual({ kind: 'ok', value: 5n * 10n ** 17n });
    expect(parseAmount('', 18)).toEqual({ kind: 'empty' });
    expect(parseAmount('-1', 18)).toEqual({ kind: 'invalid' });
    expect(parseAmount('abc', 18)).toEqual({ kind: 'invalid' });
    // 19 位小数在 18 位精度下被拒绝，而不是悄悄截断。
    expect(parseAmount('1.0000000000000000001', 18)).toEqual({
      kind: 'too-precise',
      digits: 18,
    });
  });
});

describe('滑点校验', () => {
  it('accepts the default and rejects out-of-range values', () => {
    expect(DEFAULT_SLIPPAGE_PERCENT).toBe(0.5);
    expect(percentToBps(DEFAULT_SLIPPAGE_PERCENT)).toBe(50);
    expect(isSlippageValid(0.5)).toBe(true);
    expect(isSlippageValid(0.01)).toBe(true);
    expect(isSlippageValid(50)).toBe(true);
    expect(isSlippageValid(0)).toBe(false);
    expect(isSlippageValid(50.01)).toBe(false);
    expect(isSlippageValid(Number.NaN)).toBe(false);
  });
});

describe('deadline', () => {
  it('is now + 20 minutes in seconds', () => {
    expect(DEADLINE_SECONDS).toBe(1200);
    expect(deadlineFromNow(1_700_000_000_000)).toBe(1_700_001_200n);
  });
});

describe('parseWithdrawPercent', () => {
  it('accepts 0–100 and rejects invalid input', () => {
    expect(parseWithdrawPercent('25')).toBe(25);
    expect(parseWithdrawPercent('33.5')).toBe(33.5);
    expect(parseWithdrawPercent('0')).toBeUndefined();
    expect(parseWithdrawPercent('100.5')).toBeUndefined();
    expect(parseWithdrawPercent('')).toBeUndefined();
    expect(parseWithdrawPercent('abc')).toBeUndefined();
  });
});
