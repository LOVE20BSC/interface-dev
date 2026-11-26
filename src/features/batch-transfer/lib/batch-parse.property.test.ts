import { describe, expect, it } from 'vitest';
import type { HexAddress } from '@/config/networks';
import { formatUnits } from '@/shared/lib/format';
import { parseBatchText } from './batch-parse';

/**
 * 属性/边界测试：批量转账文本解析（`features/batch-transfer/lib/batch-parse`）。
 *
 * 测什么不变量：
 * - **行分区**：每条非空行恰好落入 `rows` / `errors` / `duplicates` 之一，行号完整且不重叠；
 * - `total` 恒等于 `rows` 金额之和，重复行、非法行、自转/零地址/合约地址都不进合计；
 * - 空行只影响行号，不计入 `lineCount`；CRLF / LF / 独立 CR 结果完全一致；
 * - 空格与逗号分隔等价；`1,000` / `2,500.5` 千分位与去逗号后的数值完全相同；
 * - 重复地址不再静默合并：保留首行、后续行进 `duplicates`（含首次出现行号），不改变合计；
 * - 打乱合法行的顺序不改变合计与地址集合；
 * - 0.000001（10^12 wei）、1 wei、21 位整数、千分位等边界金额逐 wei 精确；
 * - 超精度按 18 位向下截断并标记 `truncated`；截断成 0 的行报 `truncatedToZero`，不静默入账。
 *
 * 为什么重要：批量转账一次签名动的是整份列表，合计少/多一个 wei 就是一次错账；
 * 重复地址的处理是 owner 明确要求过的产品语义，不能靠示例测试兜住所有行组合。
 *
 * 确定性：固定种子 32 位 LCG，每个属性 100–200 次迭代；地址由确定性十六进制构造。
 */

const SEED = 0xb47c_1127;

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

/** 随机正整数（十进制位数 1..maxDigits）。 */
function randomValue(rng: () => number, maxDigits: number): bigint {
  const digits = randomInt(rng, 1, maxDigits);
  return BigInt(String(randomInt(rng, 1, 9)) + randomDigits(rng, digits - 1));
}

/** 40 位十六进制地址（含 a–f 字母，便于大小写重复用例）；index 0 是零地址。 */
function addressFor(index: number): HexAddress {
  return `0x${index.toString(16).padStart(2, '0')}${'ab'.repeat(19)}` as HexAddress;
}

const ZERO_ADDRESS = `0x${'0'.repeat(40)}` as HexAddress;
const SELF = addressFor(200);
const BATCH = addressFor(201);
const OPTIONS = { decimals: 18, self: SELF, batchContract: BATCH } as const;

function upperAddress(address: string): string {
  return `0x${address.slice(2).toUpperCase()}`;
}

function randomAddress(rng: () => number): HexAddress {
  return addressFor(randomInt(rng, 1, 60));
}

/** 精确金额文本（≤18 位小数，非零）。 */
function exactAmountText(rng: () => number, maxDigits = 12): string {
  return formatUnits(randomValue(rng, maxDigits), 18);
}

/** 同一数值加上 1–4 位超精度尾数（18 位精度下的精确值不变）。 */
function excessPrecisionText(rng: () => number, value: bigint): string {
  const exact = formatUnits(value, 18);
  const [whole = '0', fraction = ''] = exact.split('.');
  const extra = randomDigits(rng, randomInt(rng, 1, 4));
  return `${whole}.${fraction.padEnd(18, '0')}${extra}`;
}

function groupThousands(text: string): string {
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function nonEmptyLineNumbers(text: string): number[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim().length > 0)
    .map(({ number }) => number);
}

const GARBAGE_LINES = [
  'abc',
  '1.2.3',
  '0x123 1',
  '0x12 0.5',
  '1,00',
  '0.1 0.2',
  ',',
  '   ',
  '',
  '0x 1',
] as const;

function randomLine(rng: () => number): string {
  switch (randomInt(rng, 0, 6)) {
    case 0:
      return `${randomAddress(rng)} ${exactAmountText(rng)}`;
    case 1:
      return `${randomAddress(rng)},${exactAmountText(rng)}`;
    case 2:
      return `${randomAddress(rng)} 0`;
    case 3:
      return `${randomAddress(rng)}`;
    case 4:
      return GARBAGE_LINES[randomInt(rng, 0, GARBAGE_LINES.length - 1)] ?? '';
    case 5:
      return `${SELF} 1`;
    default:
      return `${randomAddress(rng)} 1,000`;
  }
}

describe('parseBatchText 属性：行分区与合计', () => {
  it('每条非空行恰好进 rows / errors / duplicates 之一，行号完整且不重叠', () => {
    const rng = makeRng(SEED);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const lines = Array.from({ length: randomInt(rng, 1, 10) }, () => randomLine(rng));
      const text = lines.join('\n');
      const result = parseBatchText(text, OPTIONS);
      const expectedLines = nonEmptyLineNumbers(text);
      const bucketLines = [
        ...result.rows.map((row) => row.line),
        ...result.errors.map((error) => error.line),
        ...result.duplicates.map((duplicate) => duplicate.line),
      ].sort((a, b) => a - b);

      expect(bucketLines).toEqual(expectedLines);
      expect(new Set(bucketLines).size).toBe(bucketLines.length);
      expect(result.lineCount).toBe(expectedLines.length);
      expect(result.rows.every((row) => row.amount > 0n)).toBe(true);
    }
  });

  it('total 恒等于 rows 金额之和（含重复与非法行时也一样）', () => {
    const rng = makeRng(SEED + 1);
    for (let iteration = 0; iteration < 150; iteration += 1) {
      const lines = Array.from({ length: randomInt(rng, 1, 12) }, () => randomLine(rng));
      const result = parseBatchText(lines.join('\n'), OPTIONS);
      const sum = result.rows.reduce((accumulator, row) => accumulator + row.amount, 0n);
      expect(result.total).toBe(sum);
    }
  });
});

describe('parseBatchText 属性：换行与分隔符', () => {
  it('CRLF / LF / 独立 CR 对同一内容给出完全相同的结果', () => {
    const rng = makeRng(SEED + 2);
    for (let iteration = 0; iteration < 50; iteration += 1) {
      const lines = Array.from({ length: randomInt(rng, 1, 8) }, () => randomLine(rng));
      const lf = parseBatchText(lines.join('\n'), OPTIONS);
      const crlf = parseBatchText(lines.join('\r\n'), OPTIONS);
      const cr = parseBatchText(lines.join('\r'), OPTIONS);
      expect(crlf).toEqual(lf);
      expect(cr).toEqual(lf);
    }
  });

  it('空格、逗号、制表符与多余空白对同一行等价', () => {
    const rng = makeRng(SEED + 3);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const address = randomAddress(rng);
      const value = randomValue(rng, 12);
      const amount = formatUnits(value, 18);
      const variants = [
        `${address} ${amount}`,
        `${address},${amount}`,
        `${address} , ${amount}`,
        `${address}\t${amount}`,
        `${address}   ${amount}`,
      ];
      for (const line of variants) {
        const result = parseBatchText(line, OPTIONS);
        expect(result.errors).toEqual([]);
        expect(result.duplicates).toEqual([]);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]?.amount).toBe(value);
        expect(result.total).toBe(value);
      }
    }
  });

  it('千分位写法 1,000 / 2,500.5 与去逗号后的数值逐 wei 相同', () => {
    const rng = makeRng(SEED + 4);
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const address = randomAddress(rng);
      const whole = randomInt(rng, 1_000, 999_999_999);
      const grouped = groupThousands(String(whole));
      const groupedDecimal = `${grouped}.5`;
      const expectedDecimal = BigInt(whole) * 10n ** 18n + 5n * 10n ** 17n;

      const integerResult = parseBatchText(`${address} ${grouped}`, OPTIONS);
      expect(integerResult.errors).toEqual([]);
      expect(integerResult.rows[0]?.amount).toBe(BigInt(whole) * 10n ** 18n);

      const decimalResult = parseBatchText(`${address} ${groupedDecimal}`, OPTIONS);
      expect(decimalResult.errors).toEqual([]);
      expect(decimalResult.rows[0]?.amount).toBe(expectedDecimal);
    }
  });
});

describe('parseBatchText 属性：重复地址', () => {
  it('重复行不进合计、不合并金额，只报告首次出现行号（大小写不敏感）', () => {
    const first = addressFor(1);
    const second = addressFor(2);
    const third = addressFor(3);
    const lines = [`${first} 0.1`, `${second}, 0.2`, `${third} 0.15`];
    const baseline = parseBatchText(lines.join('\n'), OPTIONS);
    expect(baseline.total).toBe(
      100_000_000_000_000_000n + 200_000_000_000_000_000n + 150_000_000_000_000_000n,
    );

    const withRepeat = parseBatchText([...lines, `${first} 0.05`].join('\n'), OPTIONS);
    expect(withRepeat.total).toBe(baseline.total);
    expect(withRepeat.rows).toEqual(baseline.rows);
    expect(withRepeat.duplicates).toEqual([{ line: 4, firstLine: 1 }]);

    // 大小写不同的同一地址也是重复：保留首行，后来者只报行号。
    const upper = upperAddress(second);
    const withCaseRepeat = parseBatchText([...lines, `${upper} 0.9`].join('\n'), OPTIONS);
    expect(withCaseRepeat.total).toBe(baseline.total);
    expect(withCaseRepeat.duplicates).toEqual([{ line: 4, firstLine: 2 }]);
  });

  it('打乱合法行顺序后合计与地址集合不变', () => {
    const rng = makeRng(SEED + 5);
    for (let iteration = 0; iteration < 50; iteration += 1) {
      const entries = Array.from({ length: 8 }, (_, index) => ({
        address: addressFor(index + 1),
        value: randomValue(rng, 12),
      }));
      const lines = entries.map((entry) => `${entry.address} ${formatUnits(entry.value, 18)}`);
      // Fisher–Yates，用同一个确定性 rng。
      for (let index = lines.length - 1; index > 0; index -= 1) {
        const swap = randomInt(rng, 0, index);
        [lines[index], lines[swap]] = [lines[swap] ?? '', lines[index] ?? ''];
      }
      const shuffled = parseBatchText(lines.join('\n'), OPTIONS);
      expect(shuffled.errors).toEqual([]);
      expect(shuffled.duplicates).toEqual([]);
      expect(shuffled.rows.map((row) => row.address).sort()).toEqual(
        entries.map((entry) => entry.address).sort(),
      );
      expect(shuffled.total).toBe(entries.reduce((sum, entry) => sum + entry.value, 0n));
    }
  });
});

describe('parseBatchText 边界：金额与截断', () => {
  it('0.000001（10^12 wei）、1 wei、21 位整数与千分位大数都精确进合计', () => {
    const text = [
      `${addressFor(1)} 0.000001`,
      `${addressFor(2)} 0.000000000000000001`,
      `${addressFor(3)} 123456789012345678901`,
      `${addressFor(4)} 1,234,567`,
      `${addressFor(5)} 0001.500000`,
    ].join('\n');
    const result = parseBatchText(text, OPTIONS);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]?.amount).toBe(10n ** 12n);
    expect(result.rows[1]?.amount).toBe(1n);
    expect(result.rows[2]?.amount).toBe(123_456_789_012_345_678_901n * 10n ** 18n);
    expect(result.rows[3]?.amount).toBe(1_234_567n * 10n ** 18n);
    expect(result.rows[4]?.amount).toBe(15n * 10n ** 17n);
    expect(result.total).toBe(
      10n ** 12n +
        1n +
        123_456_789_012_345_678_901n * 10n ** 18n +
        1_234_567n * 10n ** 18n +
        15n * 10n ** 17n,
    );
  });

  it('超精度按 18 位向下截断、不向上进位，并标记 truncated', () => {
    const rng = makeRng(SEED + 6);
    const entries = Array.from({ length: 3 }, (_, index) => ({
      address: addressFor(index + 1),
      value: randomValue(rng, 20),
    }));
    const text = entries
      .map((entry) => `${entry.address} ${excessPrecisionText(rng, entry.value)}`)
      .join('\n');
    const result = parseBatchText(text, OPTIONS);
    expect(result.errors).toEqual([]);
    expect(result.truncated).toBe(true);
    expect(result.rows.map((row) => row.amount)).toEqual(entries.map((entry) => entry.value));
    expect(result.total).toBe(entries.reduce((sum, entry) => sum + entry.value, 0n));
  });

  it('截断成 0 的行报 truncatedToZero，不产生行、不改合计', () => {
    const valid = `${addressFor(1)} 1`;
    const truncatedToZero = `${addressFor(9)} 0.0000000000000000001`;
    const withInvalid = parseBatchText(`${valid}\n${truncatedToZero}`, OPTIONS);
    const baseline = parseBatchText(valid, OPTIONS);

    expect(withInvalid.rows).toHaveLength(1);
    expect(withInvalid.total).toBe(baseline.total);
    expect(withInvalid.errors).toEqual([{ line: 2, reason: 'truncatedToZero' }]);
  });
});

describe('parseBatchText 边界：地址保护', () => {
  it('零地址 / 自己 / 批量合约地址（含大小写变体）都拒绝，且不进合计', () => {
    const text = [
      `${ZERO_ADDRESS} 1`,
      `${SELF} 1`,
      `${BATCH} 1`,
      `${upperAddress(SELF)} 1`,
      `${addressFor(1)} 1`,
    ].join('\n');
    const result = parseBatchText(text, OPTIONS);
    expect(result.errors).toEqual([
      { line: 1, reason: 'zeroAddress' },
      { line: 2, reason: 'selfAddress' },
      { line: 3, reason: 'batchContract' },
      { line: 4, reason: 'selfAddress' },
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(10n ** 18n);
  });

  it('未连接钱包 / 合约地址未知时，只保留零地址这一条硬保护', () => {
    const text = [`${SELF} 1`, `${BATCH} 1`, `${ZERO_ADDRESS} 1`].join('\n');
    const result = parseBatchText(text, {
      decimals: 18,
      self: undefined,
      batchContract: undefined,
    });
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toEqual([{ line: 3, reason: 'zeroAddress' }]);
    expect(result.total).toBe(2n * 10n ** 18n);
  });
});
