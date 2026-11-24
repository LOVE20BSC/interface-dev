import { beforeEach, describe, expect, it } from 'vitest';
import { cache } from '@/shared/lib/cache';
import {
  AIRDROP_CLAIM_CACHE_KEY,
  clearAirdropClaimRecord,
  createAirdropClaimScope,
  readAirdropClaimRecord,
  writeAirdropClaimPending,
  writeAirdropClaimReceipt,
} from './airdrop-claim-record';

const HASH = `0x${'ab'.repeat(32)}` as const;
const OTHER = '0x00000000000000000000000000000000000000cc';
const scope = createAirdropClaimScope(
  31337,
  '0x00000000000000000000000000000000000000aa',
  '0x00000000000000000000000000000000000000bb',
);

beforeEach(() => {
  cache.clearAll();
});

describe('airdrop claim record', () => {
  it('persists the pending hash without inventing an amount', () => {
    writeAirdropClaimPending(scope, HASH);

    const stored = readAirdropClaimRecord(scope);
    expect(stored).not.toBeNull();
    expect(stored?.hash).toBe(HASH);
    expect(stored?.amount).toBeUndefined();
    expect(typeof stored?.recordedAt).toBe('number');
  });

  it('writes the generic envelope, with the feature payload under `payload`', () => {
    writeAirdropClaimReceipt(scope, {
      hash: HASH,
      amount: 123n,
      share: 456n,
      totalShare: 789n,
      remainingShare: 42n,
      tokenSymbol: 'TestLOVE20',
      tokenDecimals: 18,
      recordedAt: 1_700_000_000_000,
    });

    const raw = cache.get<Record<string, unknown>>(scope, AIRDROP_CLAIM_CACHE_KEY);
    expect(raw).not.toBeNull();
    expect(raw?.hash).toBe(HASH);
    expect(raw?.chainId).toBe(31337);
    expect(raw?.account).toBe(scope.wallet);
    expect(raw?.recordedAt).toBe(1_700_000_000_000);
    expect(raw?.amount).toBeUndefined();
    const payload = raw?.payload as Record<string, unknown>;
    expect(payload.amount).toBe('123');
    expect(payload.tokenSymbol).toBe('TestLOVE20');
    expect(raw?.payload).not.toHaveProperty('hash');
  });

  it('round-trips the confirmed receipt as decimal strings', () => {
    writeAirdropClaimReceipt(scope, {
      hash: HASH,
      amount: 123n,
      share: 456n,
      totalShare: 789n,
      remainingShare: 42n,
      tokenSymbol: 'TestLOVE20',
      tokenDecimals: 18,
      recordedAt: 1_700_000_000_000,
    });

    const stored = readAirdropClaimRecord(scope);
    expect(stored).toMatchObject({
      hash: HASH,
      amount: 123n,
      share: 456n,
      totalShare: 789n,
      remainingShare: 42n,
      tokenSymbol: 'TestLOVE20',
      tokenDecimals: 18,
      recordedAt: 1_700_000_000_000,
    });
  });

  it('self-heals a record with a malformed hash', () => {
    cache.set(scope, AIRDROP_CLAIM_CACHE_KEY, {
      hash: '0x1234',
      chainId: 31337,
      account: scope.wallet,
      recordedAt: 1,
      payload: { amount: '5' },
    });
    expect(readAirdropClaimRecord(scope)).toBeNull();
  });

  it('rejects a hash-less, payload-less or wrong-scope record', () => {
    const base = { chainId: 31337, account: scope.wallet, recordedAt: 1, payload: {} };
    for (const broken of [
      { ...base },
      { ...base, hash: null },
      { ...base, hash: HASH, payload: undefined },
      { ...base, hash: HASH, chainId: undefined },
      { ...base, hash: HASH, account: undefined },
    ]) {
      cache.set(scope, AIRDROP_CLAIM_CACHE_KEY, broken);
      expect(readAirdropClaimRecord(scope)).toBeNull();
    }

    writeAirdropClaimPending(scope, HASH);
    expect(
      readAirdropClaimRecord(createAirdropClaimScope(31337, scope.contractAddress, OTHER)),
    ).toBeNull();
    expect(
      readAirdropClaimRecord(createAirdropClaimScope(56, scope.contractAddress, scope.wallet)),
    ).toBeNull();
  });

  it('removes the record on demand', () => {
    writeAirdropClaimReceipt(scope, {
      hash: HASH,
      amount: 1n,
      share: undefined,
      totalShare: undefined,
      remainingShare: undefined,
      tokenSymbol: undefined,
      tokenDecimals: undefined,
      recordedAt: undefined,
    });
    expect(readAirdropClaimRecord(scope)).not.toBeNull();

    clearAirdropClaimRecord(scope);
    expect(readAirdropClaimRecord(scope)).toBeNull();
  });
});
