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
  it('parses the five-line native fixture and merges the duplicate address', () => {
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
    expect(result.rows.map((row) => row.address)).toEqual([A, B, C, D]);
    expect(result.rows.map((row) => row.amount)).toEqual([
      150000000000000000n,
      200000000000000000n,
      150000000000000000n,
      1000000000000n,
    ]);
    expect(result.rows[0]?.lines).toEqual([1, 4]);
    expect(result.total).toBe(500001000000000000n);
    expect(result.truncated).toBe(false);
  });

  it('skips blank lines but keeps the original line numbers for errors', () => {
    const result = parseBatchText(`\n${A} 0.1\n\n${B}\n`, OPTIONS);

    expect(result.lineCount).toBe(2);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([{ line: 4, reason: 'missingAmount' }]);
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

  it('keeps only the case-insensitive duplicate merged once', () => {
    const lower = A.toLowerCase();
    const result = parseBatchText(`${A} 1\n${lower} 2`, OPTIONS);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.amount).toBe(3000000000000000000n);
    expect(result.rows[0]?.lines).toEqual([1, 2]);
  });
});
