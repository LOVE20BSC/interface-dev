import { describe, expect, it } from 'vitest';
import { parseBatchText } from './batch-parse';

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const BATCH = '0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690';
const A = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
const B = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955';
const C = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f';
const D = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720';

const OPTIONS = { decimals: 18, self: SELF, batchContract: BATCH as `0x${string}` };

describe('parseBatchText', () => {
  it('parses the five-line native fixture and flags the duplicate line instead of merging', () => {
    const result = parseBatchText(
      [
        `${A} 0.1`,
        `${B}, 0.2`,
        `${C} 0.15`,
        `${A} 0.05`,
        `${D} 0.000001`,
      ].join('\n'),
      OPTIONS,
    );

    expect(result.errors).toEqual([]);
    expect(result.lineCount).toBe(5);
    // 每行一个地址：重复行不再合并金额，也不生成第二行。
    expect(result.rows.map((row) => row.address)).toEqual([A, B, C, D]);
    expect(result.rows.map((row) => row.amount)).toEqual([
      100000000000000000n,
      200000000000000000n,
      150000000000000000n,
      1000000000000n,
    ]);
    expect(result.rows.map((row) => row.line)).toEqual([1, 2, 3, 5]);
    expect(result.duplicates).toEqual([{ line: 4, firstLine: 1 }]);
    expect(result.total).toBe(450001000000000000n);
    expect(result.truncated).toBe(false);
  });

  it('skips blank lines but keeps the original line numbers for errors', () => {
    const result = parseBatchText(`\n${A} 0.1\n\n${B}\n`, OPTIONS);

    expect(result.lineCount).toBe(2);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.line).toBe(2);
    expect(result.errors).toEqual([{ line: 4, reason: 'missingAmount' }]);
    expect(result.duplicates).toEqual([]);
  });

  it('reports every invalid line with its own reason', () => {
    const result = parseBatchText(
      [
        '0x1234 0.1', // invalid address
        `${A}`, // missing amount
        `${A} abc`, // invalid amount
        `${A} 0`, // zero amount
        '0x0000000000000000000000000000000000000000 0.1', // zero address
        `${A} 0.1 0.2`, // too many tokens
      ].join('\n'),
      OPTIONS,
    );

    expect(result.errors).toEqual([
      { line: 1, reason: 'invalidAddress' },
      { line: 2, reason: 'missingAmount' },
      { line: 3, reason: 'invalidAmount' },
      { line: 4, reason: 'zeroAmount' },
      { line: 5, reason: 'zeroAddress' },
      { line: 6, reason: 'invalidLine' },
    ]);
    expect(result.rows).toEqual([]);
    expect(result.duplicates).toEqual([]);
    expect(result.total).toBe(0n);
  });

  it('refuses the wallet itself and the BatchTransfer contract', () => {
    const result = parseBatchText(`${SELF} 0.1\n${BATCH} 0.2`, OPTIONS);

    expect(result.errors).toEqual([
      { line: 1, reason: 'selfAddress' },
      { line: 2, reason: 'batchContract' },
    ]);
  });

  it('truncates fraction digits down to the token decimals and flags it', () => {
    const sixDecimals = { ...OPTIONS, decimals: 6 };
    const result = parseBatchText(`${A} 1.123456789`, sixDecimals);

    expect(result.rows[0]?.amount).toBe(1123456n);
    expect(result.truncated).toBe(true);
  });

  it('rejects scientific notation, negative numbers and full-width digits', () => {
    const result = parseBatchText(
      [`${A} 1e3`, `${A} -1`, `${A} １`].join('\n'),
      OPTIONS,
    );

    expect(result.errors.map((error) => error.reason)).toEqual([
      'invalidAmount',
      'invalidAmount',
      'invalidAmount',
    ]);
  });

  it('treats the duplicate comparison as case-insensitive and keeps only the first row', () => {
    const lower = A.toLowerCase();
    const result = parseBatchText(`${A} 1\n${lower} 2`, OPTIONS);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.amount).toBe(1000000000000000000n);
    expect(result.rows[0]?.line).toBe(1);
    expect(result.duplicates).toEqual([{ line: 2, firstLine: 1 }]);
    expect(result.total).toBe(1000000000000000000n);
  });

  it('points every later repeat at the first appearance, not at the previous repeat', () => {
    const result = parseBatchText(`${A} 0.1\n${A} 0.2\n${A} 0.3`, OPTIONS);

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(100000000000000000n);
    expect(result.duplicates).toEqual([
      { line: 2, firstLine: 1 },
      { line: 3, firstLine: 1 },
    ]);
  });

  it('reports a malformed line as its own error, not as a duplicate', () => {
    const result = parseBatchText(`${A} 0.1\n${A} abc\n${A} 0.2`, OPTIONS);

    expect(result.errors).toEqual([{ line: 2, reason: 'invalidAmount' }]);
    // 第 3 行的地址第一次出现是第 1 行（第 2 行不是合法行）。
    expect(result.duplicates).toEqual([{ line: 3, firstLine: 1 }]);
    expect(result.rows).toHaveLength(1);
  });

  // D4: 千分位金额是常见粘贴格式，逗号同时是分隔符，不能只报「这一行看不懂」。
  it('accepts thousands-separated amounts instead of splitting them into junk tokens', () => {
    const result = parseBatchText(`${A} 1,000\n${B} 2,500.5\n${C} 1,000,000.25`, OPTIONS);

    expect(result.errors).toEqual([]);
    expect(result.rows.map((row) => row.amount)).toEqual([
      1000000000000000000000n,
      2500500000000000000000n,
      1000000250000000000000000n,
    ]);
  });

  it('still rejects a line whose extra tokens are not a thousands group', () => {
    const result = parseBatchText(`${A} 0.1 0.2`, OPTIONS);

    expect(result.errors).toEqual([{ line: 1, reason: 'invalidLine' }]);
    expect(result.rows).toEqual([]);
  });

  // D5: 非零金额被精度截断成 0 时说明原因，而不是笼统的「金额必须大于 0」。
  it('explains a non-zero amount truncated to zero by the token precision', () => {
    const result = parseBatchText(`${A} 0.0000000000000000009\n${B} 0`, OPTIONS);

    expect(result.errors).toEqual([
      { line: 1, reason: 'truncatedToZero' },
      { line: 2, reason: 'zeroAmount' },
    ]);
  });

  // D10: 解析器对 CRLF / LF / 纯 CR 三种换行都按行切分（纯 CR 在浏览器里不可达，防御性修复）。
  it('splits CRLF, LF and lone CR line endings alike', () => {
    const lf = parseBatchText(`${A} 0.1\n${B} 0.2`, OPTIONS);
    const crlf = parseBatchText(`${A} 0.1\r\n${B} 0.2`, OPTIONS);
    const cr = parseBatchText(`${A} 0.1\r${B} 0.2`, OPTIONS);

    for (const result of [lf, crlf, cr]) {
      expect(result.errors).toEqual([]);
      expect(result.lineCount).toBe(2);
      expect(result.rows.map((row) => row.address)).toEqual([A, B]);
    }
  });
});
