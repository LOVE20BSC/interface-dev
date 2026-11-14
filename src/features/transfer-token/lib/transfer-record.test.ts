import { beforeEach, describe, expect, it } from 'vitest';
import { cache } from '@/shared/lib/cache';
import {
  TRANSFER_TASK_CACHE_KEY,
  clearStoredTransfer,
  createTransferScope,
  readStoredTransfer,
  storedTransferToRecord,
  writeStoredTransfer,
  type StoredTransfer,
} from '@/features/transfer-token/lib/transfer-record';

const WALLET = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const RECIPIENT = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955';
const HASH = `0x${'ab'.repeat(32)}` as const;

const SCOPE = createTransferScope(31337, WALLET);

const PENDING: StoredTransfer = {
  hash: HASH,
  token: { kind: 'community', address: TOKEN, symbol: 'TestLOVE20', decimals: 18 },
  amount: 1500000000000000000n,
  recipient: RECIPIENT,
  recipientLabel: '身份 NFT #2 Testdev-member-1',
  confirmed: false,
  recordedAt: 1_700_000_000_000,
};

beforeEach(() => {
  cache.clearAll();
});

describe('transfer-record 在途交易持久化（D1/D4）', () => {
  it('round-trips a pending transfer with its replay request', () => {
    writeStoredTransfer(SCOPE, PENDING);
    expect(readStoredTransfer(SCOPE)).toEqual(PENDING);
  });

  it('round-trips the confirmed flag so a refresh can restore the strip', () => {
    writeStoredTransfer(SCOPE, { ...PENDING, confirmed: true });
    const stored = readStoredTransfer(SCOPE);
    expect(stored?.confirmed).toBe(true);
    expect(stored?.hash).toBe(HASH);
  });

  it('scopes the task by chain + wallet, never leaking across wallets', () => {
    writeStoredTransfer(SCOPE, PENDING);
    expect(readStoredTransfer(createTransferScope(31337, RECIPIENT))).toBeNull();
    expect(readStoredTransfer(createTransferScope(56, WALLET))).toBeNull();
    // Contract-less scope: the key carries the zero address, not a page contract.
    expect(cache.key(SCOPE, TRANSFER_TASK_CACHE_KEY)).toContain(
      ':0x0000000000000000000000000000000000000000:',
    );
    expect(cache.key(SCOPE, TRANSFER_TASK_CACHE_KEY)).toContain(WALLET.toLowerCase());
  });

  it('persists the native shape without an address and re-reads it', () => {
    const native: StoredTransfer = {
      ...PENDING,
      token: { kind: 'native', address: undefined, symbol: 'ETH', decimals: 18 },
      recipientLabel: undefined,
      amount: 100000000000000000n,
    };
    writeStoredTransfer(SCOPE, native);
    const stored = readStoredTransfer(SCOPE);
    expect(stored?.token).toEqual({ kind: 'native', address: undefined, symbol: 'ETH', decimals: 18 });
    expect(stored?.recipientLabel).toBeUndefined();
  });

  it('rejects a non-native token without an address instead of faking a request', () => {
    cache.set(SCOPE, TRANSFER_TASK_CACHE_KEY, {
      hash: HASH,
      token: { kind: 'community', symbol: 'TestLOVE20', decimals: 18 },
      amount: '1',
      recipient: RECIPIENT,
      confirmed: false,
      recordedAt: 1,
    });
    expect(readStoredTransfer(SCOPE)).toBeNull();
  });

  it('rejects malformed hashes, amounts and recipients (no unsubmittable restore)', () => {
    const base = JSON.parse(
      JSON.stringify({
        ...PENDING,
        amount: PENDING.amount.toString(),
      }),
    ) as Record<string, unknown>;
    for (const broken of [
      { ...base, hash: '0x1234' },
      { ...base, amount: '-1' },
      { ...base, amount: '1.5' },
      { ...base, recipient: '0xnot-an-address' },
      { ...base, token: { kind: 'community', address: TOKEN, symbol: '', decimals: 18 } },
      { ...base, token: { kind: 'community', address: TOKEN, symbol: 'X', decimals: 99 } },
    ]) {
      clearStoredTransfer(SCOPE);
      cache.set(SCOPE, TRANSFER_TASK_CACHE_KEY, broken);
      expect(readStoredTransfer(SCOPE)).toBeNull();
    }
  });

  it('clears the task when the transfer settles as reverted', () => {
    writeStoredTransfer(SCOPE, PENDING);
    clearStoredTransfer(SCOPE);
    expect(readStoredTransfer(SCOPE)).toBeNull();
  });
});

describe('storedTransferToRecord 回执/成功条口径', () => {
  it('carries the exact wei amount, symbol, decimals and native flag', () => {
    expect(storedTransferToRecord(PENDING)).toEqual({
      hash: HASH,
      tokenSymbol: 'TestLOVE20',
      tokenDecimals: 18,
      native: false,
      amount: 1500000000000000000n,
      recipient: RECIPIENT,
      recipientLabel: '身份 NFT #2 Testdev-member-1',
      recordedAt: 1_700_000_000_000,
    });
    expect(
      storedTransferToRecord({
        ...PENDING,
        token: { kind: 'native', address: undefined, symbol: 'ETH', decimals: 18 },
      }).native,
    ).toBe(true);
  });
});
