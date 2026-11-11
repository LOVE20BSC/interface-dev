import { describe, expect, it, vi } from 'vitest';
import { BaseError, ContractFunctionRevertedError } from 'viem';
import { memberNftAbi } from '@/config/abis';
import {
  createMemberNameCache,
  normalizeMemberName,
  resolveMemberNameByName,
  type MemberNameReader,
} from '@/features/transfer-identity/lib/member-name-recipient';

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

/**
 * In-memory chain keyed by normalised name, like MemberNFT.memberId(): the
 * contract lowercases the input itself. Names keep their canonical casing, as
 * `memberName(id)` returns the stored name.
 */
function readerWith(
  chain: Readonly<Record<string, { readonly id: bigint; readonly name: string }>>,
  overrides: Partial<MemberNameReader> = {},
): MemberNameReader {
  return {
    memberId: async (rawName) => chain[normalizeMemberName(rawName)]?.id ?? 0n,
    memberName: async (memberId) => {
      for (const entry of Object.values(chain)) {
        if (entry.id === memberId) return entry.name;
      }
      return '';
    },
    ownerOf: async () => OTHER,
    ...overrides,
  };
}

const CHAIN = {
  'testdev-member-1': { id: 2n, name: 'Testdev-member-1' },
  'testdev-member-2': { id: 3n, name: 'Testdev-member-2' },
};

function revertedMemberId(): BaseError {
  return new BaseError('call failed', {
    cause: new ContractFunctionRevertedError({
      abi: memberNftAbi,
      functionName: 'memberId',
      message: 'execution reverted',
    }),
  });
}

describe('normalizeMemberName', () => {
  it('lowercases ASCII exactly like MemberNFT._toLowerCase', () => {
    expect(normalizeMemberName('Testdev-MEMBER-1')).toBe('testdev-member-1');
    expect(normalizeMemberName('中文ABC')).toBe('中文abc');
    expect(normalizeMemberName(' already-lower ')).toBe(' already-lower ');
  });
});

describe('resolveMemberNameByName', () => {
  it('resolves one id through the getter and reads its canonical on-chain name', async () => {
    const reader = readerWith(CHAIN);
    const memberId = vi.spyOn(reader, 'memberId');
    const memberName = vi.spyOn(reader, 'memberName');
    const ownerOf = vi.spyOn(reader, 'ownerOf');

    await expect(
      resolveMemberNameByName('  TESTDEV-mEmBeR-1  ', SELF, reader),
    ).resolves.toEqual({
      status: 'ok',
      memberId: 2n,
      name: 'Testdev-member-1',
      address: OTHER,
    });

    // One getter call, no enumeration, and the raw typed name goes to the
    // contract because memberId() normalises internally.
    expect(memberId).toHaveBeenCalledTimes(1);
    expect(memberId).toHaveBeenCalledWith('TESTDEV-mEmBeR-1');
    expect(memberName).toHaveBeenCalledWith(2n);
    expect(ownerOf).toHaveBeenCalledWith(2n);
  });

  it('treats a 0 id as not-found without reading a name', async () => {
    const reader = readerWith(CHAIN);
    const memberName = vi.spyOn(reader, 'memberName');
    const ownerOf = vi.spyOn(reader, 'ownerOf');

    await expect(resolveMemberNameByName('missing-name', SELF, reader)).resolves.toEqual({
      status: 'not-found',
    });
    expect(memberName).not.toHaveBeenCalled();
    expect(ownerOf).not.toHaveBeenCalled();
  });

  it('treats a reverted getter as not-found', async () => {
    const reader = readerWith(CHAIN, {
      memberId: async () => {
        throw revertedMemberId();
      },
    });
    await expect(resolveMemberNameByName('Testdev-member-1', SELF, reader)).resolves.toEqual({
      status: 'not-found',
    });
  });

  it('returns self when the resolved id belongs to the connected wallet', async () => {
    const reader = readerWith(CHAIN, { ownerOf: async () => SELF });
    await expect(resolveMemberNameByName('testdev-member-1', SELF, reader)).resolves.toEqual({
      status: 'self',
      memberId: 2n,
      name: 'Testdev-member-1',
    });
  });

  it('keeps a transient getter failure retryable, not not-found', async () => {
    const reader = readerWith(CHAIN, {
      memberId: async () => {
        throw new Error('fetch failed');
      },
    });
    await expect(resolveMemberNameByName('testdev-member-1', SELF, reader)).resolves.toEqual({
      status: 'error',
    });
  });

  it('keeps a transient canonical-name failure retryable', async () => {
    const reader = readerWith(CHAIN, {
      memberName: async () => {
        throw new Error('fetch failed');
      },
    });
    await expect(resolveMemberNameByName('testdev-member-1', SELF, reader)).resolves.toEqual({
      status: 'error',
    });
  });

  it('does not read the chain for blank input', async () => {
    const reader = readerWith(CHAIN);
    const memberId = vi.spyOn(reader, 'memberId');
    await expect(resolveMemberNameByName('   ', SELF, reader)).resolves.toEqual({
      status: 'not-found',
    });
    expect(memberId).not.toHaveBeenCalled();
  });

  it('caches name → id for the session but reads ownership fresh', async () => {
    const reader = readerWith(CHAIN);
    const cache = createMemberNameCache();
    const memberId = vi.spyOn(reader, 'memberId');
    const memberName = vi.spyOn(reader, 'memberName');
    const ownerOf = vi.spyOn(reader, 'ownerOf');

    await resolveMemberNameByName('Testdev-member-1', SELF, reader, cache);
    await resolveMemberNameByName('TESTDEV-MEMBER-1', SELF, reader, cache);

    expect(memberId).toHaveBeenCalledTimes(1);
    expect(memberName).toHaveBeenCalledTimes(1);
    expect(ownerOf).toHaveBeenCalledTimes(2);
  });
});
