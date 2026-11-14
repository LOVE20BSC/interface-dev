import { describe, expect, it } from 'vitest';
import {
  checkAddressInput,
  identityInputErrorMessage,
  identityInputInputMode,
  identityInputPlaceholder,
  identityInputReadingText,
  isIdentityInputMode,
  parseMemberIdInput,
} from '@/shared/lib/identity-input';

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ZERO = '0x0000000000000000000000000000000000000000';

describe('checkAddressInput 按地址校验', () => {
  it('separates empty / invalid / zero / self / ok', () => {
    expect(checkAddressInput('', SELF)).toBe('empty');
    expect(checkAddressInput('   ', SELF)).toBe('empty');
    expect(checkAddressInput('0x1234', SELF)).toBe('invalid');
    expect(checkAddressInput('not-an-address', SELF)).toBe('invalid');
    expect(checkAddressInput(ZERO, SELF)).toBe('zero');
    expect(checkAddressInput(SELF, SELF)).toBe('self');
    expect(checkAddressInput(SELF.toLowerCase(), SELF)).toBe('self');
    expect(checkAddressInput(OTHER, SELF)).toBe('ok');
    expect(checkAddressInput(`  ${OTHER}  `, SELF)).toBe('ok');
  });
});

describe('parseMemberIdInput 按身份 NFT ID 校验', () => {
  it('accepts digits with or without # and nothing else', () => {
    expect(parseMemberIdInput('12')).toBe(12n);
    expect(parseMemberIdInput('#12')).toBe(12n);
    expect(parseMemberIdInput('  #2  ')).toBe(2n);
    expect(parseMemberIdInput('0')).toBe(0n);
  });

  it('rejects names, decimals, signs and anything that is not a uint256', () => {
    expect(parseMemberIdInput('Testdev-member-1')).toBeNull();
    expect(parseMemberIdInput('12abc')).toBeNull();
    expect(parseMemberIdInput('1.5')).toBeNull();
    expect(parseMemberIdInput('-1')).toBeNull();
    expect(parseMemberIdInput('')).toBeNull();
    expect(parseMemberIdInput((1n << 256n).toString())).toBeNull();
  });
});

describe('mode metadata', () => {
  it('derives placeholder / keyboard / reading line from the explicit mode', () => {
    expect(isIdentityInputMode('address')).toBe(false);
    expect(isIdentityInputMode('member')).toBe(true);
    expect(isIdentityInputMode('name')).toBe(true);
    expect(identityInputInputMode('member')).toBe('numeric');
    expect(identityInputInputMode('name')).toBe('text');
    expect(identityInputPlaceholder('address')).toContain('0x');
    expect(identityInputPlaceholder('member')).toContain('编号');
    expect(identityInputPlaceholder('name')).toBe('身份 NFT 名字');
    expect(identityInputReadingText('member')).toContain('读取');
    expect(identityInputReadingText('name')).toContain('名称');
  });
});

describe('identityInputErrorMessage 统一错误文案', () => {
  it('is mode-aware for not-found and silent for idle/reading/ok', () => {
    expect(identityInputErrorMessage('member', 'not-found')).toContain('不存在');
    expect(identityInputErrorMessage('name', 'not-found')).toContain('名称');
    expect(identityInputErrorMessage('member', 'invalid')).toContain('#12');
    expect(identityInputErrorMessage('name', 'self')).toContain('自己');
    expect(identityInputErrorMessage('member', 'error')).toContain('暂时');
    expect(identityInputErrorMessage('member', 'idle')).toBeNull();
    expect(identityInputErrorMessage('member', 'reading')).toBeNull();
    expect(identityInputErrorMessage('member', 'ok')).toBeNull();
  });
});
