import { describe, expect, it } from 'vitest';
import { copy } from '@/shared/config/copy';
import { toWalletErrorMessage } from '@/features/connect-wallet/lib/wallet-errors';

describe('toWalletErrorMessage', () => {
  it('maps user rejection', () => {
    expect(toWalletErrorMessage({ code: 4001, message: 'User rejected the request.' })).toBe(
      copy.errors.rejected,
    );
  });

  it('maps an unknown chain and pending request', () => {
    expect(toWalletErrorMessage({ code: 4902 })).toBe(copy.errors.unknownChain);
    expect(toWalletErrorMessage({ code: -32002 })).toBe(copy.errors.requestPending);
    expect(toWalletErrorMessage({ code: 4100 })).toBe(copy.errors.noAccess);
  });

  it('maps nested provider errors without leaking internals', () => {
    const message = toWalletErrorMessage({ cause: { message: 'insufficient funds for transfer' } });
    expect(message).toBe(copy.errors.insufficientFunds);
    expect(message).not.toContain('insufficient');
  });

  it('falls back to a neutral sentence', () => {
    expect(toWalletErrorMessage(new Error('TypeError: x is not a function'))).toBe(
      copy.errors.generic,
    );
  });
});
