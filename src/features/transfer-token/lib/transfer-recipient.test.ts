import { describe, expect, it } from 'vitest';
import { ADDRESSES } from '@/config/networks';
import {
  checkTransferRecipient,
  decideRecipientProtection,
  knownContractLabel,
  knownContractLabelKey,
} from '@/features/transfer-token/lib/transfer-recipient';
import {
  isSameTransferToken,
  transferTokenKey,
} from '@/features/transfer-token/lib/transfer-types';

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ZERO = '0x0000000000000000000000000000000000000000';
const PAIR = ADDRESSES.pair;

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

describe('knownContractLabelKey', () => {
  it('recognises address-book protocol contracts case-insensitively', () => {
    expect(knownContractLabelKey(ADDRESSES.pair)).toBe('pair');
    expect(knownContractLabelKey(ADDRESSES.pair.toUpperCase().replace('0X', '0x'))).toBe('pair');
    expect(knownContractLabelKey(ADDRESSES.router)).toBe('router');
    expect(knownContractLabelKey(ADDRESSES.stake)).toBe('stake');
    expect(knownContractLabelKey(ADDRESSES.airdropDistributor)).toBe('airdropDistributor');
  });

  it('does not flag a plain wallet or an ERC20 token address', () => {
    expect(knownContractLabelKey(OTHER)).toBeUndefined();
    // The community token itself is not a "protocol contract" recipient warning.
    expect(knownContractLabelKey(ADDRESSES.tokenAddress)).toBeUndefined();
    expect(knownContractLabelKey(ADDRESSES.firstTokenAddress)).toBeUndefined();
  });

  it('renders the same label the 关于 page uses', () => {
    expect(knownContractLabel('pair')).toBe('交易对');
    expect(knownContractLabel('router')).toBe('兑换路由');
  });
});

describe('decideRecipientProtection', () => {
  it('flags a known address-book contract even before bytecode settles', () => {
    expect(decideRecipientProtection(PAIR, undefined)).toEqual({
      kind: 'known',
      address: PAIR,
      labelKey: 'pair',
    });
    expect(decideRecipientProtection(PAIR, false)).toEqual({
      kind: 'known',
      address: PAIR,
      labelKey: 'pair',
    });
  });

  it('warns about an unknown address that has bytecode', () => {
    expect(decideRecipientProtection(OTHER, true)).toEqual({ kind: 'contract', address: OTHER });
  });

  it('stays silent for a plain wallet and for an unsettled/absent bytecode read', () => {
    expect(decideRecipientProtection(OTHER, false)).toEqual({ kind: 'plain' });
    expect(decideRecipientProtection(OTHER, undefined)).toEqual({ kind: 'plain' });
    expect(decideRecipientProtection('', true)).toEqual({ kind: 'plain' });
    expect(decideRecipientProtection('0x1234', true)).toEqual({ kind: 'plain' });
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
