import { describe, expect, it } from 'vitest';
import { copy } from '@/shared/config/copy-pages';
import { describeSwapError } from '@/features/swap-token/lib/swap-errors';

const CONTEXT = { nativeSymbol: 'ETH', fromSymbol: 'TestLOVE20' };

describe('describeSwapError', () => {
  it('maps a stale wallet nonce to the actionable nonce copy, never to generic', () => {
    for (const message of [
      'nonce too low',
      'nonce has already been used',
      'nonce too high',
      'replacement transaction underpriced',
      'known transaction',
    ]) {
      const described = describeSwapError(
        { name: 'TransactionExecutionError', cause: { message } },
        CONTEXT,
      );
      expect(described).toBe(copy.txWatch.bodies.nonceGap);
      expect(described).not.toBe(copy.errors.generic);
    }
  });

  it('maps a stale wallet block view to the reload copy, never to generic', () => {
    const described = describeSwapError(
      { name: 'BlockOutOfRangeError', message: 'block height is 970 but requested was 982' },
      CONTEXT,
    );
    expect(described).toBe(copy.txWatch.staleBlock);
    expect(described).not.toBe(copy.errors.generic);
  });

  it('keeps the existing swap mappings intact', () => {
    expect(describeSwapError({ code: 4001 }, CONTEXT)).toBe(copy.swap.errors.rejected);
    expect(describeSwapError({ message: 'insufficient funds' }, CONTEXT)).toBe(
      copy.swap.errors.insufficientFunds('ETH'),
    );
    expect(describeSwapError({ message: 'Too little received' }, CONTEXT)).toBe(
      copy.swap.errors.priceMoved,
    );
  });
});
