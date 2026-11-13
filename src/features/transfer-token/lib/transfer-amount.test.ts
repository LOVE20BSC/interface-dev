import { describe, expect, it } from 'vitest';
import {
  maxTransferAmount,
  parseTransferAmount,
  spendableTransferBalance,
} from '@/features/transfer-token/lib/transfer-amount';
import { NATIVE_FEE_RESERVE_WEI } from '@/features/transfer-token/lib/transfer-types';

describe('parseTransferAmount', () => {
  it('parses whole and fractional amounts into exact wei', () => {
    expect(parseTransferAmount('1.5', 18)).toEqual({
      kind: 'ok',
      value: 1500000000000000000n,
      truncated: false,
    });
    expect(parseTransferAmount('0.1', 18)).toEqual({
      kind: 'ok',
      value: 100000000000000000n,
      truncated: false,
    });
    expect(parseTransferAmount(' 99,799,100 ', 18)).toEqual({ kind: 'invalid' });
  });

  it('treats empty input and zero as their own states', () => {
    expect(parseTransferAmount('', 18)).toEqual({ kind: 'empty' });
    expect(parseTransferAmount('   ', 18)).toEqual({ kind: 'empty' });
    expect(parseTransferAmount('0', 18)).toEqual({ kind: 'zero' });
    expect(parseTransferAmount('0.000', 18)).toEqual({ kind: 'zero' });
  });

  it('rejects negative, signed, exponent and non-numeric input', () => {
    for (const raw of ['-1', '+1', '1e18', 'abc', '1 2', '1,5', '０.１', '.']) {
      expect(parseTransferAmount(raw, 18).kind).toBe('invalid');
    }
  });

  it('truncates excess fraction digits to the token precision (never rounds up)', () => {
    expect(parseTransferAmount('1.5000000000000000009', 18)).toEqual({
      kind: 'ok',
      value: 1500000000000000000n,
      truncated: true,
    });
    expect(parseTransferAmount('1.23456', 2)).toEqual({
      kind: 'ok',
      value: 123n,
      truncated: true,
    });
  });

  it('truncating a sub-unit amount to nothing is zero, not a tiny send', () => {
    expect(parseTransferAmount('0.0001', 2)).toEqual({ kind: 'zero' });
  });
});

describe('maxTransferAmount / spendableTransferBalance', () => {
  it('keeps the full token balance for ERC20', () => {
    expect(maxTransferAmount(123456789n, false)).toBe(123456789n);
    expect(maxTransferAmount(0n, false)).toBe(0n);
  });

  it('withholds the native fee reserve and never goes negative', () => {
    const balance = 10000000000000000000000n; // 10,000 ETH
    expect(maxTransferAmount(balance, true)).toBe(balance - NATIVE_FEE_RESERVE_WEI);
    expect(maxTransferAmount(NATIVE_FEE_RESERVE_WEI, true)).toBe(0n);
    expect(maxTransferAmount(1n, true)).toBe(0n);
  });

  it('spendable balance mirrors the same rule', () => {
    expect(spendableTransferBalance(undefined, true)).toBeUndefined();
    expect(spendableTransferBalance(50n, false)).toBe(50n);
    expect(spendableTransferBalance(NATIVE_FEE_RESERVE_WEI * 2n, true)).toBe(
      NATIVE_FEE_RESERVE_WEI,
    );
  });
});
