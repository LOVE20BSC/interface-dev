import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReadContract, useReadContracts } from 'wagmi';
import { useMemberNftAddress } from '@/entities/member-identity/model/use-member-nft-address';
import { useMemberIdentities } from '@/entities/member-identity/model/use-member-identities';

/**
 * Refetch 约定：只重读真正启用的查询。这里钉住枚举读的三层——balanceOf、
 * tokenOfOwnerByIndex、memberName——在 enabled 为 false 时不会被 refetch 唤醒
 * （同一约定见 use-batch-recipient-balances / use-approval-allowances）。
 */

vi.mock('wagmi', () => ({
  useReadContract: vi.fn(),
  useReadContracts: vi.fn(),
}));

vi.mock('@/entities/member-identity/model/use-member-nft-address', () => ({
  useMemberNftAddress: vi.fn(),
}));

const ACCOUNT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const MEMBER_NFT = '0x610178dA211FEF7D417bC0e6FeD39F05609AD788';

const readContract = vi.mocked(useReadContract);
const readContracts = vi.mocked(useReadContracts);
const memberNftAddress = vi.mocked(useMemberNftAddress);

interface ContractReadState {
  readonly data: readonly unknown[];
  readonly refetch: () => void;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

function balanceRead(
  data: bigint | undefined,
  refetch: () => void,
): ReturnType<typeof useReadContract> {
  return {
    data,
    isError: false,
    isLoading: false,
    isFetching: false,
    refetch,
  } as unknown as ReturnType<typeof useReadContract>;
}

function contractsState(data: readonly unknown[], refetch: () => void): ContractReadState {
  return { data, refetch, isLoading: false, isError: false };
}

const balanceRefetch = vi.fn();
const idsRefetch = vi.fn();
const namesRefetch = vi.fn();
const emptyRefetch = vi.fn();

beforeEach(() => {
  memberNftAddress.mockReturnValue({
    address: MEMBER_NFT,
    status: 'configured',
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMemberNftAddress>);

  const idsState = contractsState([{ status: 'success', result: 1n }], idsRefetch);
  const namesState = contractsState(
    [{ status: 'success', result: 'Testdev-member-0' }],
    namesRefetch,
  );
  const emptyState = contractsState([], emptyRefetch);
  readContracts.mockImplementation((options) => {
    const contract = options?.contracts?.[0] as { functionName?: string } | undefined;
    const functionName = contract?.functionName;
    const state =
      functionName === 'tokenOfOwnerByIndex'
        ? idsState
        : functionName === 'memberName'
          ? namesState
          : emptyState;
    return state as unknown as ReturnType<typeof useReadContracts>;
  });
});

describe('useMemberIdentities refetch', () => {
  it('does not refetch balanceOf while no wallet is known', () => {
    readContract.mockReturnValue(balanceRead(undefined, balanceRefetch));

    const { result } = renderHook(() => useMemberIdentities(undefined));
    act(() => {
      result.current.refetch();
    });

    expect(balanceRefetch).not.toHaveBeenCalled();
  });

  it('does not refetch the per-token reads for a wallet with no identities', () => {
    readContract.mockReturnValue(balanceRead(0n, balanceRefetch));

    const { result } = renderHook(() => useMemberIdentities(ACCOUNT));
    act(() => {
      result.current.refetch();
    });

    // balanceOf is enabled (a wallet is known), the empty batches are not.
    expect(balanceRefetch).toHaveBeenCalledTimes(1);
    expect(idsRefetch).not.toHaveBeenCalled();
    expect(namesRefetch).not.toHaveBeenCalled();
    expect(emptyRefetch).not.toHaveBeenCalled();
  });

  it('refetches every enabled read for a wallet that owns identities', () => {
    readContract.mockReturnValue(balanceRead(1n, balanceRefetch));

    const { result } = renderHook(() => useMemberIdentities(ACCOUNT));
    act(() => {
      result.current.refetch();
    });

    expect(balanceRefetch).toHaveBeenCalledTimes(1);
    expect(idsRefetch).toHaveBeenCalledTimes(1);
    expect(namesRefetch).toHaveBeenCalledTimes(1);
  });
});
