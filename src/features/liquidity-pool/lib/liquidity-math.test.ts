import { describe, expect, it } from 'vitest';
import {
  applySlippageDown,
  integerSqrt,
  liquidityMinted,
  lpForPercent,
  MINIMUM_LIQUIDITY,
  optimalAmounts,
  planDualAdd,
  planWithdraw,
  priceRatio,
  sharePercent,
} from '@/features/liquidity-pool/lib/liquidity-math';

/**
 * 理论线（docs/product/three-line/liquidity.md §1.2）的纯函数断言：
 * 这些数值不是从链上或页面读回来的，而是按公式独立算出的期望值。
 */

// §0 首币池初始状态。
const RESERVE_TOKEN = 200_000_000_000_000_000_000_000n; // 2e23 TestLOVE20
const RESERVE_NATIVE = 100_000_000_000_000_000_000n; // 1e20 TestWETH
const TOTAL_SUPPLY = 4_472_135_954_999_579_392_818n;

describe('integerSqrt', () => {
  it('floors like OpenZeppelin Math.sqrt', () => {
    expect(integerSqrt(0n)).toBe(0n);
    expect(integerSqrt(1n)).toBe(1n);
    expect(integerSqrt(15n)).toBe(3n);
    expect(integerSqrt(16n)).toBe(4n);
    expect(integerSqrt(10n ** 36n)).toBe(10n ** 18n);
    // 2e23 · 1e20 = 2e43 的整数平方根与链上 totalSupply 一致。
    expect(integerSqrt(RESERVE_TOKEN * RESERVE_NATIVE)).toBe(TOTAL_SUPPLY);
  });
});

describe('optimalAmounts（按比例截断）', () => {
  it('takes the A side when the desired B is enough', () => {
    // 用例 D：1000 token + 0.5 WETH 正好是储备比 2000:1。
    expect(
      optimalAmounts(
        RESERVE_TOKEN,
        RESERVE_NATIVE,
        1_000_000_000_000_000_000_000n,
        500_000_000_000_000_000n,
      ),
    ).toEqual({
      amountA: 1_000_000_000_000_000_000_000n,
      amountB: 500_000_000_000_000_000n,
    });
  });

  it('clamps to the B side when B is the binding amount', () => {
    // 只填 0.25 WETH：A 侧按比例截到 500 token。
    expect(
      optimalAmounts(
        RESERVE_TOKEN,
        RESERVE_NATIVE,
        1_000_000_000_000_000_000_000n,
        250_000_000_000_000_000n,
      ),
    ).toEqual({
      amountA: 500_000_000_000_000_000_000n,
      amountB: 250_000_000_000_000_000n,
    });
  });

  it('keeps both desired amounts for an empty pool (first mint)', () => {
    expect(optimalAmounts(0n, 0n, 100n * 10n ** 18n, 10n ** 16n)).toEqual({
      amountA: 100n * 10n ** 18n,
      amountB: 10n ** 16n,
    });
  });
});

describe('liquidityMinted', () => {
  it('first mint locks 1000 wei of LP (用例 E)', () => {
    expect(liquidityMinted(0n, 0n, 0n, 100n * 10n ** 18n, 10n ** 16n)).toBe(
      999_999_999_999_999_000n,
    );
    expect(MINIMUM_LIQUIDITY).toBe(1000n);
  });

  it('proportional mint matches min(A·S/R_A, B·S/R_B) (用例 D)', () => {
    expect(
      liquidityMinted(
        RESERVE_TOKEN,
        RESERVE_NATIVE,
        TOTAL_SUPPLY,
        1_000_000_000_000_000_000_000n,
        500_000_000_000_000_000n,
      ),
    ).toBe(22_360_679_774_997_896_964n);
  });
});

describe('撤出与份额（用例 C）', () => {
  const LP = 1_003_579_928_576_458_381_352n;
  const RESERVE_TOKEN_AFTER = 300_000_000_000_000_000_000_000n;
  const RESERVE_NATIVE_AFTER = 100_000_000_000_000_000_000n;
  const TOTAL_SUPPLY_AFTER = 5_475_715_883_576_037_774_170n;

  it('withdraws proportionally at 25/50/75/100%', () => {
    expect(planWithdraw(LP, TOTAL_SUPPLY_AFTER, RESERVE_TOKEN_AFTER, RESERVE_NATIVE_AFTER)).toEqual(
      {
        amountA: 54_983_491_651_928_892_866_980n,
        amountB: 18_327_830_550_642_964_288n,
      },
    );
    expect(
      planWithdraw(
        lpForPercent(LP, 50),
        TOTAL_SUPPLY_AFTER,
        RESERVE_TOKEN_AFTER,
        RESERVE_NATIVE_AFTER,
      ),
    ).toEqual({
      amountA: 27_491_745_825_964_446_433_490n,
      amountB: 9_163_915_275_321_482_144n,
    });
    expect(lpForPercent(LP, 100)).toBe(LP);
    expect(lpForPercent(LP, 25)).toBe(250_894_982_144_114_595_338n);
  });

  it('renders the share as an exact percentage', () => {
    expect(sharePercent(LP, TOTAL_SUPPLY_AFTER)).toBe(18.3278);
    // 100% 撤出后份额为 0。
    expect(sharePercent(0n, TOTAL_SUPPLY_AFTER)).toBe(0);
    expect(sharePercent(1n, 0n)).toBeUndefined();
  });

  it('applies the 0.5% slippage floor', () => {
    expect(applySlippageDown(54_983_491_651_928_892_868_391n, 50)).toBe(
      54_708_574_193_669_248_404_049n,
    );
    expect(applySlippageDown(54_983_491_651_928_892_866_980n, 50)).toBe(
      54_708_574_193_669_248_402_645n,
    );
  });
});

describe('planDualAdd', () => {
  it('reports the first mint when the pool has no reserves', () => {
    const plan = planDualAdd(0n, 0n, 0n, 100n * 10n ** 18n, 10n ** 16n);
    expect(plan.firstMint).toBe(true);
    expect(plan.liquidity).toBe(999_999_999_999_999_000n);
  });

  it('uses the existing reserves for a proportional add', () => {
    const plan = planDualAdd(
      RESERVE_TOKEN,
      RESERVE_NATIVE,
      TOTAL_SUPPLY,
      1_000_000_000_000_000_000_000n,
      500_000_000_000_000_000n,
    );
    expect(plan.firstMint).toBe(false);
    expect(plan.amountA).toBe(1_000_000_000_000_000_000_000n);
    expect(plan.amountB).toBe(500_000_000_000_000_000n);
    expect(plan.liquidity).toBe(22_360_679_774_997_896_964n);
  });
});

describe('priceRatio', () => {
  it('returns the reserve ratio and refuses empty reserves', () => {
    expect(priceRatio(RESERVE_NATIVE, RESERVE_TOKEN)).toEqual({
      quote: RESERVE_TOKEN,
      base: RESERVE_NATIVE,
    });
    expect(priceRatio(0n, RESERVE_TOKEN)).toBeUndefined();
  });
});
