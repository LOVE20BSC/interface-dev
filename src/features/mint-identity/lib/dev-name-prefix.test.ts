import { describe, expect, it } from 'vitest';
import {
  applyDevNamePrefixIfNeeded,
  DEV_NAME_PREFIX_BYTES,
} from '@/features/mint-identity/lib/dev-name-prefix';
import { utf8ByteLength } from '@/domain/member-name';

describe('applyDevNamePrefixIfNeeded (CI-004 workaround)', () => {
  it('prefixes the name on a dev/test deployment whose symbol starts with Test', () => {
    expect(applyDevNamePrefixIfNeeded('abc', 'TestLOVE20')).toEqual({
      effectiveName: 'Testabc',
      isPrefixed: true,
    });
    expect(applyDevNamePrefixIfNeeded('dev-member-0', 'TestLOVE20')).toEqual({
      effectiveName: 'Testdev-member-0',
      isPrefixed: true,
    });
  });

  it('leaves the name alone when it already starts with Test (the contract does the same)', () => {
    expect(applyDevNamePrefixIfNeeded('Testabc', 'TestLOVE20')).toEqual({
      effectiveName: 'Testabc',
      isPrefixed: false,
    });
    // The prefix check is case-sensitive: lowercase "test" still gets prefixed.
    expect(applyDevNamePrefixIfNeeded('testabc', 'TestLOVE20')).toEqual({
      effectiveName: 'Testtestabc',
      isPrefixed: true,
    });
  });

  it('never prefixes on a production symbol', () => {
    expect(applyDevNamePrefixIfNeeded('abc', 'LOVE20')).toEqual({
      effectiveName: 'abc',
      isPrefixed: false,
    });
    expect(applyDevNamePrefixIfNeeded('abc', undefined)).toEqual({
      effectiveName: 'abc',
      isPrefixed: false,
    });
  });

  it('mirrors the contract for an empty name (mint("") becomes "Test")', () => {
    // The form rejects the empty name before any read, but the helper must not
    // invent a different rule than the chain.
    expect(applyDevNamePrefixIfNeeded('', 'TestLOVE20')).toEqual({
      effectiveName: 'Test',
      isPrefixed: true,
    });
  });

  it('adds exactly four bytes, so the effective limit shrinks by four', () => {
    const resolved = applyDevNamePrefixIfNeeded('身份', 'TestLOVE20');
    expect(utf8ByteLength(resolved.effectiveName) - utf8ByteLength('身份')).toBe(
      DEV_NAME_PREFIX_BYTES,
    );
  });
});
