import { describe, expect, it } from 'vitest';
import {
  integerSqrt,
  liquidityMinted,
  lpForPercent,
  MINIMUM_LIQUIDITY,
  mirrorAmount,
  optimalAmounts,
  planDualAdd,
  planWithdraw,
  sharePercent,
} from './liquidity-math';

/**
 * 属性/边界测试：流动性池纯算术（`features/liquidity-pool/lib/liquidity-math`）。
 *
 * 测什么不变量：
 * - `integerSqrt` 是整数向下平方根：`s² ≤ n < (s+1)²`，完全平方数精确还原；
 * - `optimalAmounts` 两侧实际用量都不超过用户填写值，且严格贴合池子比例（误差 < 1 wei 量级的
 *   `max(reserveA, reserveB)`）；
 * - `liquidityMinted` 不超过任何一侧的份额，金额增加不会减少 LP；首次注资按
 *   `sqrt(a·b) − 1000` 向下取整，不足 1000 时为 0；
 * - `planDualAdd` 的实际用量 ≤ 用户填写值，铸出的 LP ≤ 用完整填写值能铸出的 LP；
 * - `lpForPercent` 对整数百分比精确等于 `floor(lp × p / 100)`，100% 撤干净、越界 clamp；
 * - `planWithdraw` 是向下取整的比例撤出（`amount·S ≤ lp·R < (amount+1)·S`），全撤拿回全部储备；
 * - `mirrorAmount` 的「按比例自动填充」往返不会向用户多要钱（反算回来 ≤ 原输入）；
 * - `sharePercent` 在 `lp ≤ totalSupply` 时落在 [0, 100]，0 份额为 0、满份额为 100，且单调。
 *
 * 为什么重要：这些公式对应合约的 Router / pair 口径；向上取整或方向错误会让用户多扣钱、
 * 少拿 LP，或者撤出数量超过池子。
 *
 * 确定性：固定种子 32 位 LCG，每个属性 100–200 次迭代。
 */

const SEED = 0x11a9_1127;

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function randomDigits(rng: () => number, count: number): string {
  let text = '';
  for (let index = 0; index < count; index += 1) text += String(randomInt(rng, 0, 9));
  return text;
}

function randomValue(rng: () => number, maxDigits: number): bigint {
  const digits = randomInt(rng, 1, maxDigits);
  return BigInt(String(randomInt(rng, 1, 9)) + randomDigits(rng, digits - 1));
}

function randomBelow(rng: () => number, upper: bigint): bigint {
  if (upper <= 0n) return 0n;
  return randomValue(rng, 30) % (upper + 1n);
}

function minBigInt(first: bigint, second: bigint): bigint {
  return first < second ? first : second;
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

describe('integerSqrt 属性', () => {
  it('整数向下平方根：s² ≤ n < (s+1)²，完全平方数精确还原', () => {
    const rng = makeRng(SEED);
    for (const value of [0n, 1n, 2n, 3n, 4n, 15n, 16n, 17n, 10n ** 20n, 10n ** 40n]) {
      const root = integerSqrt(value);
      expect(root * root).toBeLessThanOrEqual(value);
      expect((root + 1n) * (root + 1n)).toBeGreaterThan(value);
    }
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const value = randomValue(rng, 40);
      const root = integerSqrt(value);
      expect(root * root).toBeLessThanOrEqual(value);
      expect((root + 1n) * (root + 1n)).toBeGreaterThan(value);
    }
    for (let iteration = 0; iteration < 50; iteration += 1) {
      const square = randomValue(rng, 20);
      const value = square * square;
      expect(integerSqrt(value)).toBe(square);
      expect(integerSqrt(value + 1n)).toBe(square);
    }
  });
});

describe('optimalAmounts 属性：双侧配比', () => {
  it('两侧用量都不超过用户填写值，且贴合储备比例', () => {
    const rng = makeRng(SEED + 1);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const reserveA = randomValue(rng, 24);
      const reserveB = randomValue(rng, 24);
      const desiredA = randomValue(rng, 24);
      const desiredB = randomValue(rng, 24);
      const { amountA, amountB } = optimalAmounts(reserveA, reserveB, desiredA, desiredB);

      expect(amountA).toBeGreaterThanOrEqual(0n);
      expect(amountB).toBeGreaterThanOrEqual(0n);
      expect(amountA).toBeLessThanOrEqual(desiredA);
      expect(amountB).toBeLessThanOrEqual(desiredB);
      // 比例误差被限制在 1 wei 的「储备单位」内：不会拿明显更多的另一侧。
      expect(absBigInt(amountA * reserveB - amountB * reserveA)).toBeLessThanOrEqual(
        reserveA > reserveB ? reserveA : reserveB,
      );
    }
  });

  it('空储备（首次建池）原样返回两侧填写值', () => {
    const rng = makeRng(SEED + 2);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const desiredA = randomValue(rng, 20);
      const desiredB = randomValue(rng, 20);
      expect(optimalAmounts(0n, randomValue(rng, 20), desiredA, desiredB)).toEqual({
        amountA: desiredA,
        amountB: desiredB,
      });
      expect(optimalAmounts(randomValue(rng, 20), 0n, desiredA, desiredB)).toEqual({
        amountA: desiredA,
        amountB: desiredB,
      });
    }
  });
});

describe('liquidityMinted 属性：LP 份额', () => {
  it('结果等于两侧比例份额的较小者，不超过任何一侧的份额，金额增加不减少 LP', () => {
    const rng = makeRng(SEED + 3);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const reserveA = randomValue(rng, 24);
      const reserveB = randomValue(rng, 24);
      const totalSupply = randomValue(rng, 28);
      const amountA = randomValue(rng, 24);
      const amountB = randomValue(rng, 24);
      const minted = liquidityMinted(reserveA, reserveB, totalSupply, amountA, amountB);
      const fromA = (amountA * totalSupply) / reserveA;
      const fromB = (amountB * totalSupply) / reserveB;

      expect(minted).toBe(minBigInt(fromA, fromB));
      expect(minted * reserveA).toBeLessThanOrEqual(amountA * totalSupply);
      expect(minted * reserveB).toBeLessThanOrEqual(amountB * totalSupply);

      const moreA = liquidityMinted(reserveA, reserveB, totalSupply, amountA + 1n, amountB);
      expect(moreA).toBeGreaterThanOrEqual(minted);
    }
  });

  it('任一侧金额为 0 时铸出 0；首次注资 = sqrt(a·b) − 1000，不足 1000 为 0', () => {
    expect(liquidityMinted(1_000n, 1_000n, 10n, 0n, 100n)).toBe(0n);
    expect(liquidityMinted(1_000n, 1_000n, 10n, 100n, 0n)).toBe(0n);

    const rng = makeRng(SEED + 4);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const amountA = BigInt(randomInt(rng, 1, 1_000_000));
      const amountB = BigInt(randomInt(rng, 1, 1_000_000));
      const root = integerSqrt(amountA * amountB);
      const expected = root > MINIMUM_LIQUIDITY ? root - MINIMUM_LIQUIDITY : 0n;
      expect(liquidityMinted(0n, 0n, 0n, amountA, amountB)).toBe(expected);
      expect(liquidityMinted(1_000n, 2_000n, 0n, amountA, amountB)).toBe(expected);
    }
  });
});

describe('planDualAdd 属性：本地计划', () => {
  it('用量不超过填写值，铸出的 LP 不超过用完整填写值能铸出的 LP，firstMint 标记正确', () => {
    const rng = makeRng(SEED + 5);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const totalSupply = iteration % 10 === 0 ? 0n : randomValue(rng, 28);
      const reserveA = iteration % 10 === 1 ? 0n : randomValue(rng, 24);
      const reserveB = randomValue(rng, 24);
      const desiredA = randomValue(rng, 22);
      const desiredB = randomValue(rng, 22);
      const plan = planDualAdd(reserveA, reserveB, totalSupply, desiredA, desiredB);

      expect(plan.firstMint).toBe(totalSupply === 0n || reserveA <= 0n || reserveB <= 0n);
      expect(plan.amountA).toBeLessThanOrEqual(desiredA);
      expect(plan.amountB).toBeLessThanOrEqual(desiredB);
      expect(plan.liquidity).toBeLessThanOrEqual(
        liquidityMinted(reserveA, reserveB, totalSupply, desiredA, desiredB),
      );
    }
  });
});

describe('lpForPercent 属性：快捷比例', () => {
  it('整数百分比精确等于 floor(lp × p / 100)，100% 撤干净，越界 clamp', () => {
    const rng = makeRng(SEED + 6);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const lpBalance = randomValue(rng, 28);
      const percent = randomInt(rng, 0, 100);
      expect(lpForPercent(lpBalance, percent)).toBe((lpBalance * BigInt(percent)) / 100n);
    }
    expect(lpForPercent(10n ** 18n, 100)).toBe(10n ** 18n);
    expect(lpForPercent(10n ** 18n, 0)).toBe(0n);
    expect(lpForPercent(10n ** 18n, -5)).toBe(0n);
    expect(lpForPercent(10n ** 18n, 150)).toBe(10n ** 18n);
    expect(lpForPercent(0n, 50)).toBe(0n);
    expect(lpForPercent(10n ** 18n + 3n, 25)).toBe((10n ** 18n + 3n) / 4n);
  });

  it('百分比越大结果不减，且永不超过 LP 余额', () => {
    const rng = makeRng(SEED + 7);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const lpBalance = randomValue(rng, 26);
      const lower = randomInt(rng, 0, 100);
      const higher = randomInt(rng, lower, 100);
      expect(lpForPercent(lpBalance, lower)).toBeLessThanOrEqual(lpForPercent(lpBalance, higher));
      expect(lpForPercent(lpBalance, higher)).toBeLessThanOrEqual(lpBalance);
    }
  });
});

describe('planWithdraw 属性：按比例撤出', () => {
  it('两侧都是向下取整的比例份额，全撤拿回全部储备', () => {
    const rng = makeRng(SEED + 8);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const totalSupply = randomValue(rng, 28);
      const reserveA = randomValue(rng, 26);
      const reserveB = randomValue(rng, 26);
      const lpAmount = randomBelow(rng, totalSupply);
      const plan = planWithdraw(lpAmount, totalSupply, reserveA, reserveB);

      expect(plan.amountA).toBe((lpAmount * reserveA) / totalSupply);
      expect(plan.amountB).toBe((lpAmount * reserveB) / totalSupply);
      expect(plan.amountA * totalSupply).toBeLessThanOrEqual(lpAmount * reserveA);
      expect(lpAmount * reserveA).toBeLessThan((plan.amountA + 1n) * totalSupply);
      expect(plan.amountB * totalSupply).toBeLessThanOrEqual(lpAmount * reserveB);
      expect(lpAmount * reserveB).toBeLessThan((plan.amountB + 1n) * totalSupply);
      expect(plan.amountA).toBeLessThanOrEqual(reserveA);
      expect(plan.amountB).toBeLessThanOrEqual(reserveB);
    }
    expect(planWithdraw(10n ** 18n, 10n ** 18n, 5_000n, 7_000n)).toEqual({
      amountA: 5_000n,
      amountB: 7_000n,
    });
    expect(planWithdraw(0n, 10n ** 18n, 5_000n, 7_000n)).toEqual({ amountA: 0n, amountB: 0n });
    expect(planWithdraw(10n ** 18n, 0n, 5_000n, 7_000n)).toEqual({ amountA: 0n, amountB: 0n });
  });
});

describe('mirrorAmount 属性：自动填充', () => {
  it('反向换算回来不超过用户原输入（不会向用户多要钱）', () => {
    const rng = makeRng(SEED + 9);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const amount = randomValue(rng, 26);
      const reserveIn = randomValue(rng, 26);
      const reserveOut = randomValue(rng, 26);
      const mirrored = mirrorAmount(amount, reserveIn, reserveOut);
      const back = mirrorAmount(mirrored, reserveOut, reserveIn);

      expect(mirrored).toBeGreaterThanOrEqual(0n);
      expect(back).toBeLessThanOrEqual(amount);
      // 向下取整的精确界：mirrored × reserveIn ≤ amount × reserveOut。
      expect(mirrored * reserveIn).toBeLessThanOrEqual(amount * reserveOut);
    }
    expect(mirrorAmount(0n, 1_000n, 2_000n)).toBe(0n);
    expect(mirrorAmount(100n, 0n, 2_000n)).toBe(0n);
    expect(mirrorAmount(100n, 1_000n, 0n)).toBe(0n);
  });
});

describe('sharePercent 属性：我的占比', () => {
  it('lp ≤ totalSupply 时落在 [0, 100]，0 份额为 0、满份额为 100、单调不减', () => {
    const rng = makeRng(SEED + 10);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const totalSupply = randomValue(rng, 30);
      const lpBalance = randomBelow(rng, totalSupply);
      const share = sharePercent(lpBalance, totalSupply);
      expect(share).toBeDefined();
      expect(share ?? -1).toBeGreaterThanOrEqual(0);
      expect(share ?? 101).toBeLessThanOrEqual(100);

      const more = sharePercent(lpBalance + randomBelow(rng, totalSupply - lpBalance), totalSupply);
      expect(more ?? -1).toBeGreaterThanOrEqual(share ?? -1);
    }
    expect(sharePercent(0n, 10n ** 18n)).toBe(0);
    expect(sharePercent(10n ** 18n, 10n ** 18n)).toBe(100);
    expect(sharePercent(0n, 0n)).toBeUndefined();
    expect(sharePercent(-1n, 10n ** 18n)).toBeUndefined();
  });
});
