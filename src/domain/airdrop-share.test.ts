import { describe, expect, it } from 'vitest';
import { formatSharePercent } from './airdrop-share';

describe('formatSharePercent', () => {
  it('formats clean shares without a trailing decimal', () => {
    expect(formatSharePercent(1n, 10n)).toBe('10%');
    expect(formatSharePercent(1n, 4n)).toBe('25%');
    expect(formatSharePercent(1n, 1n)).toBe('100%');
    expect(formatSharePercent(0n, 1n)).toBe('0%');
  });

  it('keeps two decimals, trims zeros and never rounds up', () => {
    expect(formatSharePercent(1n, 3n)).toBe('33.33%');
    expect(formatSharePercent(1n, 8n)).toBe('12.5%');
    expect(formatSharePercent(2n, 3n)).toBe('66.66%');
  });

  it('shows tiny but positive shares as 0.{x}yyyy instead of 0%', () => {
    expect(formatSharePercent(1n, 100_000n)).toBe('0.001%');
    expect(formatSharePercent(1n, 1_000_000n)).toBe('0.0001%');
    expect(formatSharePercent(1n, 10n ** 24n)).toBe('0.0000000000000000000001%');
  });

  it('returns null when the total is unusable instead of inventing a value', () => {
    expect(formatSharePercent(1n, 0n)).toBeNull();
    expect(formatSharePercent(-1n, 10n)).toBeNull();
  });
});
