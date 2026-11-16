import { describe, expect, it } from 'vitest';
import {
  addressLpPosition,
  applySlippageDown,
  integerSqrt,
  liquidityMinted,
  lpForPercent,
  MINIMUM_LIQUIDITY,
  mirrorAmount,
  optimalAmounts,
  planDualAdd,
  planWithdraw,
  priceChangePercent,
  priceRatio,
  sharePercent,
  hubReservesAfterAdd,
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

describe('mirrorAmount（智能模式关闭时的一侧联动）', () => {
  it('mirrors the other side at the pool ratio, flooring like Uniswap quote', () => {
    // 池子 200,000 TestLOVE20 / 100 WETH：1000 TestLOVE20 → 0.5 WETH（用例 D 的两侧）。
    expect(mirrorAmount(1000n * 10n ** 18n, RESERVE_TOKEN, RESERVE_NATIVE)).toBe(5n * 10n ** 17n);
    // 反向：0.5 WETH → 1000 TestLOVE20。
    expect(mirrorAmount(5n * 10n ** 17n, RESERVE_NATIVE, RESERVE_TOKEN)).toBe(1000n * 10n ** 18n);
    // 除不尽时向下取整，不多扣用户。
    expect(mirrorAmount(3n, 7n, 10n)).toBe(4n);
  });

  it('returns 0 when there is no ratio to follow', () => {
    expect(mirrorAmount(0n, RESERVE_TOKEN, RESERVE_NATIVE)).toBe(0n);
    expect(mirrorAmount(10n ** 18n, 0n, RESERVE_NATIVE)).toBe(0n);
    expect(mirrorAmount(10n ** 18n, RESERVE_TOKEN, 0n)).toBe(0n);
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

describe('hubReservesAfterAdd（旧库「添加后价格」）', () => {
  it('用例 A：单边社区代币 swap + 进池后 = 300,000 / 100', () => {
    const after = hubReservesAfterAdd({
      reserveToken: RESERVE_TOKEN,
      reserveNative: RESERVE_NATIVE,
      swapTokenInIsToken: true,
      amountToSwap: 45_016_508_348_071_107_131_609n,
      amountOutFromSwap: 18_327_830_550_642_964_289n,
      usableToken: 54_983_491_651_928_892_868_391n,
      usableNative: 18_327_830_550_642_964_289n,
    });
    expect(after).toEqual({
      reserveToken: 300_000_000_000_000_000_000_000n,
      reserveNative: RESERVE_NATIVE,
    });
  });

  it('用例 B：单边原生币 swap + 进池后 = 200,000 / 109999999999999999999', () => {
    const after = hubReservesAfterAdd({
      reserveToken: RESERVE_TOKEN,
      reserveNative: RESERVE_NATIVE,
      swapTokenInIsToken: false,
      amountToSwap: 4_888_217_399_419_358_069n,
      amountOutFromSwap: 9_294_150_182_873_894_419_011n,
      usableToken: 9_294_150_182_873_894_419_011n,
      // 理论线：usableAmountB 比 preparedAmountB 少 1 wei（Hub 按比例截断后退回用户）。
      usableNative: 5_111_782_600_580_641_930n,
    });
    expect(after).toEqual({
      reserveToken: RESERVE_TOKEN,
      reserveNative: 109_999_999_999_999_999_999n,
    });
  });

  it('储备不够扣 swap 输出时返回 undefined（不显示错误价格）', () => {
    expect(
      hubReservesAfterAdd({
        reserveToken: 10n,
        reserveNative: 10n,
        swapTokenInIsToken: true,
        amountToSwap: 1n,
        amountOutFromSwap: 11n,
        usableToken: 0n,
        usableNative: 0n,
      }),
    ).toBeUndefined();
  });
});

describe('priceChangePercent（旧库「添加后价格」的涨跌幅）', () => {
  it('用例 A：1 ETH 从 2,000 涨到 3,000 TestLOVE20 → +50.00%', () => {
    expect(
      priceChangePercent(
        { quote: RESERVE_TOKEN, base: RESERVE_NATIVE },
        { quote: 3n * 10n ** 23n, base: RESERVE_NATIVE },
      ),
    ).toBe('+50.00%');
  });

  it('下跌与不变都带正确的符号', () => {
    expect(
      priceChangePercent(
        { quote: RESERVE_TOKEN, base: RESERVE_NATIVE },
        { quote: RESERVE_TOKEN, base: 2n * 10n ** 20n },
      ),
    ).toBe('-50.00%');
    expect(
      priceChangePercent(
        { quote: RESERVE_TOKEN, base: RESERVE_NATIVE },
        { quote: RESERVE_TOKEN, base: RESERVE_NATIVE },
      ),
    ).toBe('0.00%');
  });

  it('任一比率为 0 时不显示涨跌', () => {
    expect(
      priceChangePercent({ quote: 0n, base: RESERVE_NATIVE }, { quote: 1n, base: 1n }),
    ).toBeUndefined();
  });
});

describe('addressLpPosition（任意地址查询的 LP 折算）', () => {
  it('初始池 · 质押合约的 LP：份额 99.99%，可兑换 199,999.999999 + 99.999999', () => {
    // 三线 §3 用例 Q：初始状态质押合约持有 totalSupply − 1000（永久锁定）。
    const position = addressLpPosition(
      4_472_135_954_999_579_391_818n,
      TOTAL_SUPPLY,
      RESERVE_TOKEN,
      RESERVE_NATIVE,
    );
    expect(position).toBeDefined();
    expect(position?.lpAmount).toBe(4_472_135_954_999_579_391_818n);
    expect(position?.sharePercent).toBe(99.9999);
    // LP × reserve / totalSupply，整数除法向下取整（与撤出报价同一个 planWithdraw）。
    expect(position?.amountToken).toBe(199_999_999_999_999_999_955_278n);
    expect(position?.amountNative).toBe(99_999_999_999_999_999_977n);
  });

  it('用例 A 建仓后：1003.579928 LP → 18.3278% 份额与两侧折算', () => {
    const position = addressLpPosition(
      1_003_579_928_576_458_381_352n,
      5_475_715_883_576_037_774_170n,
      300_000_000_000_000_000_000_000n,
      RESERVE_NATIVE,
    );
    expect(position?.sharePercent).toBe(18.3278);
    expect(position?.amountToken).toBe(54_983_491_651_928_892_866_980n);
    expect(position?.amountNative).toBe(18_327_830_550_642_964_288n);
  });

  it('没有持仓：0 LP → 0 份额与 0 两侧折算（页面渲染「没有 LP 代币」）', () => {
    const position = addressLpPosition(0n, TOTAL_SUPPLY, RESERVE_TOKEN, RESERVE_NATIVE);
    expect(position?.sharePercent).toBe(0);
    expect(position?.amountToken).toBe(0n);
    expect(position?.amountNative).toBe(0n);
  });

  it('totalSupply 为 0（空池）没有可折算的分母', () => {
    expect(addressLpPosition(1n, 0n, RESERVE_TOKEN, RESERVE_NATIVE)).toBeUndefined();
  });
});
