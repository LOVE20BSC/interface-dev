import { describe, expect, it } from 'vitest';
import { buildBatchReceipt } from './batch-receipt';
import type { BatchRequest } from './batch-types';

const A = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' as const;
const B = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955' as const;
const HASH = `0x${'ab'.repeat(32)}` as const;

const REQUEST: BatchRequest = {
  mode: 'token',
  tokenAddress: '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF',
  tokenSymbol: 'TestLOVE20',
  tokenDecimals: 18,
  rows: [
    { address: A, amount: 1500000000000000000n },
    { address: B, amount: 500000000000000000n },
  ],
  total: 2000000000000000000n,
  gasLimit: 60000,
  preBalances: [0n, 0n],
  recipientHasCode: [false, false],
};

describe('buildBatchReceipt', () => {
  it('keeps the chain facts and the audit rows', () => {
    const record = buildBatchReceipt(HASH, REQUEST, [
      1500000000000000000n,
      500000000000000000n,
    ]);

    expect(record.total).toBe(2000000000000000000n);
    expect(record.rows.map((row) => row.status)).toEqual(['matched', 'matched']);
    expect(record.residualAllowance).toBeUndefined();
  });

  it('carries a residual allowance only when the reader found one (D7)', () => {
    const record = buildBatchReceipt(HASH, REQUEST, [undefined, undefined], 2000000000000n);

    expect(record.residualAllowance).toBe(2000000000000n);
    // A failed post-read is unknown, never zero.
    expect(record.rows.map((row) => row.status)).toEqual(['unknown', 'unknown']);
    expect(record.rows.map((row) => row.delta)).toEqual([undefined, undefined]);
  });
});
