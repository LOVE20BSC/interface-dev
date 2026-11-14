import { checkAddressInput } from '@/shared/lib/identity-input';

export type RecipientValidation = 'ok' | 'invalid' | 'zero' | 'self';

/**
 * 0x + 40 hex, non-zero, not the current wallet. No ENS support in M0.
 *
 * The parsing lives in `@/shared/lib/identity-input` so 代币转账 and 转让身份 NFT
 * share one implementation; this wrapper keeps the historical 转让 vocabulary
 * (an empty input is reported as 'invalid', the input's touched flag gates it).
 */
export function validateRecipient(value: string, self: string | undefined): RecipientValidation {
  const check = checkAddressInput(value, self);
  return check === 'empty' ? 'invalid' : check;
}
