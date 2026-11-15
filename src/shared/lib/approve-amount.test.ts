import { describe, expect, it } from 'vitest';
import { UNLIMITED_APPROVAL_VALUE, decideApproveAmount } from '@/shared/lib/approve-amount';

/**
 * The one rule that makes 「默认使用长期授权」 actually reach the chain
 * (owner 2026-11-16): preference on → `maxUint256`, preference off → the exact
 * amount this transaction needs.
 */
describe('decideApproveAmount', () => {
  it('writes maxUint256 when the long-term preference is on', () => {
    expect(decideApproveAmount(true, 1n)).toBe(UNLIMITED_APPROVAL_VALUE);
    expect(decideApproveAmount(true, 100n * 10n ** 18n)).toBe(UNLIMITED_APPROVAL_VALUE);
    expect(decideApproveAmount(true, 1234567890123456789n)).toBe(UNLIMITED_APPROVAL_VALUE);
  });

  it('writes the exact amount when the preference is off', () => {
    expect(decideApproveAmount(false, 1n)).toBe(1n);
    expect(decideApproveAmount(false, 100n * 10n ** 18n)).toBe(100n * 10n ** 18n);
    expect(decideApproveAmount(false, 1234567890123456789n)).toBe(1234567890123456789n);
    expect(decideApproveAmount(false, 0n)).toBe(0n);
  });

  it('maxUint256 is above the 2^255 长期授权 threshold', () => {
    expect(UNLIMITED_APPROVAL_VALUE).toBe(2n ** 256n - 1n);
    expect(UNLIMITED_APPROVAL_VALUE >= 2n ** 255n).toBe(true);
  });
});
