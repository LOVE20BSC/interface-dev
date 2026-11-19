import { describe, expect, it } from 'vitest';
import { govSharePercent } from './gov-share';

describe('govSharePercent', () => {
  it('formats normal shares with two decimals, truncated and trimmed', () => {
    expect(govSharePercent(1n, 1n)).toBe('100');
    expect(govSharePercent(1n, 2n)).toBe('50');
    expect(govSharePercent(1n, 3n)).toBe('33.33');
    expect(govSharePercent(4_472n, 4_695n)).toBe('95.25');
  });

  it('keeps "unknown" and a real zero apart', () => {
    expect(govSharePercent(undefined, 10n)).toBeUndefined();
    expect(govSharePercent(10n, undefined)).toBeUndefined();
    expect(govSharePercent(0n, 0n)).toBe('0');
    expect(govSharePercent(0n, 10n)).toBe('0');
    expect(govSharePercent(5n, 0n)).toBeUndefined();
  });

  it('shows tiny but positive shares as 0.{x}yyyy instead of 0', () => {
    // owner 2026-11-19：NFT #2 这种占比极小时不能显示 0%。
    expect(govSharePercent(1n, 100_000n)).toBe('0.001');
    expect(govSharePercent(1n, 1_000_000n)).toBe('0.0001');
    expect(govSharePercent(1n, 10n ** 24n)).toBe('0.0000000000000000000001');
  });
});
