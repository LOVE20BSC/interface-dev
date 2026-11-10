import { describe, expect, it } from 'vitest';
import { approveAmountFor } from '@/features/mint-identity/lib/approve-amount';

describe('approveAmountFor', () => {
  it('adds a 1% buffer and rounds up', () => {
    expect(approveAmountFor(100n)).toBe(101n);
    expect(approveAmountFor(101n)).toBe(103n);
    expect(approveAmountFor(1n)).toBe(2n);
  });

  it('never returns zero for a positive cost and is zero only for a zero cost', () => {
    expect(approveAmountFor(0n)).toBe(0n);
    expect(approveAmountFor(9n * 10n ** 20n)).toBe(909n * 10n ** 18n);
  });

  it('is always at least the required amount', () => {
    for (const cost of [1n, 2n, 999n, 123456789n, 10n ** 30n]) {
      expect(approveAmountFor(cost)).toBeGreaterThanOrEqual(cost);
    }
  });
});
