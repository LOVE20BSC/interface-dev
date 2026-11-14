import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADDRESSES } from '@/config/networks';
import { ApprovalsPanel } from '@/features/approve-token/ui/approval-panel';

/**
 * 全局精度显示统一 (owner 2026-11-14: 「只有18位不显示精度，其他都要显示」).
 *
 * 代币授权页此前无条件写「精度 18 位」，这里锁住共享规则：18 位不渲染精度字样，
 * 其它精度（含 6 位）照常显示。页面其余行为由 e2e 覆盖。
 */

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const { catalogState, balanceState, allowancesState, txState } = vi.hoisted(() => ({
  catalogState: {
    value: {
      nativeToken: {
        kind: 'native',
        address: undefined,
        symbol: 'ETH',
        decimals: 18,
      },
      communityTokens: [] as unknown[],
      wrappedToken: undefined as unknown,
      lpToken: undefined as unknown,
      searchResults: [] as unknown[],
      searchStatus: 'idle',
      search: '',
      setSearch: () => {},
      hasMore: false,
      loadMore: () => {},
      isLoading: false,
      communityLoading: false,
      communityError: false,
      custom: {
        status: 'idle',
        token: undefined,
        address: undefined,
        retry: () => {},
      },
      addCustomToken: () => {},
      clearCustomToken: () => {},
      refetch: () => {},
    },
  },
  balanceState: {
    value: {
      balance: 10000000000000000000000n as bigint | undefined,
      isLoading: false,
      isError: false,
      refetch: () => {},
    },
  },
  allowancesState: {
    value: {
      byAddress: new Map<string, bigint>() as ReadonlyMap<string, bigint>,
      isLoading: false,
      isError: false,
      refetch: () => {},
    },
  },
  txState: {
    value: {
      stage: 'idle',
      record: null,
      error: null,
      watch: {
        hash: null,
        status: 'idle',
        isStuck: false,
        remainingSeconds: 0,
        refresh: () => {},
      },
      submit: async () => true,
      resubmit: () => {},
      clearRecord: () => {},
      clearError: () => {},
    },
  },
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: SELF }),
}));

vi.mock('@/features/transfer-token/model/use-transfer-catalog', () => ({
  useTransferCatalog: () => catalogState.value,
}));

vi.mock('@/features/transfer-token/model/use-transfer-balance', () => ({
  useTransferBalance: () => balanceState.value,
}));

vi.mock('@/features/approve-token/model/use-approval-allowances', () => ({
  useApprovalAllowances: () => allowancesState.value,
}));

vi.mock('@/features/approve-token/model/use-approval-transaction', () => ({
  approvalActionLabel: () => '',
  useApprovalTransaction: () => txState.value,
}));

function renderPanel(): void {
  render(
    <MemoryRouter>
      <ApprovalsPanel
        isConnected
        isWrongChain={false}
        connectAction={<button type="button">连接钱包</button>}
      />
    </MemoryRouter>,
  );
}

function useCommunityToken(decimals: number): void {
  catalogState.value.communityTokens = [
    {
      kind: 'community',
      address: ADDRESSES.tokenAddress,
      symbol: 'TestLOVE20',
      decimals,
    },
  ];
}

beforeEach(() => {
  catalogState.value.communityTokens = [];
  balanceState.value = {
    balance: 10000000000000000000000n,
    isLoading: false,
    isError: false,
    refetch: () => {},
  };
  allowancesState.value = {
    byAddress: new Map<string, bigint>(),
    isLoading: false,
    isError: false,
    refetch: () => {},
  };
  txState.value = {
    stage: 'idle',
    record: null,
    error: null,
    watch: { hash: null, status: 'idle', isStuck: false, remainingSeconds: 0, refresh: () => {} },
    submit: async () => true,
    resubmit: () => {},
    clearRecord: () => {},
    clearError: () => {},
  };
});

describe('ApprovalsPanel 精度字样', () => {
  it('18 位精度不渲染「精度」字样', () => {
    useCommunityToken(18);
    renderPanel();

    expect(screen.getByTestId('approvals-balance')).toBeVisible();
    expect(screen.queryByTestId('approvals-decimals')).toBeNull();
    expect(screen.queryByText(/精度/)).toBeNull();
  });

  it('非 18 位精度照常显示「精度 N 位」', () => {
    useCommunityToken(6);
    renderPanel();

    expect(screen.getByTestId('approvals-decimals')).toHaveTextContent('精度 6 位');
  });
});
