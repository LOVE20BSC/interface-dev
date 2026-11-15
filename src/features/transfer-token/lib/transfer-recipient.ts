import { checkAddressInput } from '@/shared/lib/identity-input';

/**
 * Recipient validity for 代币转账 (pure, no React, no chain).
 *
 * This module only answers "is the typed value a usable address?" (format / zero
 * / self). What that address *means* (address-book contract vs arbitrary contract
 * vs plain wallet) lives in `shared/lib/recipient-protection.ts` so the identity
 * transfer drawer and the batch page share the same decision.
 */
export type TransferRecipientCheck = 'empty' | 'ok' | 'invalid' | 'zero' | 'self';

export function checkTransferRecipient(
  value: string,
  self: string | undefined,
): TransferRecipientCheck {
  return checkAddressInput(value, self);
}
