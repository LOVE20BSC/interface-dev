import { describe, expect, it } from 'vitest';
import { sharePercent } from './gov-share';

describe('sharePercent', () => {
  it('is the part over the total, truncated to two decimals like the old page', () => {
    expect(sharePercent(1n, 1n)).toBe(100);
    expect(sharePercent(1n, 2n)).toBe(50);
    expect(sharePercent(1n, 3n)).toBe(33.33);
    expect(sharePercent(4_472n, 4_695n)).toBe(95.25);
  });

  it('keeps "unknown" and a real zero apart', () => {
    expect(sharePercent(undefined, 10n)).toBeUndefined();
    expect(sharePercent(10n, undefined)).toBeUndefined();
    expect(sharePercent(0n, 0n)).toBe(0);
    expect(sharePercent(5n, 0n)).toBeUndefined();
  });
});
