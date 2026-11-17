import { describe, expect, it } from 'vitest';
import { amountShortfall, estimateLpMinted, parsePhaseCount, parseStakeAmount } from './stake-form';

describe('parseStakeAmount', () => {
  it('parses plain decimals into wei', () => {
    expect(parseStakeAmount('1', 18)).toEqual({ kind: 'ok', value: 10n ** 18n });
    expect(parseStakeAmount('0.5', 18)).toEqual({ kind: 'ok', value: 5n * 10n ** 17n });
    expect(parseStakeAmount('.25', 18)).toEqual({ kind: 'ok', value: 25n * 10n ** 16n });
  });

  it('rejects more fraction digits than the token precision', () => {
    expect(parseStakeAmount('0.0000000000000000001', 18)).toEqual({
      kind: 'too-precise',
      digits: 18,
    });
  });

  it('rejects empty, negative, exponent and non-numeric input', () => {
    expect(parseStakeAmount('', 18)).toEqual({ kind: 'empty' });
    expect(parseStakeAmount('  ', 18)).toEqual({ kind: 'empty' });
    expect(parseStakeAmount('-1', 18)).toEqual({ kind: 'invalid' });
    expect(parseStakeAmount('1e18', 18)).toEqual({ kind: 'invalid' });
    expect(parseStakeAmount('abc', 18)).toEqual({ kind: 'invalid' });
    expect(parseStakeAmount('.', 18)).toEqual({ kind: 'invalid' });
  });

  it('treats zero as a valid parsed value (the page rejects it separately)', () => {
    expect(parseStakeAmount('0', 18)).toEqual({ kind: 'ok', value: 0n });
  });
});

describe('parsePhaseCount', () => {
  it('accepts integers only', () => {
    expect(parsePhaseCount('1')).toEqual({ kind: 'ok', value: 1n });
    expect(parsePhaseCount('100')).toEqual({ kind: 'ok', value: 100n });
    expect(parsePhaseCount('1.5')).toEqual({ kind: 'invalid' });
    expect(parsePhaseCount('-3')).toEqual({ kind: 'invalid' });
    expect(parsePhaseCount('')).toEqual({ kind: 'empty' });
    expect(parsePhaseCount('10a')).toEqual({ kind: 'invalid' });
  });
});

describe('amountShortfall', () => {
  it('returns null when the balance covers the need', () => {
    expect(amountShortfall(100n, 100n)).toBeUndefined();
    expect(amountShortfall(101n, 100n)).toBeUndefined();
  });

  it('returns the positive gap', () => {
    expect(amountShortfall(40n, 100n)).toBe(60n);
  });

  it('returns undefined when either side is unknown', () => {
    expect(amountShortfall(undefined, 100n)).toBeUndefined();
    expect(amountShortfall(100n, undefined)).toBeUndefined();
  });
});

describe('estimateLpMinted', () => {
  const seeded = {
    reserveToken: 200_000n * 10n ** 18n,
    reserveParent: 100n * 10n ** 18n,
    lpTotalSupply: 4_472_135_954_999_579_392_818n,
  };

  it('matches the Uniswap V2 mint formula for a proportional deposit', () => {
    // 1000 TestLOVE20 + 1 TestWETH is exactly 0.5% of the seeded pool.
    const lp = estimateLpMinted({
      ...seeded,
      tokenAmount: 1000n * 10n ** 18n,
      parentTokenAmount: 10n ** 18n,
    });
    expect(lp).toBe(22_360_679_774_997_896_964n);
  });

  it('clamps the two sides with the same rule as the contract', () => {
    // 1000 tokens + 1 WETH: the parent side is the binding one (0.5 WETH needed
    // for 1000 tokens at the pool ratio), so the LP is computed from 0.5 WETH.
    const clamped = estimateLpMinted({
      ...seeded,
      tokenAmount: 1000n * 10n ** 18n,
      parentTokenAmount: 10n ** 18n,
    });
    // Twice the parent input cannot mint more than twice the LP.
    const doubled = estimateLpMinted({
      ...seeded,
      tokenAmount: 2000n * 10n ** 18n,
      parentTokenAmount: 2n * 10n ** 18n,
    });
    expect(clamped).not.toBeNull();
    expect(doubled).toBe((clamped ?? 0n) * 2n);
  });

  it('returns null for an empty pool or unknown supply', () => {
    expect(
      estimateLpMinted({
        tokenAmount: 1n,
        parentTokenAmount: 1n,
        reserveToken: 0n,
        reserveParent: 10n ** 18n,
        lpTotalSupply: 10n ** 18n,
      }),
    ).toBeNull();
    expect(
      estimateLpMinted({
        tokenAmount: 1n,
        parentTokenAmount: 1n,
        reserveToken: 10n,
        reserveParent: 10n,
        lpTotalSupply: 0n,
      }),
    ).toBeNull();
  });
});
