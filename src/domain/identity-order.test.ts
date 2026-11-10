import { describe, expect, it } from 'vitest';
import { orderIdentities } from './identity-order';

const identity = (tokenId: bigint) => ({ tokenId, name: `id-${tokenId.toString()}` });

describe('orderIdentities', () => {
  it('sorts by memberId ascending when nothing is selected', () => {
    const ordered = orderIdentities([identity(7n), identity(2n), identity(5n)], null);
    expect(ordered.map((entry) => entry.tokenId)).toEqual([2n, 5n, 7n]);
  });

  it('puts the current identity first and keeps the rest ascending', () => {
    const ordered = orderIdentities([identity(7n), identity(2n), identity(5n)], 5n);
    expect(ordered.map((entry) => entry.tokenId)).toEqual([5n, 2n, 7n]);
  });

  it('does not treat an unknown current id as a match', () => {
    const ordered = orderIdentities([identity(7n), identity(2n)], 99n);
    expect(ordered.map((entry) => entry.tokenId)).toEqual([2n, 7n]);
  });

  it('does not mutate its input', () => {
    const input = [identity(7n), identity(2n)];
    orderIdentities(input, 7n);
    expect(input.map((entry) => entry.tokenId)).toEqual([7n, 2n]);
  });
});
