import { describe, expect, it } from 'vitest';
import { formatUnits } from './format';
import { parseAmountInput, type ParsedAmountInput } from './amount-input';

/**
 * 属性/边界测试：金额解析（`shared/lib/amount-input`）。
 *
 * 测什么不变量：
 * - 解析后再按同一精度格式化，数值不回绕：`parse(formatUnits(v, d)) === v`（含 0 与 24 位整数）；
 * - `truncate-precision` 的结果**等于精确十进制值的向下取整**，永远不大一格；
 * - 超精度在 reject 策略里必须报 `too-precise` / `invalid`，不许静默截断；
 * - 截断到 0 的非零输入必须带 `truncated: true`，不能伪装成合法的 0；
 * - 前导零、首尾空白、`.5` / `1.` 等写法对同一数值等价；任意文本不抛错、不出负值。
 *
 * 为什么重要：金额解析是五条写链共用的唯一入口，错一位就是错钱；现有单测是例子驱动，
 * 这里补随机与边界矩阵，覆盖「没被举到例子的输入」。
 *
 * 确定性：固定种子 32 位 LCG（Numerical Recipes 参数），每个属性 200–300 次迭代，
 * 无第三方依赖、同一运行永远同一序列。
 */

const SEED = 0x5eed_1127;

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

/** 随机正整数（十进制位数 1..maxDigits，首位非 0）。 */
function randomValue(rng: () => number, maxDigits: number): bigint {
  const digits = randomInt(rng, 1, maxDigits);
  return BigInt(String(randomInt(rng, 1, 9)) + randomDigits(rng, digits - 1));
}

const STRATEGIES = ['reject-precision', 'truncate-precision', 'reject-as-invalid'] as const;

function numericValue(result: ParsedAmountInput): bigint | undefined {
  if (result.kind === 'ok') return result.value;
  if (result.kind === 'zero') return 0n;
  return undefined;
}

/** 把任意小数串按 `decimals` 向下取整得到的精确整数值（测试侧独立实现）。 */
function exactFloor(raw: string, decimals: number): bigint {
  const [whole = '0', fraction = ''] = raw.trim().split('.');
  const wholeText = whole === '' ? '0' : whole;
  const kept = fraction.slice(0, decimals);
  const fractionValue =
    decimals === 0 ? 0n : BigInt(kept.length === 0 ? '0' : kept.padEnd(decimals, '0'));
  return BigInt(wholeText) * 10n ** BigInt(decimals) + fractionValue;
}

describe('parseAmountInput 属性：格式化往返', () => {
  it('对 0–18 位精度、最多 24 位整数的每个值，formatUnits 后都能原值解析回来', () => {
    const rng = makeRng(SEED);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const decimals = randomInt(rng, 0, 18);
      const value = randomValue(rng, 24);
      const raw = formatUnits(value, decimals);

      for (const strategy of STRATEGIES) {
        const result = parseAmountInput(raw, { decimals, strategy });
        if (value === 0n) {
          // reject-precision 的 0 是 ok 0n（五个面板的按钮门禁依赖这个区别）。
          if (strategy === 'reject-precision') {
            expect(result).toEqual({ kind: 'ok', value: 0n, truncated: false });
          } else {
            expect(result).toEqual({ kind: 'zero', truncated: false });
          }
        } else {
          expect(result).toEqual({ kind: 'ok', value, truncated: false });
        }
      }
    }
  });
});

describe('parseAmountInput 属性：截断只向下', () => {
  it('truncate-precision 等于精确值的向下取整，且永远不多给一格', () => {
    const rng = makeRng(SEED + 1);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const decimals = randomInt(rng, 0, 18);
      const whole = String(randomInt(rng, 0, 9)) + randomDigits(rng, randomInt(rng, 1, 7));
      const fraction = randomDigits(rng, decimals + randomInt(rng, 1, 6));
      const raw = `${whole}.${fraction}`;
      const expected = exactFloor(raw, decimals);

      const result = parseAmountInput(raw, { decimals, strategy: 'truncate-precision' });
      if (expected === 0n) {
        expect(result).toEqual({ kind: 'zero', truncated: true });
      } else {
        expect(result).toEqual({ kind: 'ok', value: expected, truncated: true });
      }
      // 解析结果再格式化（精度内）不会回绕。
      expect(
        numericValue(
          parseAmountInput(formatUnits(expected, decimals), {
            decimals,
            strategy: 'truncate-precision',
          }),
        ),
      ).toBe(expected);
    }
  });

  it('精度截断到 0 的非零输入必须标记 truncated，不许当成合法的 0', () => {
    for (let decimals = 0; decimals <= 18; decimals += 1) {
      const raw = `0.${'0'.repeat(decimals)}1`;
      expect(parseAmountInput(raw, { decimals, strategy: 'truncate-precision' })).toEqual({
        kind: 'zero',
        truncated: true,
      });
      // 同一输入在拒绝型策略里是明确的「超精度」，不是 0。
      expect(parseAmountInput(raw, { decimals, strategy: 'reject-precision' })).toEqual({
        kind: 'too-precise',
        digits: decimals,
      });
      expect(parseAmountInput(raw, { decimals, strategy: 'reject-as-invalid' })).toEqual({
        kind: 'invalid',
      });
    }
  });

  it('拒绝型策略对超精度报告的是允许位数，不泄露任何数值', () => {
    const rng = makeRng(SEED + 2);
    for (let iteration = 0; iteration < 120; iteration += 1) {
      const decimals = randomInt(rng, 0, 18);
      const raw = `1.${randomDigits(rng, decimals + randomInt(rng, 1, 5))}`;
      const tooPrecise = parseAmountInput(raw, { decimals, strategy: 'reject-precision' });
      expect(tooPrecise).toEqual({ kind: 'too-precise', digits: decimals });
      expect(numericValue(tooPrecise)).toBeUndefined();
      expect(parseAmountInput(raw, { decimals, strategy: 'reject-as-invalid' })).toEqual({
        kind: 'invalid',
      });
    }
  });
});

describe('parseAmountInput 属性：写法等价', () => {
  it('前导零与首尾空白不改变解析结果', () => {
    const raws = ['0', '0.0', '1', '1.', '.5', '0001.20', '123.456', '0.000'];
    for (const raw of raws) {
      const base = parseAmountInput(raw, { decimals: 18, strategy: 'reject-precision' });
      for (const variant of [`  ${raw}  `, `\t${raw}\n`, `000${raw}`, ` ${'0'.repeat(5)}${raw} `]) {
        for (const strategy of STRATEGIES) {
          expect(parseAmountInput(variant, { decimals: 18, strategy })).toEqual(
            parseAmountInput(raw, { decimals: 18, strategy }),
          );
        }
      }
      expect(base.kind).not.toBe('invalid');
    }
  });

  it('同一数值的不同写法（1 / 1.0 / 01 / 1.000）在三种策略下数值相同', () => {
    const groups = [
      ['1', '1.0', '01', '0001', '1.000', '0001.000'],
      ['0', '0.0', '.0', '000', '0.000'],
      ['0.5', '.5', '0.500', '000.5', '0000.5000'],
    ];
    for (const group of groups) {
      for (const strategy of STRATEGIES) {
        const values = group.map((raw) =>
          numericValue(parseAmountInput(raw, { decimals: 18, strategy })),
        );
        expect(new Set(values.map((value) => value?.toString()))).toHaveProperty('size', 1);
      }
    }
  });
});

describe('parseAmountInput 属性：跨策略一致', () => {
  it('没有丢精度时，三种策略给出同一个数值（只有 0 的 kind 不同）', () => {
    const rng = makeRng(SEED + 3);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const decimals = randomInt(rng, 0, 18);
      const whole = String(randomInt(rng, 0, 9)) + randomDigits(rng, randomInt(rng, 0, 5));
      const fractionLength = randomInt(rng, 0, Math.min(decimals, 6));
      const fraction = fractionLength === 0 ? '' : `.${randomDigits(rng, fractionLength)}`;
      const raw = `${whole}${fraction}`;
      const expected = exactFloor(raw, decimals);

      for (const strategy of STRATEGIES) {
        const result = parseAmountInput(raw, { decimals, strategy });
        expect(numericValue(result)).toBe(expected);
        if (expected === 0n) {
          expect(['ok', 'zero']).toContain(result.kind);
        } else {
          expect(result).toEqual({ kind: 'ok', value: expected, truncated: false });
        }
      }
    }
  });
});

describe('parseAmountInput 属性：坏输入安全', () => {
  it('任意文本都不抛错、不出负值，返回的 kind 始终在契约内', () => {
    const rng = makeRng(SEED + 4);
    const pool = '0123456789.,-+eExX \t\u00a0，。１ａ0x';
    for (let iteration = 0; iteration < 300; iteration += 1) {
      const length = randomInt(rng, 0, 12);
      let raw = '';
      for (let index = 0; index < length; index += 1) {
        raw += pool[randomInt(rng, 0, pool.length - 1)];
      }
      const decimals = randomInt(rng, 0, 18);
      for (const strategy of STRATEGIES) {
        const result = parseAmountInput(raw, { decimals, strategy });
        expect(['empty', 'invalid', 'too-precise', 'zero', 'ok']).toContain(result.kind);
        if (result.kind === 'ok') expect(result.value).toBeGreaterThanOrEqual(0n);
        if (result.kind === 'too-precise') expect(result.digits).toBe(decimals);
      }
    }
  });
});
