import { describe, expect, it } from 'vitest';
import { CONTRACT_ERROR_CATALOG, CONTRACT_ERROR_MESSAGES } from '@/config/errors.generated';
import {
  extractRevertData,
  getContractErrorMessage,
  getErrorRegistrySource,
  isUserRejection,
  toUserMessage,
} from '@/shared/lib/errors';
import { copy } from '@/shared/config/copy';

const BANNED_IN_MESSAGE = [
  /\bgas\b/i,
  /\ballowance\b/i,
  /\bnonce\b/i,
  /\brevert\b/i,
  /0x[0-9a-f]/i,
];

describe('generated registry', () => {
  it('contains a selector map and a catalog', () => {
    expect(CONTRACT_ERROR_CATALOG.length).toBeGreaterThan(100);
    expect(Object.keys(CONTRACT_ERROR_MESSAGES).length).toBe(CONTRACT_ERROR_CATALOG.length);
    expect(getErrorRegistrySource()).toContain('registry@sha256:');
  });

  it('has unique selectors', () => {
    const selectors = CONTRACT_ERROR_CATALOG.map((entry) => entry.selector);
    expect(new Set(selectors).size).toBe(selectors.length);
  });

  it('maps every selector to a Chinese sentence with no developer jargon', () => {
    for (const entry of CONTRACT_ERROR_CATALOG) {
      expect(entry.message, entry.signature).toMatch(/[\u4e00-\u9fff]/);
      for (const pattern of BANNED_IN_MESSAGE) {
        expect(entry.message, `${entry.signature}: ${entry.message}`).not.toMatch(pattern);
      }
      expect(entry.message).not.toContain('undefined');
      expect(entry.message).not.toContain('null');
    }
  });
});

describe('toUserMessage', () => {
  it('uses the selector map for known custom errors', () => {
    const roundNotStarted = CONTRACT_ERROR_CATALOG.find(
      (entry) => entry.name === 'RoundNotStarted',
    );
    expect(roundNotStarted).toBeDefined();
    if (roundNotStarted === undefined) return;
    expect(toUserMessage({ data: `${roundNotStarted.selector}${'00'.repeat(64)}` })).toBe(
      roundNotStarted.message,
    );
  });

  it('walks nested viem-style causes for revert data', () => {
    const selector = '0xea74f32b';
    const nested = { cause: { cause: { data: `${selector}${'00'.repeat(32)}` } } };
    expect(extractRevertData(nested)).toBe(`${selector}${'00'.repeat(32)}`);
    expect(toUserMessage(nested)).toBe('这一轮还没有开始，请稍后再来。');
  });

  it('never surfaces raw revert data or unknown selectors', () => {
    const unknown = toUserMessage({ data: `0xdeadbeef${'11'.repeat(32)}` });
    expect(unknown).toBe(copy.errors.contractGeneric);
    expect(unknown).not.toContain('0x');
    expect(unknown).not.toContain('deadbeef');
  });

  it('maps Error(string) and Panic to neutral sentences', () => {
    expect(toUserMessage({ data: `0x08c379a0${'00'.repeat(32)}` })).toBe(
      copy.errors.contractGeneric,
    );
    expect(toUserMessage({ data: `0x4e487b71${'00'.repeat(32)}` })).toBe(copy.errors.contractPanic);
  });

  it('detects user rejection before any revert parsing', () => {
    const error = { code: 4001, message: 'User rejected the request.' };
    expect(isUserRejection(error)).toBe(true);
    expect(toUserMessage(error)).toBe(copy.errors.rejected);
  });

  it('handles network failures and unknown errors without leaking internals', () => {
    expect(toUserMessage(new Error('Failed to fetch'))).toBe(copy.errors.network);
    const fallback = toUserMessage(new Error('TypeError: x is not a function'));
    expect(fallback).toBe(copy.errors.generic);
    expect(fallback).not.toContain('TypeError');
  });

  it('looks up selectors case-insensitively and returns null for unknown ones', () => {
    expect(getContractErrorMessage('0xEA74F32B')).toBe('这一轮还没有开始，请稍后再来。');
    expect(getContractErrorMessage('0x00000000')).toBeNull();
  });
});
