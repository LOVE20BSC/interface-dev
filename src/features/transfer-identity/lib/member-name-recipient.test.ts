import { describe, expect, it, vi } from 'vitest';
import {
  NAME_SCAN_CAP,
  NAME_SCAN_CHUNK,
  createMemberNameCache,
  normalizeMemberName,
  resolveMemberNameByName,
  type MemberNameReader,
} from '@/features/transfer-identity/lib/member-name-recipient';

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/** In-memory chain: ids are 1-based, names[0] belongs to id 1. */
function readerWith(
  names: readonly string[],
  overrides: Partial<MemberNameReader> = {},
): MemberNameReader & { readonly chunks: readonly number[] } {
  const chunks: number[] = [];
  const reader: MemberNameReader = {
    totalSupply: async () => BigInt(names.length),
    // Mirrors MemberNFT.normalizeName (ASCII lowercasing only).
    normalizeName: async (name) => normalizeMemberName(name),
    memberNames: async (ids) => {
      chunks.push(ids.length);
      return ids.map((id) => names[Number(id) - 1] ?? null);
    },
    ownerOf: async () => OTHER,
    ...overrides,
  };
  return Object.assign(reader, { chunks });
}

describe('normalizeMemberName', () => {
  it('lowercases ASCII exactly like MemberNFT.normalizeName', () => {
    expect(normalizeMemberName('Testdev-MEMBER-1')).toBe('testdev-member-1');
    expect(normalizeMemberName('中文ABC')).toBe('中文abc');
    expect(normalizeMemberName(' already-lower ')).toBe(' already-lower ');
  });
});

describe('resolveMemberNameByName', () => {
  it('normalises the typed name before comparing memberName() results', async () => {
    const reader = readerWith(['Testdev-member-0', 'Testdev-member-1', 'Other']);
    await expect(resolveMemberNameByName('  TESTDEV-mEmBeR-1  ', SELF, reader)).resolves.toEqual({
      status: 'ok',
      memberId: 2n,
      name: 'Testdev-member-1',
      address: OTHER,
    });
  });

  it('stops at the first normalised match', async () => {
    const reader = readerWith(['Testdev-member-1', 'Testdev-member-1-copy']);
    const ownerOf = vi.fn(async () => OTHER);
    const result = await resolveMemberNameByName('Testdev-MEMBER-1', SELF, {
      ...reader,
      ownerOf,
    });
    expect(result).toEqual({
      status: 'ok',
      memberId: 1n,
      name: 'Testdev-member-1',
      address: OTHER,
    });
    expect(ownerOf).toHaveBeenCalledTimes(1);
  });

  it('reads totalSupply in chunks of at most 100 ids', async () => {
    const names = Array.from({ length: 250 }, (_, index) => `Testdev-member-${index}`);
    const reader = readerWith(names);
    await expect(resolveMemberNameByName('Testdev-member-249', SELF, reader)).resolves.toEqual({
      status: 'ok',
      memberId: 250n,
      name: 'Testdev-member-249',
      address: OTHER,
    });
    expect(reader.chunks).toEqual([100, 100, 50]);
    expect(Math.max(...reader.chunks)).toBeLessThanOrEqual(NAME_SCAN_CHUNK);
  });

  it('caps the scan at 1000 ids and degrades with capped', async () => {
    const names = Array.from({ length: 1500 }, (_, index) => `Testdev-member-${index}`);
    const reader = readerWith(names);
    await expect(resolveMemberNameByName('not-here', SELF, reader)).resolves.toEqual({
      status: 'capped',
    });
    expect(reader.chunks.reduce((sum, size) => sum + size, 0)).toBe(NAME_SCAN_CAP);
    expect(reader.chunks).toHaveLength(NAME_SCAN_CAP / NAME_SCAN_CHUNK);
  });

  it('returns not-found when the whole collection was scanned', async () => {
    const reader = readerWith(['Testdev-member-0', 'Testdev-member-1']);
    await expect(resolveMemberNameByName('Testdev-member-9', SELF, reader)).resolves.toEqual({
      status: 'not-found',
    });
  });

  it('returns self when the matched id belongs to the connected wallet', async () => {
    const reader = readerWith(['Testdev-member-1'], { ownerOf: async () => SELF });
    await expect(resolveMemberNameByName('testdev-member-1', SELF, reader)).resolves.toEqual({
      status: 'self',
      memberId: 1n,
      name: 'Testdev-member-1',
    });
  });

  it('treats a failed scan read as retryable, not as not-found', async () => {
    const reader = readerWith(['Testdev-member-1'], {
      memberNames: async () => {
        throw new Error('fetch failed');
      },
    });
    await expect(resolveMemberNameByName('testdev-member-1', SELF, reader)).resolves.toEqual({
      status: 'error',
    });
  });

  it('caches name → id for the session but reads ownership fresh', async () => {
    const names = ['Testdev-member-0', 'Testdev-member-1'];
    const reader = readerWith(names);
    const cache = createMemberNameCache();
    const memberNames = vi.spyOn(reader, 'memberNames');
    const ownerOf = vi.spyOn(reader, 'ownerOf');

    await resolveMemberNameByName('Testdev-member-1', SELF, reader, cache);
    await resolveMemberNameByName('TESTDEV-MEMBER-1', SELF, reader, cache);

    expect(memberNames).toHaveBeenCalledTimes(1);
    expect(ownerOf).toHaveBeenCalledTimes(2);
  });
});
