import { describe, expect, it } from 'vitest';
import { copy } from '@/shared/config/copy-pages';
import { describeAirdropClaimError } from '@/features/claim-airdrop/lib/airdrop-errors';

describe('describeAirdropClaimError', () => {
  it('maps a stale wallet nonce to the actionable nonce copy, never to generic', () => {
    for (const message of [
      'nonce too low',
      'nonce has already been used',
      'nonce too high',
      'replacement transaction underpriced',
      'already known',
    ]) {
      const described = describeAirdropClaimError({
        name: 'TransactionExecutionError',
        cause: { message },
      });
      expect(described).toBe(copy.txWatch.bodies.nonceGap);
      expect(described).not.toBe(copy.airdrop.errors.generic);
    }
  });

  it('maps a stale wallet block view to the reload copy, never to generic', () => {
    const described = describeAirdropClaimError({
      name: 'TransactionExecutionError',
      cause: { message: 'header not found' },
    });
    expect(described).toBe(copy.txWatch.staleBlock);
    expect(described).not.toBe(copy.airdrop.errors.generic);
  });

  it('keeps the existing claim mappings intact', () => {
    expect(describeAirdropClaimError({ code: 4001 })).toBe(copy.airdrop.errors.rejected);
    expect(describeAirdropClaimError({ data: `0x3349f079${'0'.repeat(64)}` })).toBe(
      copy.airdrop.errors.alreadyClaimed,
    );
    expect(describeAirdropClaimError({ data: `0xff978a22${'0'.repeat(64)}` })).toBe(
      copy.airdrop.errors.roundNotReached,
    );
  });
});
