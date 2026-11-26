import { describe, expect, it } from 'vitest';
import { applySlippageDown, percentToBps } from './percent';

describe('percentToBps', () => {
  it('converts percentages to basis points', () => {
    expect(percentToBps(0.5)).toBe(50);
    expect(percentToBps(2.5)).toBe(250);
    expect(percentToBps(0)).toBe(0);
    expect(percentToBps(100)).toBe(10_000);
  });
});

describe('applySlippageDown', () => {
  it('returns the amount unchanged at zero slippage', () => {
    expect(applySlippageDown(1_000n, 0)).toBe(1_000n);
    expect(applySlippageDown(1_000n, 0, { clamp: false })).toBe(1_000n);
  });

  it('applies the tolerance and floors', () => {
    expect(applySlippageDown(10_000n, 50)).toBe(9_950n);
    expect(applySlippageDown(1_000n, 250)).toBe(975n);
  });

  it('clamps by default (liquidity/swap behaviour)', () => {
    // 上界 9999 后向下取整：1000 × 1 / 10000 = 0
    expect(applySlippageDown(1_000n, 20_000)).toBe(0n);
    expect(applySlippageDown(1_000n, -5)).toBe(1_000n);
  });

  it('can skip clamping for the stake panel semantics', () => {
    // clamp:false 时 bps > 10000 会真的变成负数——历史实现就是这样，本轮不改。
    expect(applySlippageDown(1_000n, 20_000, { clamp: false })).toBe(-1_000n);
  });

  it('rounds bps to a whole basis point before applying it', () => {
    expect(applySlippageDown(10_000n, 50.4)).toBe(9_950n);
    expect(applySlippageDown(10_000n, 50.6)).toBe(9_949n);
  });
});
