import { describe, expect, it } from 'vitest';
import { ADDRESSES } from '@/config/networks';
import { checkTransferRecipient } from '@/features/transfer-token/lib/transfer-recipient';
import {
  isSameTransferToken,
  transferTokenKey,
} from '@/features/transfer-token/lib/transfer-types';

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ZERO = '0x0000000000000000000000000000000000000000';

describe('checkTransferRecipient', () => {
  it('accepts a valid non-self address', () => {
    expect(checkTransferRecipient(OTHER, SELF)).toBe('ok');
    expect(checkTransferRecipient(` ${OTHER} `, SELF)).toBe('ok');
    expect(checkTransferRecipient(OTHER.toUpperCase().replace('0X', '0x'), SELF)).toBe('ok');
  });

  it('distinguishes empty / malformed / zero / self', () => {
    expect(checkTransferRecipient('', SELF)).toBe('empty');
    expect(checkTransferRecipient('0x1234', SELF)).toBe('invalid');
    expect(checkTransferRecipient(ZERO, SELF)).toBe('zero');
    expect(checkTransferRecipient(SELF.toLowerCase(), SELF)).toBe('self');
  });
});

describe('transferTokenKey', () => {
  const native = { kind: 'native' as const, address: undefined, symbol: 'ETH', decimals: 18 };
  const token = {
    kind: 'custom' as const,
    address: ADDRESSES.tokenAddress,
    symbol: 'TestLOVE20',
    decimals: 18,
  };

  it('keys native by kind and tokens by address so one selection never matches another', () => {
    expect(transferTokenKey(native)).toBe('native');
    expect(transferTokenKey(token)).toBe(`custom:${ADDRESSES.tokenAddress.toLowerCase()}`);
    expect(isSameTransferToken(native, token)).toBe(false);
    expect(isSameTransferToken(token, { ...token, symbol: 'renamed' })).toBe(true);
  });
});
