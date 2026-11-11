import { describe, expect, it } from 'vitest';
import { copy } from '@/shared/config/copy-pages';
import { describeMintError } from '@/features/mint-identity/lib/mint-errors';

function revert(selector: string): unknown {
  return { data: `${selector}${'0'.repeat(64)}` };
}

describe('describeMintError', () => {
  it('maps a wallet rejection to "no charge" copy', () => {
    expect(describeMintError({ code: 4001 })).toBe(copy.mintIdentity.errors.rejected);
  });

  it('maps protocol name errors from the generated registry', () => {
    expect(describeMintError(revert('0x2350ee53'))).toBe(copy.mintIdentity.errors.nameTaken);
    expect(describeMintError(revert('0x243cf1c9'))).toBe(copy.mintIdentity.errors.nameTooLong);
    expect(describeMintError(revert('0x9954195a'))).toBe(copy.mintIdentity.errors.nameInvalid);
    expect(describeMintError(revert('0x1ff3ed9d'))).toBe(copy.mintIdentity.errors.nameEmpty);
  });

  it('maps the OpenZeppelin ERC20 errors the registry does not carry', () => {
    expect(describeMintError(revert('0xfb8f41b2'))).toBe(copy.mintIdentity.errors.allowanceShort);
    expect(describeMintError(revert('0xe450d38c'), { paymentSymbol: 'TestLOVE20' })).toBe(
      copy.mintIdentity.errors.balanceShort('TestLOVE20'),
    );
  });

  it('maps a stale wallet nonce to the actionable nonce copy, never to generic', () => {
    for (const message of [
      'nonce too low',
      'nonce has already been used',
      'Nonce too high. Expected nonce to be 3 but got 68.',
      'replacement transaction underpriced',
      'already known',
    ]) {
      const described = describeMintError({
        name: 'TransactionExecutionError',
        cause: { message },
      });
      expect(described).toBe(copy.txWatch.bodies.nonceGap);
      expect(described).not.toBe(copy.errors.generic);
    }
    const viemShape = Object.assign(new Error('nonce too low'), { name: 'NonceTooLowError' });
    expect(describeMintError(viemShape)).toBe(copy.txWatch.bodies.nonceGap);
  });

  it('maps a stale wallet block view to the reload copy, never to generic', () => {
    const described = describeMintError({
      name: 'TransactionExecutionError',
      cause: {
        message: 'Invalid params: BlockOutOfRangeError: block height is 970 but requested was 982',
      },
    });
    expect(described).toBe(copy.txWatch.staleBlock);
    expect(described).not.toBe(copy.errors.generic);
    expect(describeMintError({ name: 'BlockOutOfRangeError' })).toBe(copy.txWatch.staleBlock);
  });

  it('does not regress user rejection or insufficient funds', () => {
    expect(describeMintError({ code: 4001, message: 'user rejected' })).toBe(
      copy.mintIdentity.errors.rejected,
    );
    expect(describeMintError({ message: 'insufficient funds for gas' })).toBe(
      copy.errors.insufficientFunds,
    );
  });

  it('falls back to the registry / shared copy without leaking revert data', () => {
    const message = describeMintError(revert('0xffffffff'));
    expect(message).toBe(copy.errors.contractGeneric);
    expect(message).not.toContain('0x');
    expect(describeMintError(new Error('boom'))).toBe(copy.errors.generic);
  });
});
