import { describe, expect, it } from 'vitest';
import {
  allowanceReadState,
  balanceLineState,
  balanceReadBlocksSubmit,
} from './batch-read-state';

describe('allowanceReadState (D2)', () => {
  it('never reports ready/need while the allowance is unread', () => {
    for (const total of [0n, 1n, 2000000000000000000n]) {
      expect(
        allowanceReadState({
          mode: 'token',
          total,
          allowance: undefined,
          isLoading: false,
        }),
      ).toBe('unknown');
    }
  });

  it('separates loading from unknown', () => {
    expect(
      allowanceReadState({
        mode: 'token',
        total: 10n,
        allowance: undefined,
        isLoading: true,
      }),
    ).toBe('loading');
  });

  it('only says need / ready from a real value', () => {
    expect(
      allowanceReadState({ mode: 'token', total: 10n, allowance: 0n, isLoading: false }),
    ).toBe('need');
    expect(
      allowanceReadState({ mode: 'token', total: 10n, allowance: 10n, isLoading: false }),
    ).toBe('ready');
    expect(
      allowanceReadState({ mode: 'token', total: 10n, allowance: 11n, isLoading: false }),
    ).toBe('ready');
  });

  it('is not part of the native path', () => {
    expect(
      allowanceReadState({
        mode: 'native',
        total: 10n,
        allowance: undefined,
        isLoading: false,
      }),
    ).toBe('ready');
  });
});

describe('balanceReadBlocksSubmit (D8)', () => {
  it('blocks a non-empty batch while the balance is unread', () => {
    expect(balanceReadBlocksSubmit(1n, undefined, false)).toBe(true);
  });

  it('does not block an empty batch, a known balance, or the first read', () => {
    expect(balanceReadBlocksSubmit(0n, undefined, false)).toBe(false);
    expect(balanceReadBlocksSubmit(1n, 0n, false)).toBe(false);
    expect(balanceReadBlocksSubmit(1n, undefined, true)).toBe(false);
  });
});

describe('balanceLineState (D9)', () => {
  it('does not fall back to the native balance label in token mode', () => {
    expect(
      balanceLineState({
        mode: 'token',
        tokenResolved: false,
        isLoading: false,
        isError: false,
        balance: undefined,
      }),
    ).toBe('unknownToken');
  });

  it('follows the native path normally', () => {
    expect(
      balanceLineState({
        mode: 'native',
        tokenResolved: true,
        isLoading: true,
        isError: false,
        balance: undefined,
      }),
    ).toBe('loading');
    expect(
      balanceLineState({
        mode: 'native',
        tokenResolved: true,
        isLoading: false,
        isError: true,
        balance: undefined,
      }),
    ).toBe('error');
    expect(
      balanceLineState({
        mode: 'native',
        tokenResolved: true,
        isLoading: false,
        isError: false,
        balance: 10n,
      }),
    ).toBe('value');
  });
});
