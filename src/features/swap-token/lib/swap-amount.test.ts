import { describe, expect, it } from 'vitest';
import {
  applySlippage,
  isSlippagePercentValid,
  parseSwapAmount,
  percentToBps,
  priceImpactBps,
} from './swap-amount';
import type { SwapPairInfo } from './swap-types';

const WETH = '0x0000000000000000000000000000000000000001';
const TOKEN = '0x0000000000000000000000000000000000000002';

function pair(overrides: Partial<SwapPairInfo> = {}): SwapPairInfo {
  return {
    address: '0x0000000000000000000000000000000000000010',
    token0: TOKEN,
    token1: WETH,
    reserve0: 200_000n * 10n ** 18n,
    reserve1: 100n * 10n ** 18n,
    ...overrides,
  };
}

describe('swap amount parsing', () => {
  it('distinguishes empty, invalid and too-precise input', () => {
    expect(parseSwapAmount('', 18)).toEqual({ kind: 'empty' });
    expect(parseSwapAmount('   ', 18)).toEqual({ kind: 'empty' });
    expect(parseSwapAmount('abc', 18)).toEqual({ kind: 'invalid' });
    expect(parseSwapAmount('1.2.3', 18)).toEqual({ kind: 'invalid' });
    expect(parseSwapAmount('1.234', 2)).toEqual({ kind: 'too-precise', digits: 2 });
  });

  it('normalizes leading/trailing dots and leading zeros', () => {
    expect(parseSwapAmount('.5', 18)).toEqual({ kind: 'ok', value: 5n * 10n ** 17n });
    expect(parseSwapAmount('1.', 18)).toEqual({ kind: 'ok', value: 10n ** 18n });
    expect(parseSwapAmount('0001.20', 18)).toEqual({ kind: 'ok', value: 12n * 10n ** 17n });
  });
});

describe('price protection', () => {
  it('floors the minimum out at the chosen percentage', () => {
    expect(applySlippage(10_000n, 50)).toBe(9_950n);
    expect(applySlippage(1_001n, 50)).toBe(995n);
    expect(applySlippage(1n, 50)).toBe(0n);
    expect(percentToBps(0.5)).toBe(50);
    expect(percentToBps(1.0)).toBe(100);
  });

  it('accepts only the documented custom range', () => {
    expect(isSlippagePercentValid(0.01)).toBe(true);
    expect(isSlippagePercentValid(50)).toBe(true);
    expect(isSlippagePercentValid(0.001)).toBe(false);
    expect(isSlippagePercentValid(50.1)).toBe(false);
    expect(isSlippagePercentValid(Number.NaN)).toBe(false);
  });
});

describe('impact estimates', () => {
  it('derives impact from reserves and the executed quote, including the fee', () => {
    // 1 WETH into 100 WETH / 200k token, with a 0.3% fee quote.
    const impact = priceImpactBps(10n ** 18n, 1994n * 10n ** 18n, [WETH, TOKEN], [pair()]);
    expect(impact).toBeDefined();
    expect(impact ?? 0).toBeGreaterThanOrEqual(25);
    expect(impact ?? 0).toBeLessThanOrEqual(35);
  });

  it('hides the impact when the quote matches the marginal price', () => {
    expect(priceImpactBps(10n ** 18n, 2_000n * 10n ** 18n, [WETH, TOKEN], [pair()])).toBe(0);
  });
});
