import { beforeEach, describe, expect, it } from 'vitest';
import { cache, type CacheScope } from './cache';
import {
  clearWriteRecord,
  readWriteRecord,
  writeWriteRecord,
  type WriteRecordAdapter,
} from './write-record';

const WALLET = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' as const;
const SCOPE: CacheScope = {
  chainId: 31337,
  contractAddress: '0x0000000000000000000000000000000000000000',
  wallet: WALLET,
};
const OTHER: CacheScope = { ...SCOPE, wallet: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' };
const HASH = `0x${'ab'.repeat(32)}` as const;

const adapter: WriteRecordAdapter<{ value: bigint; label: string }> = {
  key: 'writeRecordTest',
  encodePayload: (payload) => ({
    value: { __bigint: payload.value.toString() },
    label: payload.label,
  }),
  decodePayload: (raw) => {
    if (typeof raw !== 'object' || raw === null) return null;
    const value = (raw as { value?: unknown }).value as { __bigint?: unknown } | undefined;
    const label = (raw as { label?: unknown }).label;
    if (typeof value?.__bigint !== 'string' || typeof label !== 'string') return null;
    try {
      return { value: BigInt(value.__bigint), label };
    } catch {
      return null;
    }
  },
};

beforeEach(() => cache.clearAll());

describe('write-record', () => {
  it('round-trips the generic envelope and bigint payload', () => {
    writeWriteRecord(adapter, SCOPE, {
      hash: HASH,
      chainId: 31337,
      account: WALLET,
      nonce: 7,
      recordedAt: 1_700_000_000_000,
      payload: { value: 1_000n, label: 'stake' },
    });
    expect(readWriteRecord(adapter, SCOPE)).toEqual({
      hash: HASH,
      chainId: 31337,
      account: WALLET,
      nonce: 7,
      recordedAt: 1_700_000_000_000,
      payload: { value: 1_000n, label: 'stake' },
    });
    expect(readWriteRecord(adapter, OTHER)).toBeNull();
  });

  it('rejects missing or invalid hash and missing envelope fields', () => {
    cache.set(SCOPE, adapter.key, {
      chainId: 31337,
      account: WALLET,
      recordedAt: 1,
      payload: { value: { __bigint: '1' }, label: 'x' },
    });
    expect(readWriteRecord(adapter, SCOPE)).toBeNull();

    cache.set(SCOPE, adapter.key, {
      hash: '0x1234',
      chainId: 31337,
      account: WALLET,
      recordedAt: 1,
      payload: { value: { __bigint: '1' }, label: 'x' },
    });
    expect(readWriteRecord(adapter, SCOPE)).toBeNull();

    cache.set(SCOPE, adapter.key, {
      hash: HASH,
      chainId: 0,
      account: WALLET,
      recordedAt: 1,
      payload: { value: { __bigint: '1' }, label: 'x' },
    });
    expect(readWriteRecord(adapter, SCOPE)).toBeNull();
  });

  it('rejects a payload codec failure instead of returning a partial record', () => {
    cache.set(SCOPE, adapter.key, {
      hash: HASH,
      chainId: 31337,
      account: WALLET,
      recordedAt: 1,
      payload: { value: { __bigint: 'nope' }, label: 'x' },
    });
    expect(readWriteRecord(adapter, SCOPE)).toBeNull();
  });

  it('clear removes only this adapter key', () => {
    writeWriteRecord(adapter, SCOPE, {
      hash: HASH,
      chainId: 31337,
      account: WALLET,
      nonce: undefined,
      recordedAt: 1,
      payload: { value: 1n, label: 'x' },
    });
    clearWriteRecord(adapter, SCOPE);
    expect(readWriteRecord(adapter, SCOPE)).toBeNull();
  });
});
