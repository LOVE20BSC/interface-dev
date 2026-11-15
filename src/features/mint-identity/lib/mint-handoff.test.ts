import { describe, expect, it } from 'vitest';
import { mintHandoffState } from '@/features/mint-identity/lib/mint-handoff';
import type { MintedIdentity } from '@/features/mint-identity/model/use-mint-transaction';

const RECEIPT: MintedIdentity = {
  memberId: 7n,
  name: 'Testdev-member-7',
  cost: 10n,
  hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

describe('mintHandoffState', () => {
  it('carries the minted identity to /my-nft as clone-safe strings', () => {
    expect(mintHandoffState(RECEIPT)).toEqual({
      mintedMemberId: '7',
      mintedName: 'Testdev-member-7',
    });
  });

  it('keeps a large member id exact (no Number coercion)', () => {
    expect(mintHandoffState({ ...RECEIPT, memberId: 9007199254740993n }).mintedMemberId).toBe(
      '9007199254740993',
    );
  });
});
