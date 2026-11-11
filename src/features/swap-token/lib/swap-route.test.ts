import { describe, expect, it } from 'vitest';
import { ancestorChain, evaluateRoute, findSwapPath, type HopPairRead } from './swap-route';

const WETH = '0x0000000000000000000000000000000000000001';
const PARENT = '0x0000000000000000000000000000000000000002';
const CHILD_A = '0x0000000000000000000000000000000000000003';
const CHILD_B = '0x0000000000000000000000000000000000000004';
const GRANDCHILD = '0x0000000000000000000000000000000000000005';

const parents = new Map<string, `0x${string}`>([
  [PARENT, WETH],
  [CHILD_A, PARENT],
  [CHILD_B, PARENT],
  [GRANDCHILD, CHILD_A],
]);

const parentOf = (token: `0x${string}`): `0x${string}` | undefined =>
  parents.get(token.toLowerCase());

const PAIR_A = '0x0000000000000000000000000000000000000010';
const PAIR_B = '0x0000000000000000000000000000000000000011';

describe('Launch parent-tree routing', () => {
  it('climbs to the root and stops at WETH', () => {
    expect(ancestorChain(CHILD_A, WETH, parentOf)).toEqual([CHILD_A, PARENT, WETH]);
    expect(ancestorChain(WETH, WETH, parentOf)).toEqual([WETH]);
  });

  it('finds direct, one-parent and sibling paths', () => {
    expect(findSwapPath(WETH, PARENT, WETH, parentOf)).toEqual([WETH, PARENT]);
    expect(findSwapPath(WETH, CHILD_A, WETH, parentOf)).toEqual([WETH, PARENT, CHILD_A]);
    expect(findSwapPath(CHILD_A, CHILD_B, WETH, parentOf)).toEqual([CHILD_A, PARENT, CHILD_B]);
  });

  it('rejects a route that would need more than three tokens', () => {
    expect(findSwapPath(WETH, GRANDCHILD, WETH, parentOf)).toBeNull();
    expect(findSwapPath(GRANDCHILD, CHILD_B, WETH, parentOf)).toBeNull();
  });

  it('returns null for identical endpoints or unregistered parents', () => {
    expect(findSwapPath(CHILD_A, CHILD_A, WETH, parentOf)).toBeNull();
    expect(
      findSwapPath(CHILD_A, '0x00000000000000000000000000000000000000ff', WETH, parentOf),
    ).toBeNull();
  });
});

describe('pair/reserve validation', () => {
  const readyHop = (): HopPairRead => ({
    pair: PAIR_A,
    token0: PARENT,
    token1: WETH,
    reserve0: 1_000n,
    reserve1: 2_000n,
  });

  it('accepts a path whose every hop has reserves', () => {
    const check = evaluateRoute([WETH, PARENT], [readyHop()]);
    expect(check.status).toBe('ready');
    expect(check.pairs).toHaveLength(1);
    expect(check.allPairs).toHaveLength(1);
  });

  it('distinguishes a zero-liquidity pair (empty pool) from a missing pair', () => {
    const empty = evaluateRoute([WETH, PARENT], [{ ...readyHop(), reserve1: 0n }]);
    expect(empty.status).toBe('empty-pool');
    expect(empty.failingHop).toBe(0);
    expect(empty.pairs).toEqual([]);
    expect(empty.allPairs).toHaveLength(1);

    const missing = evaluateRoute(
      [WETH, PARENT],
      [
        {
          pair: undefined,
          token0: undefined,
          token1: undefined,
          reserve0: undefined,
          reserve1: undefined,
        },
      ],
    );
    expect(missing.status).toBe('missing-pair');
    expect(missing.failingHop).toBe(0);
  });

  it('reports the second hop when that pair is empty', () => {
    const check = evaluateRoute(
      [WETH, PARENT, CHILD_A],
      [
        readyHop(),
        {
          pair: PAIR_B,
          token0: CHILD_A,
          token1: PARENT,
          reserve0: 0n,
          reserve1: 5n,
        },
      ],
    );
    expect(check.status).toBe('empty-pool');
    expect(check.failingHop).toBe(1);
    expect(check.allPairs).toHaveLength(2);
  });
});
