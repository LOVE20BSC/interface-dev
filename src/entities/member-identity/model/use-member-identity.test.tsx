import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccount, useChainId, useReadContract } from 'wagmi';
import { cache, type CacheScope } from '@/shared/lib/cache';
import { useMemberIdentities } from '@/entities/member-identity/model/use-member-identities';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';

/**
 * 我的 NFT 列表「铸造后过 1~2 秒报错」回归（owner 2026-11-17）。
 *
 * `refetch()` 曾经无条件重读 ownerOf()，而 TanStack Query 的 `refetch()` 会忽略
 * `enabled: false`：未选择身份时 args 是 undefined，viem 直接抛
 * AbiEncodingLengthMismatchError，`ownerRead.isError` 一真，列表就渲染错误卡。
 * 这里用 mock 的 wagmi 读 hook 断言「禁用时绝不重读」，并把状态派生一起钉住。
 */

vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  useReadContract: vi.fn(),
}));

vi.mock('@/entities/member-identity/model/use-member-identities', () => ({
  useMemberIdentities: vi.fn(),
}));

const ACCOUNT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const MEMBER_NFT = '0x610178dA211FEF7D417bC0e6FeD39F05609AD788';
const CHAIN_ID = 31337;

const account = vi.mocked(useAccount);
const chainId = vi.mocked(useChainId);
const readContract = vi.mocked(useReadContract);
const memberIdentities = vi.mocked(useMemberIdentities);

const scope: CacheScope = {
  chainId: CHAIN_ID,
  contractAddress: MEMBER_NFT,
  wallet: ACCOUNT,
};

function enumeration(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof useMemberIdentities> {
  return {
    status: 'ready',
    identities: [{ tokenId: 1n, name: 'Testdev-member-0' }],
    balance: 1n,
    isTruncated: false,
    memberNftAddress: MEMBER_NFT,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useMemberIdentities>;
}

function ownerRead(options: {
  readonly data?: `0x${string}`;
  readonly isError?: boolean;
  readonly refetch?: () => void;
}): ReturnType<typeof useReadContract> {
  return {
    data: options.data,
    isError: options.isError ?? false,
    isLoading: false,
    isFetching: false,
    refetch: options.refetch ?? vi.fn(),
  } as unknown as ReturnType<typeof useReadContract>;
}

beforeEach(() => {
  cache.clearAll();
  account.mockReturnValue({
    address: ACCOUNT,
    isConnected: true,
  } as unknown as ReturnType<typeof useAccount>);
  chainId.mockReturnValue(CHAIN_ID);
  memberIdentities.mockReturnValue(enumeration());
  readContract.mockReturnValue(ownerRead({}));
});

describe('useMemberIdentity refetch', () => {
  it('does not refetch ownerOf while no identity is selected', () => {
    const enumerationRefetch = vi.fn();
    const ownerRefetch = vi.fn();
    memberIdentities.mockReturnValue(enumeration({ refetch: enumerationRefetch }));
    readContract.mockReturnValue(ownerRead({ refetch: ownerRefetch }));

    const { result } = renderHook(() => useMemberIdentity());
    act(() => {
      result.current.refetch();
    });

    // The list read still refreshes; the disabled ownerOf read is left alone.
    expect(enumerationRefetch).toHaveBeenCalledTimes(1);
    expect(ownerRefetch).not.toHaveBeenCalled();
  });

  it('refetches ownerOf once a selection enables it', () => {
    const ownerRefetch = vi.fn();
    memberIdentities.mockReturnValue(
      enumeration({
        identities: [
          { tokenId: 1n, name: 'Testdev-member-0' },
          { tokenId: 7n, name: 'Testdev-member-7' },
        ],
      }),
    );
    readContract.mockReturnValue(ownerRead({ data: ACCOUNT, refetch: ownerRefetch }));
    cache.set(scope, 'identity', { tokenId: '7' });

    const { result } = renderHook(() => useMemberIdentity());
    expect(result.current.status).toBe('ready');

    act(() => {
      result.current.refetch();
    });

    expect(ownerRefetch).toHaveBeenCalledTimes(1);
  });
});

describe('useMemberIdentity status', () => {
  it('a stale ownerOf error does not error the list while nothing is selected', () => {
    readContract.mockReturnValue(ownerRead({ isError: true }));

    const { result } = renderHook(() => useMemberIdentity());

    expect(result.current.status).toBe('needs-selection');
  });

  it('still reports the ownerOf error once an identity is selected', () => {
    memberIdentities.mockReturnValue(
      enumeration({ identities: [{ tokenId: 7n, name: 'Testdev-member-7' }] }),
    );
    readContract.mockReturnValue(ownerRead({ isError: true }));
    cache.set(scope, 'identity', { tokenId: '7' });

    const { result } = renderHook(() => useMemberIdentity());

    expect(result.current.status).toBe('error');
  });
});
