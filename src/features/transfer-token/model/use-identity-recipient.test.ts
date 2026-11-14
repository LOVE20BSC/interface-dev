import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdentityRecipient } from './use-identity-recipient';

const MEMBER_NFT = '0xdC64a140Aa3E981100a9becA4E685f962f0cF6C9';
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const { idCalls, nameCalls, idState, nameState, readContract } = vi.hoisted(() => {
  const idCalls: unknown[][] = [];
  const nameCalls: unknown[][] = [];
  const idState = {
    value: {
      status: 'idle' as string,
      memberId: null as bigint | null,
      address: null as string | null,
      retry: () => {},
    },
  };
  const nameState = {
    value: {
      status: 'idle' as string,
      memberId: null as bigint | null,
      name: null as string | null,
      address: null as string | null,
      retry: () => {},
    },
  };
  return {
    idCalls,
    nameCalls,
    idState,
    nameState,
    readContract: vi.fn((..._args: unknown[]) => ({ data: undefined })),
  };
});

vi.mock('wagmi', () => ({
  useReadContract: (options: unknown) => readContract(options),
}));

vi.mock('@/features/transfer-identity/model/use-member-recipient', () => ({
  useMemberRecipient: (...args: unknown[]) => {
    idCalls.push(args);
    return idState.value;
  },
}));

vi.mock('@/features/transfer-identity/model/use-member-name-recipient', () => ({
  useMemberNameRecipient: (...args: unknown[]) => {
    nameCalls.push(args);
    return nameState.value;
  },
}));

function last<T>(calls: T[][]): T[] {
  return calls[calls.length - 1] ?? [];
}

beforeEach(() => {
  idCalls.length = 0;
  nameCalls.length = 0;
  idState.value = {
    status: 'idle',
    memberId: null,
    address: null,
    retry: () => {},
  };
  nameState.value = {
    status: 'idle',
    memberId: null,
    name: null,
    address: null,
    retry: () => {},
  };
});

describe('useIdentityRecipient 收款方模式', () => {
  it('routes an id-mode input to ownerOf only, never to the name resolver', () => {
    renderHook(() => useIdentityRecipient(MEMBER_NFT, '123456', true, undefined, 'id'));

    // Signature: (memberNft, input, active, selfAddress) — active flags are the 3rd arg.
    expect(last(idCalls)[2]).toBe(true);
    expect(last(nameCalls)[2]).toBe(false);
  });

  it('routes a name-mode input to the name resolver, so a pure-digit name is not read as an id', () => {
    nameState.value = {
      status: 'ok',
      memberId: 9n,
      name: '123456',
      address: OTHER,
      retry: () => {},
    };

    const { result } = renderHook(() =>
      useIdentityRecipient(MEMBER_NFT, '123456', true, undefined, 'name'),
    );

    expect(last(nameCalls)[2]).toBe(true);
    expect(last(idCalls)[2]).toBe(false);
    expect(result.current.status).toBe('ok');
    expect(result.current.memberId).toBe(9n);
    expect(result.current.name).toBe('123456');
    expect(result.current.address).toBe(OTHER);
  });

  it('does not read the canonical name in name mode (the resolver already returns it)', () => {
    renderHook(() => useIdentityRecipient(MEMBER_NFT, 'Testdev-member-1', true, undefined, 'name'));
    expect(readContract).toHaveBeenCalled();
    const args = readContract.mock.calls.at(-1) as unknown as [{ query: { enabled: boolean } }];
    expect(args[0].query.enabled).toBe(false);
  });

  it('stays idle without an input', () => {
    const { result } = renderHook(() =>
      useIdentityRecipient(MEMBER_NFT, '   ', true, undefined, 'id'),
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.memberId).toBeNull();
    expect(result.current.address).toBeNull();
  });
});
