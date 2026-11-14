import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ADDRESSES } from '@/config/networks';
import type { CommunityToken } from '@/entities/community-token/model/use-community-token';
import type { LiquidityCatalog } from '@/features/liquidity-pool/model/use-liquidity-catalog';
import type { PoolStateResult } from '@/features/liquidity-pool/model/use-pool-state';
import { LiquidityPage } from '@/features/liquidity-pool/ui/liquidity-page';

/**
 * 页面级 QA 回归（QA D4/D5/D10）：社区解析失败不顶替、切社区清掉自定义代币、
 * 三个页签面板常驻（切走不卸载，所以已填金额与展开的详情不会丢）。
 *
 * 子面板用 stub 替身：本文件只验证页面的挂载/隐藏与状态失效逻辑，面板内部行为由
 * `add-liquidity-panel.test.tsx` 与 e2e 覆盖。
 */

const SELF = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';

const { communityState, catalogState, clearCustomTokenMock } = vi.hoisted(() => ({
  communityState: {
    value: {
      status: 'ready',
      address: undefined as string | undefined,
      name: 'TestLOVE20',
      symbol: 'TestLOVE20',
      decimals: 18 as number | undefined,
      isMetadataLoading: false,
      metadataError: false,
      refetch: () => {},
    },
  },
  catalogState: { value: {} as unknown },
  clearCustomTokenMock: vi.fn(),
}));

vi.mock('wagmi', () => ({ useAccount: () => ({ address: SELF }) }));

vi.mock('@/features/switch-community/model/use-community-context', () => ({
  useCommunityContext: () => ({
    symbol: communityState.value.symbol,
    fromUrl: true,
    switchSymbol: () => {},
  }),
}));

vi.mock('@/entities/community-token/model/use-community-token', () => ({
  useCommunityToken: () => communityState.value as unknown as CommunityToken,
}));

vi.mock('@/features/liquidity-pool/model/use-pool-state', () => ({
  usePoolState: () => catalogState.value as PoolStateResult,
}));

vi.mock('@/features/liquidity-pool/model/use-liquidity-catalog', () => ({
  useLiquidityCatalog: () => catalogState.value as LiquidityCatalog,
}));

vi.mock('@/features/liquidity-pool/ui/add-liquidity-panel', () => ({
  AddLiquidityPanel: () => <div data-testid="stub-add">add</div>,
}));
vi.mock('@/features/liquidity-pool/ui/my-liquidity-panel', () => ({
  MyLiquidityPanel: () => <div data-testid="stub-mine">mine</div>,
}));
vi.mock('@/features/liquidity-pool/ui/pool-query-panel', () => ({
  PoolQueryPanel: () => <div data-testid="stub-query">query</div>,
}));

const TOKEN = {
  kind: 'community' as const,
  address: ADDRESSES.tokenAddress,
  symbol: 'TestLOVE20',
  decimals: 18,
};

function makeCatalog(overrides: Partial<LiquidityCatalog> = {}): LiquidityCatalog {
  return {
    nativeToken: { kind: 'native', address: undefined, symbol: 'ETH', decimals: 18 },
    wrappedToken: {
      kind: 'wrapped',
      address: ADDRESSES.weth,
      symbol: 'TestWETH',
      decimals: 18,
    },
    communityTokens: [TOKEN],
    searchResults: [],
    searchStatus: 'idle',
    search: '',
    setSearch: () => {},
    hasMore: false,
    loadMore: () => {},
    isLoading: false,
    custom: { status: 'idle', token: undefined, retry: () => {} },
    addCustomToken: () => {},
    clearCustomToken: clearCustomTokenMock,
    customInput: '',
    setCustomInput: () => {},
    ...overrides,
  };
}

const POOL: PoolStateResult = {
  pairAddress: ADDRESSES.pair,
  snapshot: undefined,
  reserves: { reserveToken: 2n * 10n ** 23n, reserveNative: 10n ** 20n },
  hasLiquidity: true,
  isEmptyPool: false,
  isLoading: false,
  isError: false,
  refetch: () => {},
};

function renderPage() {
  return render(
    <MemoryRouter>
      <LiquidityPage isConnected isWrongChain={false} connectAction={null} />
    </MemoryRouter>,
  );
}

function reset(): void {
  communityState.value = {
    status: 'ready',
    address: ADDRESSES.tokenAddress,
    name: 'TestLOVE20',
    symbol: 'TestLOVE20',
    decimals: 18,
    isMetadataLoading: false,
    metadataError: false,
    refetch: () => {},
  };
  catalogState.value = POOL; // catalog is replaced below; kept for readability
  clearCustomTokenMock.mockClear();
}

describe('LiquidityPage · QA 缺陷回归', () => {
  it('D10：三个页签面板都常驻，切走只是隐藏，切回不重新挂载', () => {
    reset();
    catalogState.value = makeCatalog();
    renderPage();

    expect(screen.getByTestId('stub-add')).toBeInTheDocument();
    expect(screen.getByTestId('stub-mine')).toBeInTheDocument();
    expect(screen.getByTestId('stub-query')).toBeInTheDocument();
    // 非活动页签的面板在 DOM 里但不显示（所以内部表单状态不丢）。
    expect(screen.getByTestId('stub-mine').closest('[hidden]')).not.toBeNull();

    fireEvent.click(screen.getByTestId('liquidity-tab-query'));
    expect(screen.getByTestId('stub-add').closest('[hidden]')).not.toBeNull();
    expect(screen.getByTestId('stub-query').closest('[hidden]')).toBeNull();

    fireEvent.click(screen.getByTestId('liquidity-tab-add'));
    expect(screen.getByTestId('stub-add').closest('[hidden]')).toBeNull();
  });

  it('D4：社区 symbol 解析不到时不拿目录第一个代币顶替', () => {
    reset();
    communityState.value = {
      status: 'unknown',
      address: undefined,
      name: 'NoSuchCommunity99',
      symbol: 'NoSuchCommunity99',
      decimals: undefined,
      isMetadataLoading: false,
      metadataError: false,
      refetch: () => {},
    };
    catalogState.value = makeCatalog();
    renderPage();

    expect(screen.getByTestId('liquidity-community-unknown')).toBeInTheDocument();
    expect(screen.queryByTestId('liquidity-token')).toBeNull();
    expect(screen.queryByTestId('stub-add')).toBeNull();
    expect(screen.queryByTestId('stub-query')).toBeNull();
  });

  it('D5：切社区时清掉自定义代币选择', () => {
    reset();
    catalogState.value = makeCatalog();
    const view = renderPage();
    expect(clearCustomTokenMock).not.toHaveBeenCalled();

    communityState.value = {
      ...communityState.value,
      symbol: 'TestCMTOK1',
      name: 'TestCMTOK1',
      address: '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF',
      status: 'ready',
      decimals: 18,
    };
    view.rerender(
      <MemoryRouter>
        <LiquidityPage isConnected isWrongChain={false} connectAction={null} />
      </MemoryRouter>,
    );
    expect(clearCustomTokenMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * 全局精度显示统一 (owner 2026-11-14: 「只有18位不显示精度，其他都要显示」).
 * 自定义代币读取成功那行此前无条件写「精度 N 位」，现在 18 位只写符号。
 */
describe('LiquidityPage · 精度字样', () => {
  function customToken(decimals: number) {
    return {
      status: 'ok' as const,
      token: {
        kind: 'custom' as const,
        address: '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF' as const,
        symbol: 'TestCMT',
        decimals,
      },
      retry: () => {},
    };
  }

  it('18 位精度的自定义代币不渲染「精度」字样', () => {
    reset();
    catalogState.value = makeCatalog({ custom: customToken(18) });
    renderPage();

    fireEvent.click(screen.getByTestId('liquidity-custom-toggle'));
    expect(screen.getByTestId('liquidity-custom-ok')).toHaveTextContent(/^TestCMT$/);
    expect(screen.queryByText(/精度/)).toBeNull();
  });

  it('非 18 位精度照常显示「精度 N 位」', () => {
    reset();
    catalogState.value = makeCatalog({ custom: customToken(6) });
    renderPage();

    fireEvent.click(screen.getByTestId('liquidity-custom-toggle'));
    expect(screen.getByTestId('liquidity-custom-ok')).toHaveTextContent('TestCMT · 精度 6 位');
  });
});
