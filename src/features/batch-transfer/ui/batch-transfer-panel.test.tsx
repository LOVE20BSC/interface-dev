import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BatchTransferPanel } from '@/features/batch-transfer/ui/batch-transfer-panel';

/**
 * 全局精度显示统一 (owner 2026-11-14: 「只有18位不显示精度，其他都要显示」).
 *
 * 批量转账的资产行此前无条件写「精度 18 位」，这里锁住共享规则：18 位不渲染精度
 * 字样，其它精度（含 6 位）照常显示。批量表单的其余行为由 e2e 覆盖。
 */

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const { catalogState, balanceState, txState } = vi.hoisted(() => ({
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
  txState: {
    value: {
      stage: 'idle',
      pendingKind: null,
      error: null,
      watch: {
        hash: null,
        status: 'idle',
        isStuck: false,
        remainingSeconds: 0,
        refresh: () => {},
      },
      approve: async () => {},
      submit: async () => {},
      resubmit: () => {},
      clearError: () => {},
    },
  },
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: SELF }),
  usePublicClient: () => undefined,
}));

vi.mock('@/features/transfer-token/model/use-transfer-catalog', () => ({
  useTransferCatalog: () => catalogState.value,
}));

vi.mock('@/features/transfer-token/model/use-transfer-balance', () => ({
  useTransferBalance: () => balanceState.value,
}));

vi.mock('@/features/batch-transfer/model/use-batch-allowance', () => ({
  useBatchAllowance: () => ({
    value: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: () => {},
  }),
  useBatchAllowanceReader: () => async () => undefined,
}));

vi.mock('@/features/batch-transfer/model/use-batch-recipient-balances', () => ({
  useBatchAddresses: () => [],
  useBatchRecipientBalances: () => ({
    values: [],
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
  useBatchBalanceReader: () => async () => [],
}));

vi.mock('@/features/batch-transfer/model/use-batch-recipient-codes', () => ({
  useBatchRecipientCodes: () => [],
}));

vi.mock('@/features/batch-transfer/model/use-batch-transaction', () => ({
  useBatchTransaction: () => txState.value,
}));

function renderPanel(): void {
  render(
    <MemoryRouter>
      <BatchTransferPanel
        isConnected
        isWrongChain={false}
        connectAction={<button type="button">连接钱包</button>}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  catalogState.value.nativeToken = {
    kind: 'native',
    address: undefined,
    symbol: 'ETH',
    decimals: 18,
  };
  balanceState.value = {
    balance: 10000000000000000000000n,
    isLoading: false,
    isError: false,
    refetch: () => {},
  };
  txState.value = {
    stage: 'idle',
    pendingKind: null,
    error: null,
    watch: { hash: null, status: 'idle', isStuck: false, remainingSeconds: 0, refresh: () => {} },
    approve: async () => {},
    submit: async () => {},
    resubmit: () => {},
    clearError: () => {},
  };
});

describe('BatchTransferPanel 精度字样', () => {
  it('18 位精度不渲染「精度」字样', () => {
    renderPanel();

    expect(screen.getByTestId('batch-transfer-balance')).toBeVisible();
    expect(screen.queryByTestId('batch-transfer-decimals')).toBeNull();
    expect(screen.queryByText(/精度/)).toBeNull();
  });

  it('非 18 位精度照常显示「精度 N 位」', () => {
    catalogState.value.nativeToken = {
      kind: 'native',
      address: undefined,
      symbol: 'ETH',
      decimals: 6,
    };
    renderPanel();

    expect(screen.getByTestId('batch-transfer-decimals')).toHaveTextContent('精度 6 位');
  });
});
