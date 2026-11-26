import { describe, expect, it } from 'vitest';
import { formatUnits } from '@/shared/lib/format';
import {
  addSideIssue,
  approvalNeed,
  DEADLINE_SECONDS,
  DEFAULT_SLIPPAGE_PERCENT,
  deadlineFromNow,
  isSlippageValid,
  parseAmount,
  percentToBps,
  SLIPPAGE_PRESETS,
} from './liquidity-form';

/**
 * 属性/边界测试：加池/撤出表单纯函数（`features/liquidity-pool/lib/liquidity-form`）。
 *
 * 测什么不变量：
 * - `approvalNeed`：不需要代币（≤0）时永远是 `not-needed`（哪怕 allowance 未知/为 0，
 *   QA D8 的「原生币单边不能显示已授权」）；需要代币时 allowance 未知或不足 → `required`，
 *   足额 → `satisfied`，且 allowance 越大状态不会倒退；
 * - `parseAmount` 精度内原值往返（0 也是 ok 0n，调用方的显式 0 判定依赖它），
 *   超精度一律 `too-precise` 并报告允许位数，绝不静默截断；
 * - 滑点预设与默认值的 percent→bps 换算确定；`isSlippageValid` 恰好是 [0.01, 50] 的有限数；
 * - `deadlineFromNow` = `floor(now/1000) + 1200` 秒，严格 20 分钟，且随 now 单调不减；
 * - `addSideIssue` 的四种状态由「原始文本 + 解析金额 + 是否 Router」共同决定，
 *   显式 0 与「另一侧还没填」不能混成同一句提示。
 *
 * 为什么重要：授权阶段、精度截断与 deadline 都是用户看得见、链上要签的数值；
 * 授权状态错会把「不需要授权」显示成「已授权」，精度静默截断会少存钱。
 *
 * 确定性：固定种子 32 位 LCG，每个属性 100–300 次迭代。
 */

const SEED = 0x1f0a_1127;

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

describe('approvalNeed 属性：授权阶段', () => {
  it('小整数网格穷举：0 需求永远 not-needed，其余按 allowance 是否足额定', () => {
    for (let required = 0; required <= 6; required += 1) {
      for (let allowance = 0; allowance <= 8; allowance += 1) {
        const expected =
          required === 0 ? 'not-needed' : allowance < required ? 'required' : 'satisfied';
        expect(approvalNeed(BigInt(required), BigInt(allowance))).toBe(expected);
      }
      expect(approvalNeed(BigInt(required), undefined)).toBe(
        required === 0 ? 'not-needed' : 'required',
      );
    }
  });

  it('大整数随机：需求 ≤0 永远 not-needed；allowance 增大状态只前进不倒退', () => {
    const rng = makeRng(SEED);
    for (let iteration = 0; iteration < 300; iteration += 1) {
      const required = iteration === 0 ? 0n : randomValue(rng, 30);
      const allowance = randomValue(rng, 30);
      const lower = randomValue(rng, 28);
      const higher = lower + randomValue(rng, 28);
      const lowerStatus = approvalNeed(required, lower);
      const higherStatus = approvalNeed(required, higher);
      expect(approvalNeed(required, allowance)).toBe(
        required <= 0n ? 'not-needed' : allowance < required ? 'required' : 'satisfied',
      );

      if (required <= 0n) {
        expect(lowerStatus).toBe('not-needed');
        expect(higherStatus).toBe('not-needed');
        expect(approvalNeed(required, undefined)).toBe('not-needed');
      } else {
        if (lowerStatus === 'satisfied') expect(higherStatus).toBe('satisfied');
        if (higherStatus === 'required') expect(lowerStatus).toBe('required');
      }
    }
    // 需求恰好等于 allowance 也算已足额（不是差一 wei）。
    expect(approvalNeed(100n, 100n)).toBe('satisfied');
    expect(approvalNeed(100n, 99n)).toBe('required');
    expect(approvalNeed(100n, undefined)).toBe('required');
    expect(approvalNeed(-1n, undefined)).toBe('not-needed');
  });
});

describe('parseAmount 属性：精度', () => {
  it('0–18 位精度内原值往返，0 也返回 ok 0n（显式 0 判定依赖它）', () => {
    const rng = makeRng(SEED + 1);
    for (let iteration = 0; iteration <= 200; iteration += 1) {
      const decimals = randomInt(rng, 0, 18);
      const value = iteration === 0 ? 0n : randomValue(rng, 24);
      const raw = formatUnits(value, decimals);
      expect(parseAmount(raw, decimals)).toEqual({ kind: 'ok', value });
    }
  });

  it('超精度一律 too-precise（报告允许位数），绝不静默截断', () => {
    for (let decimals = 0; decimals <= 18; decimals += 1) {
      const excess = `1.${'0'.repeat(decimals)}1`;
      const result = parseAmount(excess, decimals);
      expect(result).toEqual({ kind: 'too-precise', digits: decimals });
      expect(result.kind).not.toBe('ok');
    }
    // 0 位精度的边界：1.5 不只是「非法」，而是明确报告 0 位。
    expect(parseAmount('1.5', 0)).toEqual({ kind: 'too-precise', digits: 0 });
    expect(parseAmount('1', 0)).toEqual({ kind: 'ok', value: 1n });
    expect(parseAmount('', 18)).toEqual({ kind: 'empty' });
  });

  it('非法输入分类稳定：负号/指数/逗号/多点都是 invalid，前导零与 .5 合法', () => {
    for (const raw of ['-1', '+1', '1e3', '1,5', '1.2.3', '.', 'abc', '0x10']) {
      expect(parseAmount(raw, 18)).toEqual({ kind: 'invalid' });
    }
    expect(parseAmount('.5', 18)).toEqual({ kind: 'ok', value: 5n * 10n ** 17n });
    expect(parseAmount('0001.500000', 18)).toEqual({ kind: 'ok', value: 15n * 10n ** 17n });
  });
});

describe('滑点边界', () => {
  it('默认值与四个预设档位的 percent→bps 换算确定，且都通过范围校验', () => {
    expect(DEFAULT_SLIPPAGE_PERCENT).toBe(0.5);
    expect(percentToBps(DEFAULT_SLIPPAGE_PERCENT)).toBe(50);
    const expected = new Map([
      [0.1, 10],
      [0.5, 50],
      [1, 100],
      [2.5, 250],
    ]);
    for (const preset of SLIPPAGE_PRESETS) {
      expect(percentToBps(preset)).toBe(expected.get(preset));
      expect(isSlippageValid(preset)).toBe(true);
    }
  });

  it('isSlippageValid 恰好接受 [0.01, 50] 的有限数', () => {
    expect(isSlippageValid(0.01)).toBe(true);
    expect(isSlippageValid(50)).toBe(true);
    expect(isSlippageValid(0.009_999)).toBe(false);
    expect(isSlippageValid(50.000_1)).toBe(false);
    expect(isSlippageValid(Number.NaN)).toBe(false);
    expect(isSlippageValid(Number.POSITIVE_INFINITY)).toBe(false);

    const rng = makeRng(SEED + 2);
    for (let iteration = 0; iteration < 300; iteration += 1) {
      const percent = rng() * 80 - 15;
      expect(isSlippageValid(percent)).toBe(
        Number.isFinite(percent) && percent >= 0.01 && percent <= 50,
      );
    }
  });
});

describe('deadlineFromNow 属性', () => {
  it('严格等于 floor(now / 1000) + 1200 秒，且随 now 单调不减', () => {
    expect(DEADLINE_SECONDS).toBe(1_200);
    const rng = makeRng(SEED + 3);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const nowMs = Math.floor(rng() * 4_000_000_000_000);
      const deadline = deadlineFromNow(nowMs);
      const nowSeconds = Math.floor(nowMs / 1000);
      expect(deadline).toBe(BigInt(nowSeconds + DEADLINE_SECONDS));
      expect(Number(deadline) - nowSeconds).toBe(DEADLINE_SECONDS);

      const laterMs = nowMs + randomInt(rng, 0, 5_000);
      expect(deadlineFromNow(laterMs)).toBeGreaterThanOrEqual(deadline);
      expect(Number(deadlineFromNow(laterMs)) - Math.floor(laterMs / 1000)).toBe(DEADLINE_SECONDS);
    }
  });
});

describe('addSideIssue 边界：显式 0 与缺另一侧', () => {
  it('未填 / 双正数 / 显式 0 / Router 缺另一侧分别是四种状态', () => {
    const wei = 10n ** 18n;
    expect(
      addSideIssue({
        tokenRaw: '',
        nativeRaw: '',
        tokenAmount: 0n,
        nativeAmount: 0n,
        routerPath: true,
      }),
    ).toBe('none');
    expect(
      addSideIssue({
        tokenRaw: '1',
        nativeRaw: '1',
        tokenAmount: wei,
        nativeAmount: wei,
        routerPath: true,
      }),
    ).toBe('none');
    expect(
      addSideIssue({
        tokenRaw: '0',
        nativeRaw: '',
        tokenAmount: 0n,
        nativeAmount: 0n,
        routerPath: true,
      }),
    ).toBe('zero');
    expect(
      addSideIssue({
        tokenRaw: '1',
        nativeRaw: '',
        tokenAmount: wei,
        nativeAmount: 0n,
        routerPath: true,
      }),
    ).toBe('missing-other-side');
    // 非 Router（Hub 单边）只填一侧是正常状态。
    expect(
      addSideIssue({
        tokenRaw: '1',
        nativeRaw: '',
        tokenAmount: wei,
        nativeAmount: 0n,
        routerPath: false,
      }),
    ).toBe('none');
  });
});
