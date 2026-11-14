import { describe, expect, it } from 'vitest';
import {
  computeSwapFee,
  formatSwapFeePercent,
  SWAP_FEE_RATIO_SCALE,
  type SwapFeeRatios,
} from './swap-fee';

/**
 * Theory values come from docs/product/three-line/swap-fee.md §1 (written before
 * the implementation). Case A is the local dev profile; B1/B2 are the
 * non-integer / non-zero-protocol cases the page cannot show on the single
 * verification chain.
 */
function ratios(lpRatio: bigint, protocolRatio: bigint): SwapFeeRatios {
  return { lpRatio, protocolRatio };
}

describe('swap fee from Stake ratios', () => {
  it('A: dev profile lp=3e15 / proto=0 renders 0.30', () => {
    const fee = computeSwapFee(ratios(3_000_000_000_000_000n, 0n));
    expect(fee).toEqual({ ratio: 3_000_000_000_000_000n, percent: '0.30' });
  });

  it('A: the fee is lp + proto, not 1e18 − lp − proto (which is 99.7%)', () => {
    const ratio = 3_000_000_000_000_000n;
    expect(computeSwapFee(ratios(ratio, 0n))?.percent).toBe('0.30');
    expect(SWAP_FEE_RATIO_SCALE - ratio).toBe(997_000_000_000_000_000n);
  });

  it('B1: truncates a non-integer percent to two digits (0.12345678901…% → 0.12)', () => {
    expect(computeSwapFee(ratios(1_234_567_890_123_456n, 0n))?.percent).toBe('0.12');
  });

  it('B2: adds both ratios (0.65% + 0.15% → 0.80)', () => {
    expect(
      computeSwapFee(ratios(6_500_000_000_000_000n, 1_500_000_000_000_000n))?.percent,
    ).toBe('0.80');
  });

  it('formats without a float round-trip (0.29% must not become 0.28)', () => {
    expect(formatSwapFeePercent(2_900_000_000_000_000n)).toBe('0.29');
    expect(formatSwapFeePercent(1_000_000_000_000_000n)).toBe('0.10');
    expect(formatSwapFeePercent(1_500_000_000_000_000n)).toBe('0.15');
    expect(formatSwapFeePercent(99_700_000_000_000_000n)).toBe('9.97');
  });

  it('C: no data at all → undefined (page keeps 以链上费率为准)', () => {
    expect(computeSwapFee(undefined)).toBeUndefined();
  });

  it('D: profiles that violate Stake invariants → undefined, never a number', () => {
    // lp + proto would consume the whole amount (contract: SwapFeeRatiosConsumeTheWholeAmount).
    expect(computeSwapFee(ratios(600_000_000_000_000_000n, 500_000_000_000_000_000n))).toBeUndefined();
    expect(computeSwapFee(ratios(0n, 0n))).toBeUndefined();
    expect(computeSwapFee(ratios(0n, SWAP_FEE_RATIO_SCALE))).toBeUndefined();
    // Below one hundredth of a percent there is nothing honest to print.
    expect(computeSwapFee(ratios(1n, 0n))).toBeUndefined();
  });
});
