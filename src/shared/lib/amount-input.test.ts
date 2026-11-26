import { describe, expect, it } from 'vitest';
import { NATIVE_FEE_RESERVE_WEI, parseAmountInput } from './amount-input';

const A = { decimals: 18, strategy: 'reject-precision' } as const;
const B = { decimals: 18, strategy: 'truncate-precision' } as const;
const C = { decimals: 18, strategy: 'reject-as-invalid' } as const;

describe('parseAmountInput', () => {
  it('treats blank input as empty in every strategy', () => {
    for (const options of [A, B, C]) {
      expect(parseAmountInput('', options)).toEqual({ kind: 'empty' });
      expect(parseAmountInput('   ', options)).toEqual({ kind: 'empty' });
    }
  });

  it('rejects signs, exponent notation, full-width digits and separators', () => {
    for (const options of [A, B, C]) {
      for (const raw of ['-1', '1e3', '１', '1 000', '1,5', '0x10']) {
        expect(parseAmountInput(raw, options)).toEqual({ kind: 'invalid' });
      }
    }
  });

  it('accepts the shapes the panels accept and normalises them', () => {
    for (const options of [A, B, C]) {
      expect(parseAmountInput('.5', options)).toMatchObject({ kind: 'ok', value: 5n * 10n ** 17n });
      expect(parseAmountInput('1.', options)).toMatchObject({ kind: 'ok', value: 10n ** 18n });
      expect(parseAmountInput('0001.5', options)).toMatchObject({
        kind: 'ok',
        value: 15n * 10n ** 17n,
      });
    }
  });

  it('maps zero differently per strategy (panels gate buttons on it)', () => {
    expect(parseAmountInput('0', A)).toEqual({ kind: 'ok', value: 0n, truncated: false });
    expect(parseAmountInput('0.0', A)).toEqual({ kind: 'ok', value: 0n, truncated: false });
    expect(parseAmountInput('0', B)).toEqual({ kind: 'zero', truncated: false });
    expect(parseAmountInput('0', C)).toEqual({ kind: 'zero', truncated: false });
  });

  it('rejects excess precision without parsing it (reject-precision)', () => {
    expect(parseAmountInput('1.0000000000000000001', A)).toEqual({
      kind: 'too-precise',
      digits: 18,
    });
    // 恰好 18 位是合法的
    expect(parseAmountInput('1.000000000000000001', A)).toMatchObject({ kind: 'ok' });
  });

  it('truncates excess precision and flags it (truncate-precision)', () => {
    expect(parseAmountInput('1.0000000000000000001', B)).toMatchObject({
      kind: 'ok',
      truncated: true,
    });
    expect(parseAmountInput('1.5', B)).toMatchObject({ kind: 'ok', truncated: false });
  });

  it('turns excess precision into invalid (reject-as-invalid)', () => {
    expect(parseAmountInput('1.0000000000000000001', C)).toEqual({ kind: 'invalid' });
  });

  it('flags a truncation that lands exactly on zero (transfer copy depends on it)', () => {
    expect(parseAmountInput('0.0000000000000000001', B)).toEqual({
      kind: 'zero',
      truncated: true,
    });
  });

  it('keeps bigint precision for long integer input (no safe-integer cap)', () => {
    const raw = `1${'0'.repeat(30)}`;
    expect(parseAmountInput(raw, A)).toMatchObject({ kind: 'ok', value: 10n ** 48n });
    expect(parseAmountInput(raw, B)).toMatchObject({ kind: 'ok', value: 10n ** 48n });
    expect(parseAmountInput(raw, C)).toMatchObject({ kind: 'ok', value: 10n ** 48n });
  });

  it('rejects a bare dot', () => {
    for (const options of [A, B, C]) {
      expect(parseAmountInput('.', options)).toEqual({ kind: 'invalid' });
    }
  });

  it('exposes the single native fee reserve', () => {
    expect(NATIVE_FEE_RESERVE_WEI).toBe(10n ** 15n);
  });
});
