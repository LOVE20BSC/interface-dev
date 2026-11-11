import { describe, expect, it } from 'vitest';
import { validateRecipient } from '@/features/transfer-identity/lib/validate-recipient';

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('validateRecipient (按地址)', () => {
  it('accepts a 0x + 40 hex address that is not the current wallet', () => {
    expect(validateRecipient(OTHER, SELF)).toBe('ok');
    expect(validateRecipient(OTHER.toUpperCase().replace('0X', '0x'), SELF)).toBe('ok');
  });

  it('rejects malformed addresses', () => {
    expect(validateRecipient('', SELF)).toBe('invalid');
    expect(validateRecipient('0x1234', SELF)).toBe('invalid');
    expect(validateRecipient(` ${OTHER} `, SELF)).toBe('ok');
    expect(validateRecipient(OTHER.slice(0, -1), SELF)).toBe('invalid');
  });

  it('rejects the zero address and the current wallet', () => {
    expect(validateRecipient('0x0000000000000000000000000000000000000000', SELF)).toBe('zero');
    expect(validateRecipient(SELF, SELF)).toBe('self');
    expect(validateRecipient(SELF.toLowerCase(), SELF)).toBe('self');
  });
});
