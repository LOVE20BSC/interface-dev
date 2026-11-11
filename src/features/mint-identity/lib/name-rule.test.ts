import { describe, expect, it } from 'vitest';
import { localNameStatus, requiresTestNamePrefix } from './name-rule';

const READY = { maxNameLength: 32, isConfigReady: true } as const;

describe('requiresTestNamePrefix', () => {
  it('is on for the dev and test variants and off for prod', () => {
    expect(requiresTestNamePrefix('dev')).toBe(true);
    expect(requiresTestNamePrefix('test')).toBe(true);
    expect(requiresTestNamePrefix('prod')).toBe(false);
  });
});

describe('localNameStatus', () => {
  it('treats an empty input as empty, not as a prefix error', () => {
    expect(localNameStatus({ name: '', variant: 'dev', ...READY })).toBe('empty');
    expect(localNameStatus({ name: '', variant: 'prod', ...READY })).toBe('empty');
  });

  it('waits for MAX_NAME_LENGTH before judging the name', () => {
    expect(
      localNameStatus({
        name: 'not-test',
        variant: 'dev',
        maxNameLength: undefined,
        isConfigReady: true,
      }),
    ).toBe('waiting');
    expect(
      localNameStatus({
        name: 'Testname',
        variant: 'dev',
        maxNameLength: 32,
        isConfigReady: false,
      }),
    ).toBe('waiting');
  });

  it('requires a case-sensitive Test prefix on dev and test', () => {
    expect(localNameStatus({ name: 'member-0', variant: 'dev', ...READY })).toBe('prefix-required');
    expect(localNameStatus({ name: 'member-0', variant: 'test', ...READY })).toBe(
      'prefix-required',
    );
    // Lowercase `test` may not stand in for the prefix.
    expect(localNameStatus({ name: 'testmember-0', variant: 'dev', ...READY })).toBe(
      'prefix-required',
    );
    expect(localNameStatus({ name: 'Testmember-0', variant: 'dev', ...READY })).toBe('ok');
  });

  it('has no prefix rule on prod', () => {
    expect(localNameStatus({ name: 'member-0', variant: 'prod', ...READY })).toBe('ok');
    expect(localNameStatus({ name: 'testmember-0', variant: 'prod', ...READY })).toBe('ok');
  });

  it('uses the full MAX_NAME_LENGTH with no -4 prefix adjustment', () => {
    const thirtyTwoBytes = 'Test'.padEnd(32, 'a');
    expect(thirtyTwoBytes.length).toBe(32);
    expect(localNameStatus({ name: thirtyTwoBytes, variant: 'dev', ...READY })).toBe('ok');
    expect(localNameStatus({ name: `${thirtyTwoBytes}a`, variant: 'dev', ...READY })).toBe(
      'too-long',
    );
    // 29-32 byte names are the contract's business now; the UI must not block them.
    expect(localNameStatus({ name: 'Test'.padEnd(29, 'a'), variant: 'dev', ...READY })).toBe('ok');
  });

  it('keeps the character check after the prefix rule', () => {
    expect(localNameStatus({ name: 'Test a', variant: 'dev', ...READY })).toBe('invalid');
    expect(localNameStatus({ name: 'Test\u200Bname', variant: 'dev', ...READY })).toBe('invalid');
    expect(localNameStatus({ name: 'not test name', variant: 'dev', ...READY })).toBe(
      'prefix-required',
    );
  });

  it('counts Chinese characters as three UTF-8 bytes', () => {
    const nineChinese = '身'.repeat(9); // 27 bytes; with Test the name is 31 bytes
    expect(localNameStatus({ name: `Test${nineChinese}`, variant: 'dev', ...READY })).toBe('ok');
    expect(localNameStatus({ name: `Test${nineChinese}身`, variant: 'dev', ...READY })).toBe(
      'too-long',
    );
  });
});
