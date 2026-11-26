import { describe, expect, it } from 'vitest';
import { applySlippageDown, percentToBps } from './percent';

/**
 * 属性/边界测试：百分比换算与滑点取整（`shared/lib/percent`）。
 *
 * 测什么不变量：
 * - `percentToBps` 在 0–10,000 个整基点上可无损往返（bp/100 → bp）；
 * - `applySlippageDown` 精确等于 `floor(amount × (10,000 − bps) / 10,000)`，
 *   结果永不超过原值、永不为负（默认 clamp）；
 * - bps 为 0（含 -0.4 这类舍入到 0 的输入）时恒等；bps 越大最少获得越小（单调）；
 * - 少给的数量精确等于 `ceil(amount × bps / 10,000)`（不是模糊地「少一点」）；
 * - 越界口径明确：默认 clamp 到 [0, 9999]，负数 → 0（恒等）、超 100% → 9999；
 *   `clamp: false` 保留质押页历史语义（>100% 可得负值）；
 * - 百分数与基点两层舍入不混用（50.6% → 5060 bps，而不是 51）。
 *
 * 为什么重要：这是「最少获得」的唯一实现，向上取整或漏 clamp 会让用户签下比预期更差的单。
 *
 * 确定性：固定种子 32 位 LCG，每个属性 200–300 次迭代；0–10,000 基点用例是穷举。
 */

const SEED = 0x9e37_1127;

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

function randomAmount(rng: () => number, maxDigits = 30): bigint {
  const digits = randomInt(rng, 1, maxDigits);
  let text = String(randomInt(rng, 1, 9));
  for (let index = 1; index < digits; index += 1) text += String(randomInt(rng, 0, 9));
  return BigInt(text);
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

describe('percentToBps 属性', () => {
  it('0–10,000 每个整基点都能往返（bp / 100 → bp）', () => {
    for (let bps = 0; bps <= 10_000; bps += 1) {
      expect(percentToBps(bps / 100)).toBe(bps);
    }
  });

  it('区间外行为确定：100% / 200% / -10% 都按 Math.round 明确换算', () => {
    expect(percentToBps(0)).toBe(0);
    expect(percentToBps(100)).toBe(10_000);
    expect(percentToBps(200)).toBe(20_000);
    expect(percentToBps(-10)).toBe(-1_000);
    expect(percentToBps(50.6)).toBe(5_060);
    expect(percentToBps(0.506)).toBe(51);
  });

  it('对 [0.01, 50] 的任意百分比单调不减（百分比越大 bps 越大）', () => {
    const rng = makeRng(SEED);
    for (let iteration = 0; iteration < 300; iteration += 1) {
      const first = 0.01 + rng() * 49.98;
      const second = first + rng() * (50 - first);
      expect(percentToBps(first)).toBeLessThanOrEqual(percentToBps(second));
    }
  });
});

describe('applySlippageDown 属性', () => {
  it('等于精确的向下取整公式，且永不超过原值、永不为负（默认 clamp）', () => {
    const rng = makeRng(SEED + 1);
    for (let iteration = 0; iteration < 300; iteration += 1) {
      const amount = randomAmount(rng);
      const bps = randomInt(rng, 0, 9_999);
      const result = applySlippageDown(amount, bps);
      expect(result).toBe((amount * BigInt(10_000 - bps)) / 10_000n);
      expect(result).toBeLessThanOrEqual(amount);
      expect(result).toBeGreaterThanOrEqual(0n);
    }
  });

  it('少给的数量精确等于 ceil(amount × bps / 10,000)', () => {
    const rng = makeRng(SEED + 2);
    for (let iteration = 0; iteration < 300; iteration += 1) {
      const amount = randomAmount(rng, 34);
      const bps = randomInt(rng, 0, 9_999);
      const result = applySlippageDown(amount, bps);
      expect(amount - result).toBe(ceilDiv(amount * BigInt(bps), 10_000n));
    }
  });

  it('bps 越大最少获得越小（单调），0 与舍入到 0 的输入恒等', () => {
    const rng = makeRng(SEED + 3);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const amount = randomAmount(rng, 28);
      const lower = randomInt(rng, 0, 9_999);
      const higher = randomInt(rng, lower, 9_999);
      expect(applySlippageDown(amount, lower)).toBeGreaterThanOrEqual(
        applySlippageDown(amount, higher),
      );
    }
    expect(applySlippageDown(10_000n, 0)).toBe(10_000n);
    // -0.4 舍入成 -0，bounded === 0 成立 → 原样返回。
    expect(applySlippageDown(10_000n, -0.4)).toBe(10_000n);
    expect(applySlippageDown(10_000n, 0.4)).toBe(10_000n);
  });

  it('小数 bps 先舍入再应用：50.4 与 50 相同，50.6 与 51 相同', () => {
    const rng = makeRng(SEED + 4);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const amount = randomAmount(rng, 26);
      const bps = randomInt(rng, 0, 9_998);
      expect(applySlippageDown(amount, bps + 0.4)).toBe(applySlippageDown(amount, bps));
      expect(applySlippageDown(amount, bps + 0.6)).toBe(applySlippageDown(amount, bps + 1));
    }
    expect(applySlippageDown(10_000n, 50.6)).toBe(9_949n);
  });

  it('默认 clamp 把越界 bps 收进 [0, 9999]：负数恒等、超 100% 收敛到 99.99%', () => {
    const rng = makeRng(SEED + 5);
    for (let iteration = 0; iteration < 300; iteration += 1) {
      const amount = randomAmount(rng, 24);
      const bps = randomInt(rng, -50_000, 50_000);
      const result = applySlippageDown(amount, bps);
      expect(result).toBeGreaterThanOrEqual(0n);
      expect(result).toBeLessThanOrEqual(amount);
      if (bps <= 0) expect(result).toBe(amount);
      if (bps >= 10_000) expect(result).toBe(applySlippageDown(amount, 9_999));
    }
    // 200% → 20,000 bps → clamp 9,999：100 万的 0.01% = 100。
    expect(applySlippageDown(1_000_000n, percentToBps(200))).toBe(100n);
    // -10% → -1,000 bps → clamp 0：滑点无效，原样返回（不是变多）。
    expect(applySlippageDown(1_000_000n, percentToBps(-10))).toBe(1_000_000n);
  });

  it('clamp:false 保留质押页历史语义：>100% 会得到负值，但仍 ≤ 原值', () => {
    expect(applySlippageDown(1_000n, 20_000, { clamp: false })).toBe(-1_000n);
    const rng = makeRng(SEED + 6);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const amount = randomAmount(rng, 24);
      const bps = randomInt(rng, 10_001, 50_000);
      const result = applySlippageDown(amount, bps, { clamp: false });
      expect(result).toBe((amount * BigInt(10_000 - bps)) / 10_000n);
      expect(result).toBeLessThanOrEqual(amount);
      // 小额除以 10,000 会截成 0，大额才会变负；两者都不得高于原值。
      expect(result).toBeLessThanOrEqual(0n);
    }
  });
});
