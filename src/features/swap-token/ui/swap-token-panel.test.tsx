import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADDRESSES } from '@/config/networks';
import type { SwapToken } from '@/features/swap-token/lib/swap-types';
import { SwapTokenPanel } from '@/features/swap-token/ui/swap-token-panel';

/**
 * 全局精度显示统一 (owner 2026-11-14: 「只有18位不显示精度，其他都要显示」).
 *
 * 兑换卡片此前完全不写精度：18 位是默认值，隐藏是对的；但非 18 位的代币也必须
 * 标出来。这里锁住两侧各一行「精度 N 位」，18 位时整行不渲染。
 */

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const ETH: SwapToken = { kind: 'native', address: undefined, symbol: 'ETH', decimals: 18 };
const WRAPPED: SwapToken = {
  kind: 'wrapped',
  address: ADDRESSES.weth,
  symbol: 'TestWETH',
  decimals: 18,
};
const COMMUNITY: SwapToken = {
  kind: 'community',
  address: ADDRESSES.tokenAddress,
  symbol: 'TestLOVE20',
  decimals: 18,
};
const STABLE: SwapToken = {
  kind: 'community',
  address: ADDRESSES.tokenAddress,
  symbol: 'TestUSDC',
  decimals: 6,
};

const ROUTE = {
  kind: 'swap' as const,
  path: [
    { kind: 'wrapped' as const, address: ADDRESSES.weth, symbol: 'TestWETH', decimals: 18 },
    {
      kind: 'community' as const,
      address: ADDRESSES.tokenAddress,
      symbol: 'TestLOVE20',
      decimals: 18,
    },
  ],
  pathAddresses: [ADDRESSES.weth, ADDRESSES.tokenAddress],
  pairs: [
    {
      address: ADDRESSES.pair,
      token0: ADDRESSES.weth,
      token1: ADDRESSES.tokenAddress,
      reserve0: 10n ** 20n,
      reserve1: 2n * 10n ** 23n,
    },
  ],
  displayPath: ['ETH', 'TestLOVE20'],
};

const { pairState, catalogState, txState, quoteState, balanceState } = vi.hoisted(() => ({
  pairState: {
    value: {
      status: 'ready',
      from: undefined as unknown,
      to: undefined as unknown,
      unknownSide: undefined as unknown,
      rawFrom: 'ETH',
      rawTo: 'TestLOVE20',
      selectFrom: () => {},
      selectTo: () => {},
      swapDirection: () => {},
    },
  },
  catalogState: {
    value: {
      communityTokens: [] as unknown[],
      searchResults: [] as unknown[],
      searchStatus: 'idle',
      search: '',
      setSearch: () => {},
      total: 0n,
      isLoading: false,
      isError: false,
      hasMore: false,
      loadMore: () => {},
      refetch: () => {},
    },
  },
  txState: {
    value: {
      approveStage: 'idle',
      swapStage: 'idle',
      isApproved: false,
      approvedAmount: null as bigint | null,
      receipt: null as unknown,
      pendingHash: null as `0x${string}` | null,
      pendingKind: null as unknown,
      error: null as unknown,
      isHydrating: false,
      watch: {
        hash: null,
        status: 'idle',
        isStuck: false,
        remainingSeconds: 0,
        refresh: () => {},
      },
      resubmit: () => {},
      approve: () => {},
      execute: async () => {},
      clearReceipt: () => {},
      clearError: () => {},
    },
  },
  quoteState: {
    value: {
      amountOut: undefined as bigint | undefined,
      quotedAt: undefined as number | undefined,
      ageSeconds: 0,
      remainingSeconds: 30,
      isExpired: false,
      isLoading: false,
      isFetching: false,
      isError: false,
      errorMessage: null as string | null,
      refetch: async () => undefined,
    },
  },
  balanceState: {
    value: {
      balance: (10n ** 18n) as bigint | undefined,
      allowance: undefined as bigint | undefined,
      isLoading: false,
      isError: false,
      refetch: () => {},
    },
  },
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: SELF }),
}));

vi.mock('@/features/swap-token/model/use-swap-pair', () => ({
  useSwapPair: () => pairState.value,
}));

vi.mock('@/features/swap-token/model/use-swap-catalog', () => ({
  useSwapCatalog: () => catalogState.value,
}));

vi.mock('@/features/swap-token/model/use-wrapped-native', () => ({
  useWrappedNative: () => ({
    address: ADDRESSES.weth,
    symbol: 'TestWETH',
    decimals: 18,
    token: WRAPPED,
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}));

vi.mock('@/features/swap-token/model/use-swap-fee', () => ({
  useSwapFee: () => ({ percent: '0.30' }),
}));

vi.mock('@/features/swap-token/model/use-swap-route', () => ({
  useSwapRoute: () => ({
    status: 'ready',
    route: ROUTE,
    allPairs: [],
    failingHopLabel: undefined,
    retry: () => {},
  }),
}));

vi.mock('@/features/swap-token/model/use-swap-quote', () => ({
  useSwapQuote: () => quoteState.value,
}));

vi.mock('@/features/swap-token/model/use-swap-balance', () => ({
  useSwapBalance: () => balanceState.value,
}));

vi.mock('@/features/swap-token/model/use-swap-transaction', () => ({
  useSwapTransaction: () => txState.value,
}));

function renderPanel(): void {
  render(
    <MemoryRouter>
      <SwapTokenPanel
        isConnected
        isWrongChain={false}
        connectAction={<button type="button">连接钱包</button>}
      />
    </MemoryRouter>,
  );
}

function setPair(from: SwapToken, to: SwapToken): void {
  pairState.value = {
    ...pairState.value,
    status: 'ready',
    from,
    to,
  };
}

beforeEach(() => {
  setPair(ETH, COMMUNITY);
});

describe('SwapTokenPanel 精度字样', () => {
  it('两侧都是 18 位精度时不渲染「精度」字样', () => {
    renderPanel();

    expect(screen.getByTestId('swap-from-amount')).toBeVisible();
    expect(screen.queryByTestId('swap-from-decimals')).toBeNull();
    expect(screen.queryByTestId('swap-to-decimals')).toBeNull();
    expect(screen.queryByText(/精度/)).toBeNull();
  });

  it('非 18 位精度照常显示「精度 N 位」（从侧）', () => {
    setPair(STABLE, ETH);
    renderPanel();

    expect(screen.getByTestId('swap-from-decimals')).toHaveTextContent('精度 6 位');
    expect(screen.queryByTestId('swap-to-decimals')).toBeNull();
  });

  it('非 18 位精度照常显示「精度 N 位」（到侧）', () => {
    setPair(ETH, STABLE);
    renderPanel();

    expect(screen.getByTestId('swap-to-decimals')).toHaveTextContent('精度 6 位');
  });
});
