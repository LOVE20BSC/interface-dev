import { isSameAddress } from '@/shared/lib/format';

export type RecipientValidation = 'ok' | 'invalid' | 'zero' | 'self';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO = '0x0000000000000000000000000000000000000000';

/** 0x + 40 hex, non-zero, not the current wallet. No ENS support in M0. */
export function validateRecipient(value: string, self: string | undefined): RecipientValidation {
  const trimmed = value.trim();
  if (!ADDRESS_RE.test(trimmed)) return 'invalid';
  if (trimmed.toLowerCase() === ZERO) return 'zero';
  if (self !== undefined && isSameAddress(trimmed, self)) return 'self';
  return 'ok';
}
