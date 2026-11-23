import { beforeEach, describe, expect, it } from 'vitest';
import { cache } from '@/shared/lib/cache';
import {
  BATCH_TASK_CACHE_KEY,
  clearStoredBatch,
  createBatchScope,
  readStoredBatch,
  writeStoredBatch,
  type StoredBatch,
} from '@/features/batch-transfer/lib/batch-record';
import type { BatchRequest } from '@/features/batch-transfer/lib/batch-types';

const WALLET = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const OTHER = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const ROW_A = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955';
const ROW_B = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f';
const HASH = `0x${'ab'.repeat(32)}` as const;

const SCOPE = createBatchScope(31337, WALLET);

const TOKEN_REQUEST: BatchRequest = {
  mode: 'token',
  tokenAddress: TOKEN,
  tokenSymbol: 'TestLOVE20',
  tokenDecimals: 18,
  rows: [
    { address: ROW_A, amount: 1000000000000000000n },
    { address: ROW_B, amount: 2000000000000000000n },
  ],
  total: 3000000000000000000n,
  gasLimit: 123456,
  preBalances: [1000000000000000000n, undefined],
  recipientHasCode: [false, undefined],
};

const NATIVE_REQUEST: BatchRequest = {
  ...TOKEN_REQUEST,
  mode: 'native',
  tokenAddress: undefined,
  tokenSymbol: 'ETH',
};

const PENDING: StoredBatch = {
  hash: HASH,
  chainId: 31337,
  account: WALLET,
  kind: 'batch',
  request: TOKEN_REQUEST,
  nonce: 9,
  recordedAt: 1_700_000_000_000,
};

beforeEach(() => {
  cache.clearAll();
});

describe('batch-record 在途批量转账（R1/R3/R4）', () => {
  it('round-trips a pending batch with its exact replay request', () => {
    writeStoredBatch(SCOPE, PENDING);
    expect(readStoredBatch(SCOPE)).toEqual(PENDING);
  });

  it('round-trips the native shape without a token address', () => {
    writeStoredBatch(SCOPE, {
      ...PENDING,
      kind: 'approve',
      request: NATIVE_REQUEST,
      nonce: undefined,
    });
    const stored = readStoredBatch(SCOPE);
    expect(stored?.kind).toBe('approve');
    expect(stored?.request.mode).toBe('native');
    expect(stored?.request.tokenAddress).toBeUndefined();
    expect(stored?.nonce).toBeUndefined();
  });

  it('rejects a legacy hash-less record (no retry state after T004)', () => {
    cache.set(SCOPE, BATCH_TASK_CACHE_KEY, { ...PENDING, hash: null, nonce: undefined });
    expect(readStoredBatch(SCOPE)).toBeNull();
  });

  it('scopes the task by chain + wallet, never leaking across wallets (R3/R4)', () => {
    writeStoredBatch(SCOPE, PENDING);
    // A 发起 → 切到 B → 重进页面：B 读不到 A 的待确认批量转账。
    expect(readStoredBatch(createBatchScope(31337, OTHER))).toBeNull();
    expect(readStoredBatch(createBatchScope(56, WALLET))).toBeNull();
    expect(cache.key(SCOPE, BATCH_TASK_CACHE_KEY)).toContain(WALLET.toLowerCase());
  });

  it('rejects a record without an owner or with a broken request', () => {
    writeStoredBatch(SCOPE, PENDING);
    const raw = cache.get<Record<string, unknown>>(SCOPE, BATCH_TASK_CACHE_KEY);
    expect(raw).not.toBeNull();
    if (raw === null) return;
    for (const broken of [
      { ...raw, chainId: undefined },
      { ...raw, account: undefined },
      { ...raw, account: '0xnot-an-address' },
      { ...raw, kind: 'swap' },
      { ...raw, hash: '0x1234' },
      { ...raw, request: { ...(raw.request as Record<string, unknown>), rows: [] } },
      { ...raw, request: { ...(raw.request as Record<string, unknown>), total: '-1' } },
      {
        ...raw,
        request: {
          ...(raw.request as Record<string, unknown>),
          rows: [{ address: '0xnot-an-address', amount: '1' }],
        },
      },
      {
        ...raw,
        request: {
          ...(raw.request as Record<string, unknown>),
          mode: 'token',
          tokenAddress: undefined,
        },
      },
      { ...raw, request: { ...(raw.request as Record<string, unknown>), mode: 'approve' } },
    ]) {
      cache.set(SCOPE, BATCH_TASK_CACHE_KEY, broken);
      expect(readStoredBatch(SCOPE)).toBeNull();
    }
  });

  it('round-trips unreadable pre-balances as undefined instead of 0', () => {
    writeStoredBatch(SCOPE, PENDING);
    const stored = readStoredBatch(SCOPE);
    expect(stored?.request.preBalances).toEqual([1000000000000000000n, undefined]);
    expect(stored?.request.recipientHasCode).toEqual([false, undefined]);
  });

  it('clears the task once the batch settles', () => {
    writeStoredBatch(SCOPE, PENDING);
    clearStoredBatch(SCOPE);
    expect(readStoredBatch(SCOPE)).toBeNull();
  });
});
