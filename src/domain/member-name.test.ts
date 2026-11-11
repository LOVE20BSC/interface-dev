import { describe, expect, it } from 'vitest';
import { isMemberNameCharacterValid, isTestPrefixedName, utf8ByteLength } from './member-name';

describe('isTestPrefixedName', () => {
  it('accepts the exact, case-sensitive Test prefix', () => {
    expect(isTestPrefixedName('Test')).toBe(true);
    expect(isTestPrefixedName('Testdev-member-0')).toBe(true);
    expect(isTestPrefixedName('Teste2e-member')).toBe(true);
  });

  it('rejects names that do not start with a capital Test', () => {
    expect(isTestPrefixedName('testdev-member-0')).toBe(false);
    expect(isTestPrefixedName('TEST-member')).toBe(false);
    expect(isTestPrefixedName('dev-member-0')).toBe(false);
    expect(isTestPrefixedName('Tes')).toBe(false);
    expect(isTestPrefixedName('')).toBe(false);
  });
});

describe('utf8ByteLength', () => {
  it('counts ASCII as one byte and Chinese as three', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('身份')).toBe(6);
    expect(utf8ByteLength('a身')).toBe(4);
    expect(utf8ByteLength('')).toBe(0);
  });

  it('counts emoji as four bytes (the contract accepts them, only length matters)', () => {
    expect(utf8ByteLength('😀')).toBe(4);
  });
});

describe('isMemberNameCharacterValid', () => {
  it('accepts letters, digits, punctuation and non-ASCII text', () => {
    expect(isMemberNameCharacterValid('abc-123_xyz')).toBe(true);
    expect(isMemberNameCharacterValid('身份')).toBe(true);
    expect(isMemberNameCharacterValid('dev-member-0')).toBe(true);
    expect(isMemberNameCharacterValid('😀')).toBe(true);
  });

  it('rejects ASCII whitespace and control characters', () => {
    expect(isMemberNameCharacterValid('a b')).toBe(false);
    expect(isMemberNameCharacterValid('a\tb')).toBe(false);
    expect(isMemberNameCharacterValid('a\nb')).toBe(false);
    expect(isMemberNameCharacterValid('a\u007Fb')).toBe(false);
  });

  it('rejects zero-width, bidi and Unicode space code points the contract blocks', () => {
    expect(isMemberNameCharacterValid('a\u200Bb')).toBe(false);
    expect(isMemberNameCharacterValid('a\u00A0b')).toBe(false);
    expect(isMemberNameCharacterValid('\u3000')).toBe(false);
    expect(isMemberNameCharacterValid('a\uFEFFb')).toBe(false);
  });
});
