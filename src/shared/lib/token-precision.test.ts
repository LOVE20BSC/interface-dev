import { describe, expect, it } from 'vitest';
import { DEFAULT_TOKEN_DECIMALS, shouldShowPrecision } from './token-precision';

describe('shouldShowPrecision', () => {
  it('hides the label for the 18-digit default', () => {
    expect(shouldShowPrecision(DEFAULT_TOKEN_DECIMALS)).toBe(false);
    expect(shouldShowPrecision(18)).toBe(false);
  });

  it('hides the label while the metadata is unknown (undefined)', () => {
    expect(shouldShowPrecision(undefined)).toBe(false);
  });

  it('shows the label for a 0-digit token', () => {
    // 0 is a real precision (NFT-like integer tokens), not "no value".
    expect(shouldShowPrecision(0)).toBe(true);
  });

  it('shows the label for 6-digit stablecoins', () => {
    expect(shouldShowPrecision(6)).toBe(true);
  });

  it('shows the label for 8-digit tokens', () => {
    expect(shouldShowPrecision(8)).toBe(true);
  });

  it('shows the label for a 24-digit token (more than the default)', () => {
    expect(shouldShowPrecision(24)).toBe(true);
  });
});
