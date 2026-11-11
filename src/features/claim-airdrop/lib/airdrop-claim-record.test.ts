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
    cache.set(scope, AIRDROP_CLAIM_CACHE_KEY, { hash: '0x1234', amount: '5' });
    expect(readAirdropClaimRecord(scope)).toBeNull();
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
