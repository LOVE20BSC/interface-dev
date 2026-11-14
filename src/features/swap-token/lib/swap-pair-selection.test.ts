import { describe, expect, it } from 'vitest';
import { resolvePairSelection } from './swap-pair-selection';
import type { SwapToken } from './swap-types';

const ETH: SwapToken = { kind: 'native', address: undefined, symbol: 'ETH', decimals: 18 };
const WETH: SwapToken = {
  kind: 'wrapped',
  address: '0x0000000000000000000000000000000000000001',
  symbol: 'TestWETH',
  decimals: 18,
};
const TOKEN: SwapToken = {
  kind: 'community',
  address: '0x0000000000000000000000000000000000000002',
  symbol: 'TestLOVE20',
  decimals: 18,
};

describe('resolvePairSelection', () => {
  it('replaces only the selected side when the two tokens stay different', () => {
    const next = resolvePairSelection({ from: ETH, to: WETH }, 'from', TOKEN);
    expect(next).toEqual({ from: TOKEN, to: WETH });
  });

  it('swaps the direction when 从 picks the token already selected as 到', () => {
    // owner: 从=ETH/到=WETH 改成 从=WETH → 到 自动变 ETH
    const next = resolvePairSelection({ from: ETH, to: WETH }, 'from', WETH);
    expect(next?.from.symbol).toBe('TestWETH');
    expect(next?.to.symbol).toBe('ETH');
  });

  it('swaps the direction when 到 picks the token already selected as 从', () => {
    const next = resolvePairSelection({ from: ETH, to: TOKEN }, 'to', ETH);
    expect(next?.from.symbol).toBe('TestLOVE20');
    expect(next?.to.symbol).toBe('ETH');
  });

  it('never returns the same token on both sides', () => {
    for (const side of ['from', 'to'] as const) {
      const next = resolvePairSelection(
        { from: ETH, to: WETH },
        side,
        side === 'from' ? WETH : ETH,
      );
      expect(next?.from.symbol).not.toBe(next?.to.symbol);
    }
  });

  it('replaces the selected side while the other side is still resolving', () => {
    expect(resolvePairSelection({ from: undefined, to: WETH }, 'from', TOKEN)).toEqual({
      from: TOKEN,
      to: WETH,
    });
    expect(resolvePairSelection({ from: ETH, to: undefined }, 'to', TOKEN)).toEqual({
      from: ETH,
      to: TOKEN,
    });
  });

  it('returns null when a duplicate selection has no token to swap back', () => {
    expect(resolvePairSelection({ from: undefined, to: WETH }, 'to', WETH)).toBeNull();
    expect(resolvePairSelection({ from: ETH, to: undefined }, 'from', ETH)).toBeNull();
  });
});
