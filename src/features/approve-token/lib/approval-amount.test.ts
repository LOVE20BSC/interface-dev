import { describe, expect, it } from 'vitest';
import {
  UNLIMITED_APPROVAL_THRESHOLD,
  UNLIMITED_APPROVAL_VALUE,
  approvalDisplayText,
  approvalKind,
  canRaiseAllowance,
  canRevokeAllowance,
} from '@/features/approve-token/lib/approval-amount';

const SYMBOL = 'TestLOVE20';
const E18 = 10n ** 18n;

describe('approvalKind', () => {
  it('classifies zero as unapproved', () => {
    expect(approvalKind(0n)).toBe('unapproved');
    expect(approvalKind(-1n)).toBe('unapproved');
  });

  it('classifies concrete amounts below 2^255 as limited', () => {
    expect(approvalKind(1n)).toBe('limited');
    expect(approvalKind(1500000000000000000n)).toBe('limited');
    expect(approvalKind(UNLIMITED_APPROVAL_THRESHOLD - 1n)).toBe('limited');
  });

  it('classifies 2^255 and above as unlimited (threshold is inclusive)', () => {
    expect(approvalKind(UNLIMITED_APPROVAL_THRESHOLD)).toBe('unlimited');
    expect(approvalKind(UNLIMITED_APPROVAL_VALUE)).toBe('unlimited');
  });
});

describe('approvalDisplayText', () => {
  it('renders the three states with fixed copy', () => {
    expect(approvalDisplayText(0n, SYMBOL, 18)).toBe('未授权');
    expect(approvalDisplayText(UNLIMITED_APPROVAL_VALUE, SYMBOL, 18)).toBe('长期授权');
    expect(approvalDisplayText(1500000000000000000n, SYMBOL, 18)).toBe(`1.5 ${SYMBOL}`);
  });

  it('truncates to six fraction digits instead of rounding', () => {
    expect(approvalDisplayText(1234567890123456789n, SYMBOL, 18)).toBe(`1.234567 ${SYMBOL}`);
    expect(approvalDisplayText(999999999999999999n, SYMBOL, 18)).toBe(`0.999999 ${SYMBOL}`);
    expect(approvalDisplayText(1999999999999999999n, SYMBOL, 18)).toBe(`1.999999 ${SYMBOL}`);
  });

  it('never renders a non-zero allowance as 0', () => {
    expect(approvalDisplayText(1n, SYMBOL, 18)).toBe(`< 0.000001 ${SYMBOL}`);
    expect(approvalDisplayText(999999999999n, SYMBOL, 18)).toBe(`< 0.000001 ${SYMBOL}`);
    expect(approvalDisplayText(1000000000000n, SYMBOL, 18)).toBe(`0.000001 ${SYMBOL}`);
  });

  it('formats whole amounts with grouping and honors the token decimals', () => {
    expect(approvalDisplayText(99799100n * E18, SYMBOL, 18)).toBe(`99,799,100 ${SYMBOL}`);
    expect(approvalDisplayText(150n, 'USDC', 2)).toBe(`1.5 USDC`);
    expect(approvalDisplayText(123n, 'USDC', 2)).toBe(`1.23 USDC`);
  });

  it('renders the 2^255 - 1 boundary as a concrete amount', () => {
    expect(approvalDisplayText(UNLIMITED_APPROVAL_THRESHOLD - 1n, SYMBOL, 18)).toBe(
      `57,896,044,618,658,097,711,785,492,504,343,953,926,634,992,332,820,282,019,728.792003 ${SYMBOL}`,
    );
  });
});

describe('button availability', () => {
  it('disables both buttons until the allowance is known', () => {
    expect(canRaiseAllowance(undefined)).toBe(false);
    expect(canRevokeAllowance(undefined)).toBe(false);
  });

  it('offers 长期授权 for unapproved and concrete rows, but not for long-term rows', () => {
    expect(canRaiseAllowance(0n)).toBe(true);
    expect(canRaiseAllowance(1n)).toBe(true);
    expect(canRaiseAllowance(UNLIMITED_APPROVAL_THRESHOLD)).toBe(false);
  });

  it('offers 撤销 only when something is approved', () => {
    expect(canRevokeAllowance(0n)).toBe(false);
    expect(canRevokeAllowance(1n)).toBe(true);
    expect(canRevokeAllowance(UNLIMITED_APPROVAL_VALUE)).toBe(true);
  });
});
