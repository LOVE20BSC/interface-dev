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

  it('falls back to the registry / shared copy without leaking revert data', () => {
    const message = describeMintError(revert('0xffffffff'));
    expect(message).toBe(copy.errors.contractGeneric);
    expect(message).not.toContain('0x');
    expect(describeMintError(new Error('boom'))).toBe(copy.errors.generic);
  });
});
