import { act, fireEvent, render, screen } from '@testing-library/react';
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

const { pairState, catalogState, txState, quoteState, balanceState, routeState } = vi.hoisted(() => ({
  routeState: {
    value: {
      status: 'ready',
      route: null as unknown,
      allPairs: [] as unknown[],
      failingHopLabel: undefined as string | undefined,
      retry: () => {},
    },
  },
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
  useSwapRoute: () => routeState.value,
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

function setRoute(status: string, route: unknown): void {
  routeState.value = { ...routeState.value, status, route };
}

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
  window.localStorage.clear();
  setPair(ETH, COMMUNITY);
  setRoute('ready', ROUTE);
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


/**
 * R8（owner 2026-11-16）：`selectSwapScreenState` 会返回 `route-loading`，但面板没有
 * 这个分支 —— route 为 null 时直接落最终表单，到账显示 —、报价请求根本不发
 * （`quote.enabled` 要求 route ready），用户看到的是一个什么都不动的死界面。
 * 这里锁住：loading 必须有自己的界面，且超时后落成可重试的 route-error。
 */
describe('SwapTokenPanel · route-loading（R8）', () => {
  it('renders an explicit loading screen instead of the final form while the route loads', () => {
    setRoute('loading', null);
    renderPanel();

    expect(screen.getByTestId('swap-route-loading')).toBeVisible();
    expect(screen.getByTestId('swap-route-loading')).toHaveAttribute('aria-busy', 'true');
    // 死界面的特征（最终表单 + 到账 —）不能出现。
    expect(screen.queryByTestId('swap-to-amount')).toBeNull();
    expect(screen.queryByTestId('swap-submit')).toBeNull();
  });

  it('falls back to a retryable route-error card when loading outlives the timeout', async () => {
    vi.useFakeTimers();
    try {
      setRoute('loading', null);
      renderPanel();
      expect(screen.getByTestId('swap-route-loading')).toBeVisible();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });

      expect(screen.queryByTestId('swap-route-loading')).toBeNull();
      expect(screen.getByText('兑换路径读得太久了。')).toBeVisible();
      expect(screen.getByRole('button', { name: '重试' })).toBeEnabled();
      expect(screen.queryByTestId('swap-to-amount')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});


/**
 * 默认使用长期授权 (owner 2026-11-16): 兑换页的授权按钮必须读同一个设备偏好，
 * 按钮文案随之变成「长期授权 {symbol}」，点击后写 maxUint256；关闭时仍是精确额。
 */
describe('SwapTokenPanel · 默认使用长期授权偏好', () => {
  const PREFERENCE_KEY = 'love20:tokenApprovalUseUnlimitedByDefault';

  async function renderWithAmount(amount: string): Promise<ReturnType<typeof vi.fn>> {
    // ERC20 输入需要授权：allowance 0，输入 100。
    balanceState.value = { ...balanceState.value, allowance: 0n };
    const approve = vi.fn();
    txState.value = { ...txState.value, approve };
    setPair(COMMUNITY, ETH);
    setRoute('ready', ROUTE);
    renderPanel();
    fireEvent.change(screen.getByTestId('swap-from-amount'), { target: { value: amount } });
    // The amount input is debounced (400 ms); let the panel see the parsed value.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    return approve;
  }

  it('偏好关闭时按钮=授权 {symbol}，点击写精确额', async () => {
    const approve = await renderWithAmount('0.5');
    const button = screen.getByTestId('swap-approve');
    expect(button).toHaveTextContent('授权 TestLOVE20');
    expect(button).not.toHaveTextContent('长期授权');
    expect(screen.getByTestId('swap-approve-note')).toHaveTextContent(
      '第一次只是允许合约扣走最多这么多的 TestLOVE20',
    );

    fireEvent.click(button);
    expect(approve).toHaveBeenCalledWith(5n * 10n ** 17n);
  });

  it('偏好开启时按钮=长期授权 {symbol}，点击写 maxUint256，提示说明会授权长期额度', async () => {
    window.localStorage.setItem(PREFERENCE_KEY, '1');
    const approve = await renderWithAmount('0.5');
    const button = screen.getByTestId('swap-approve');
    expect(button).toHaveTextContent('长期授权 TestLOVE20');
    expect(screen.getByTestId('swap-approve-note')).toHaveTextContent(
      '这次会授权长期额度（几乎无限）',
    );

    fireEvent.click(button);
    expect(approve).toHaveBeenCalledWith(2n ** 256n - 1n);
  });
});
