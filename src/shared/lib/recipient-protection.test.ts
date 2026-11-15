import { describe, expect, it } from 'vitest';
import { ADDRESSES } from '@/config/networks';
import {
  decideRecipientProtection,
  knownContractLabel,
  knownContractLabelKey,
  knownContractLabelOf,
} from '@/shared/lib/recipient-protection';

const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const PAIR = ADDRESSES.pair;

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

  it('exposes the label directly for batch rows', () => {
    expect(knownContractLabelOf(ADDRESSES.pair)).toBe('交易对');
    expect(knownContractLabelOf(ADDRESSES.pair.toUpperCase().replace('0X', '0x'))).toBe('交易对');
    expect(knownContractLabelOf(OTHER)).toBeUndefined();
    expect(knownContractLabelOf(ADDRESSES.tokenAddress)).toBeUndefined();
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

  it('skips the address book entirely when 智能资产保护 is off (detectKnown: false)', () => {
    // A known address-book contract is no longer named or intercepted: it falls
    // through to the generic bytecode warning like any other contract…
    expect(decideRecipientProtection(PAIR, true, { detectKnown: false })).toEqual({
      kind: 'contract',
      address: PAIR,
    });
    // …and stays silent until the bytecode read settles, exactly like a wallet.
    expect(decideRecipientProtection(PAIR, undefined, { detectKnown: false })).toEqual({
      kind: 'plain',
    });
    expect(decideRecipientProtection(PAIR, false, { detectKnown: false })).toEqual({
      kind: 'plain',
    });
    // The other checks are unaffected by the switch.
    expect(decideRecipientProtection(OTHER, true, { detectKnown: false })).toEqual({
      kind: 'contract',
      address: OTHER,
    });
    expect(decideRecipientProtection(OTHER, false, { detectKnown: false })).toEqual({
      kind: 'plain',
    });
    expect(decideRecipientProtection('', true, { detectKnown: false })).toEqual({ kind: 'plain' });
  });

  it('stays silent for a plain wallet and for an unsettled/absent bytecode read', () => {
    expect(decideRecipientProtection(OTHER, false)).toEqual({ kind: 'plain' });
    expect(decideRecipientProtection(OTHER, undefined)).toEqual({ kind: 'plain' });
    expect(decideRecipientProtection('', true)).toEqual({ kind: 'plain' });
    expect(decideRecipientProtection('0x1234', true)).toEqual({ kind: 'plain' });
  });
});
