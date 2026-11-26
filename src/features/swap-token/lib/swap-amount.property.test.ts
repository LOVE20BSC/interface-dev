import { describe, expect, it } from 'vitest';
import type { HexAddress } from '@/config/networks';
import { parseAmountInput } from '@/shared/lib/amount-input';
import { formatUnits } from '@/shared/lib/format';
import {
  applySlippage,
  isSlippagePercentValid,
  parseSwapAmount,
  percentToBps,
  priceImpactBps,
} from './swap-amount';
import type { SwapPairInfo } from './swap-types';

/**
 * 属性/边界测试：兑换金额与报价换算（`features/swap-token/lib/swap-amount`）。
 *
 * 测什么不变量：
 * - `parseSwapAmount` 与共享 `parseAmountInput(reject-precision)` 的投影严格一致：
 *   精度内原值往返（含 0），超精度只报 `too-precise` 且位数 = token decimals；
 * - `applySlippage` = 共享 `applySlippageDown`：结果 ≤ 报价、bps 0 恒等、越大越小；
 * - 滑点校验范围 [0.01%, 50%] 的成员判定与闭区间公式一致，NaN/∞/越界都拒绝；
 * - `priceImpactBps`：0/负报价、路径与 pair 数不匹配、储备为 0、理想输出为 0 时返回
 *   `undefined`；否则落在 [0, 10,000]（极差报价按最近整数四舍五入可能到 100%）；贴价报价为 0，
 *   报价低于边际价约 1% 时约 100 bps；
 * - 正向/反向路径（token0/token1 对调）对同一笔报价给出相同 impact（reserveFor 方向正确）。
 *
 * 为什么重要：报价和最少获得直接进入签名参数；方向反了或向上取整会让用户被夹。
 *
 * 确定性：固定种子 32 位 LCG，每个属性 100–300 次迭代。
 */

const SEED = 0x5a9e_1127;

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

const WETH = '0x0000000000000000000000000000000000000001' as HexAddress;
const TOKEN = '0x0000000000000000000000000000000000000002' as HexAddress;
const PAIR_ADDRESS = '0x0000000000000000000000000000000000000010' as HexAddress;
const PATH = [TOKEN, WETH] as const;
const REVERSED_PATH = [WETH, TOKEN] as const;

function makePair(reserve0: bigint, reserve1: bigint): SwapPairInfo {
  return { address: PAIR_ADDRESS, token0: TOKEN, token1: WETH, reserve0, reserve1 };
}

function makeReversedPair(reserve0: bigint, reserve1: bigint): SwapPairInfo {
  return { address: PAIR_ADDRESS, token0: WETH, token1: TOKEN, reserve0, reserve1 };
}

describe('parseSwapAmount 属性：与共享解析器一致', () => {
  it('精度内原值往返（含 0；页面另外用 > 0 做按钮门禁）', () => {
    const rng = makeRng(SEED);
    for (let iteration = 0; iteration <= 200; iteration += 1) {
      const decimals = randomInt(rng, 0, 18);
      const value = iteration === 0 ? 0n : randomValue(rng, 24);
      const raw = formatUnits(value, decimals);
      expect(parseSwapAmount(raw, decimals)).toEqual({ kind: 'ok', value });
    }
  });

  it('任意输入都只是共享 reject-precision 结果的投影，超精度报 decimals 位数', () => {
    const rng = makeRng(SEED + 1);
    const pool = '0123456789.,-+eE \t';
    for (let iteration = 0; iteration < 300; iteration += 1) {
      const decimals = randomInt(rng, 0, 18);
      const length = randomInt(rng, 0, 10);
      let raw = '';
      for (let index = 0; index < length; index += 1) {
        raw += pool[randomInt(rng, 0, pool.length - 1)];
      }
      const shared = parseAmountInput(raw, { decimals, strategy: 'reject-precision' });
      switch (shared.kind) {
        case 'empty':
          expect(parseSwapAmount(raw, decimals)).toEqual({ kind: 'empty' });
          break;
        case 'too-precise':
          expect(parseSwapAmount(raw, decimals)).toEqual({
            kind: 'too-precise',
            digits: shared.digits,
          });
          break;
        case 'ok':
          expect(parseSwapAmount(raw, decimals)).toEqual({ kind: 'ok', value: shared.value });
          break;
        case 'invalid':
        case 'zero':
          expect(parseSwapAmount(raw, decimals)).toEqual({ kind: 'invalid' });
          break;
      }
    }
  });

  it('19 位小数在 18 位代币上必须拒绝，18 位则原值通过', () => {
    for (let decimals = 0; decimals <= 18; decimals += 1) {
      const excess = `1.${'0'.repeat(decimals)}1`;
      expect(parseSwapAmount(excess, decimals)).toEqual({ kind: 'too-precise', digits: decimals });
      if (decimals > 0) {
        const exact = `1.${'0'.repeat(decimals - 1)}1`;
        expect(parseSwapAmount(exact, decimals)).toEqual({
          kind: 'ok',
          value: 10n ** BigInt(decimals) + 1n,
        });
      }
    }
  });
});

describe('applySlippage 属性：最少获得', () => {
  it('等于向下取整公式，结果不高于报价、不为负；bps 0 恒等', () => {
    const rng = makeRng(SEED + 2);
    for (let iteration = 0; iteration < 300; iteration += 1) {
      const quote = iteration === 0 ? 0n : randomValue(rng, 30);
      const bps = randomInt(rng, 0, 9_999);
      const result = applySlippage(quote, bps);
      expect(result).toBe((quote * BigInt(10_000 - bps)) / 10_000n);
      expect(result).toBeLessThanOrEqual(quote);
      expect(result).toBeGreaterThanOrEqual(0n);
    }
    expect(applySlippage(0n, 500)).toBe(0n);
    expect(applySlippage(10_000n, 0)).toBe(10_000n);
  });

  it('滑点百分比越大，最少获得越小（[0.01, 50] 内单调）', () => {
    const rng = makeRng(SEED + 3);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const quote = randomValue(rng, 28);
      const first = 0.01 + rng() * 49.98;
      const second = first + rng() * (50 - first);
      const firstBps = percentToBps(first);
      const secondBps = percentToBps(second);
      expect(firstBps).toBeLessThanOrEqual(secondBps);
      expect(applySlippage(quote, firstBps)).toBeGreaterThanOrEqual(
        applySlippage(quote, secondBps),
      );
    }
  });
});

describe('isSlippagePercentValid 属性：范围判定', () => {
  it('闭区间 [0.01, 50] 内的有限数都合法，边界外与非有限数都拒绝', () => {
    expect(isSlippagePercentValid(0.01)).toBe(true);
    expect(isSlippagePercentValid(50)).toBe(true);
    expect(isSlippagePercentValid(0.009_999)).toBe(false);
    expect(isSlippagePercentValid(50.000_1)).toBe(false);
    expect(isSlippagePercentValid(0)).toBe(false);
    expect(isSlippagePercentValid(-1)).toBe(false);
    expect(isSlippagePercentValid(Number.NaN)).toBe(false);
    expect(isSlippagePercentValid(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isSlippagePercentValid(Number.NEGATIVE_INFINITY)).toBe(false);

    const rng = makeRng(SEED + 4);
    for (let iteration = 0; iteration < 300; iteration += 1) {
      const percent = rng() * 100 - 25;
      expect(isSlippagePercentValid(percent)).toBe(
        Number.isFinite(percent) && percent >= 0.01 && percent <= 50,
      );
    }
  });
});

describe('priceImpactBps 属性：价格冲击', () => {
  it('缺数/方向不匹配/储备为 0/理想输出为 0 时返回 undefined', () => {
    const pair = makePair(1_000n, 2_000n);
    expect(priceImpactBps(0n, 1n, PATH, [pair])).toBeUndefined();
    expect(priceImpactBps(-1n, 1n, PATH, [pair])).toBeUndefined();
    expect(priceImpactBps(1n, 0n, PATH, [pair])).toBeUndefined();
    expect(priceImpactBps(1n, -1n, PATH, [pair])).toBeUndefined();
    expect(priceImpactBps(1n, 1n, PATH, [])).toBeUndefined();
    expect(priceImpactBps(1n, 1n, PATH, [pair, pair])).toBeUndefined();
    expect(priceImpactBps(1n, 1n, PATH, [makePair(0n, 2_000n)])).toBeUndefined();
    expect(priceImpactBps(1n, 1n, PATH, [makePair(1_000n, 0n)])).toBeUndefined();
    // 1 wei 进 10^18 储备，理想输出向下取整为 0 → 没有可比较的价格。
    expect(priceImpactBps(1n, 1n, PATH, [makePair(10n ** 18n, 1n)])).toBeUndefined();
  });

  it('贴边际价的报价 impact 为 0，低于边际价 1% 约 100 bps，任意报价都 ≤ 10,000', () => {
    const rng = makeRng(SEED + 5);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const reserve0 = randomValue(rng, 24);
      const reserve1 = randomValue(rng, 24);
      const pair = makePair(reserve0, reserve1);
      const amountIn = randomValue(rng, 20);
      const ideal = (amountIn * reserve1) / reserve0;
      if (ideal <= 0n) continue;

      expect(priceImpactBps(amountIn, ideal, PATH, [pair])).toBe(0);
      expect(priceImpactBps(amountIn, ideal + 1n, PATH, [pair])).toBe(0);

      if (ideal >= 1_000n) {
        const quote = ideal - ideal / 100n;
        const impact = priceImpactBps(amountIn, quote, PATH, [pair]);
        expect(impact).toBeDefined();
        expect(impact ?? -1).toBeGreaterThanOrEqual(90);
        expect(impact ?? -1).toBeLessThanOrEqual(110);
      }

      // 从 1 wei 到理想输出：impact 单调非增、落在 [0, 10000)。
      const quote = BigInt(randomInt(rng, 1, 1_000_000)) % (ideal + 1n);
      if (quote > 0n) {
        const impact = priceImpactBps(amountIn, quote, PATH, [pair]);
        expect(impact).toBeDefined();
        expect(impact ?? -1).toBeGreaterThanOrEqual(0);
        expect(impact ?? -1).toBeLessThanOrEqual(10_000);
        const almostIdeal = ideal - ideal / 1000n;
        if (almostIdeal > 0n) {
          const smallImpact = priceImpactBps(amountIn, almostIdeal, PATH, [pair]);
          expect(impact ?? 0).toBeGreaterThanOrEqual(smallImpact ?? 0);
        }
      }
    }
  });

  it('token0/token1 两种排列都按正确一侧的储备计算边际价', () => {
    // TOKEN/T0=100、WETH/T1=200：10 TOKEN 的边际输出是 20 WETH。
    const tokenFirst = makePair(100n, 200n);
    expect(priceImpactBps(10n, 20n, PATH, [tokenFirst])).toBe(0);
    expect(priceImpactBps(10n, 19n, PATH, [tokenFirst])).toBeGreaterThan(0);
    // WETH/T0=200、TOKEN/T1=100：20 WETH 的边际输出是 10 TOKEN。
    const wethFirst = makeReversedPair(200n, 100n);
    expect(priceImpactBps(20n, 10n, REVERSED_PATH, [wethFirst])).toBe(0);
    expect(priceImpactBps(20n, 9n, REVERSED_PATH, [wethFirst])).toBeGreaterThan(0);
  });
});
