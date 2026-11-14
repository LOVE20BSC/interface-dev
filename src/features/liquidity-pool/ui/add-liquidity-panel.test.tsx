import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ADDRESSES } from '@/config/networks';
import type { PoolStateResult } from '@/features/liquidity-pool/model/use-pool-state';
import type { LiquidityToken } from '@/features/liquidity-pool/lib/liquidity-types';
import { AddLiquidityPanel } from '@/features/liquidity-pool/ui/add-liquidity-panel';

/**
 * 加池面板的 QA 缺陷回归（QA D2/D3/D6/D7/D8）。链读、Hub 报价与写链状态机都挡在
 * 模块边界，只渲染真实面板 + 真实纯函数判定，所以这些断言跑在 `pnpm test` 里，
 * 不依赖链（合约库当前在改，e2e 暂缓）。
 */

const SELF = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';

const { quoteState, txState } = vi.hoisted(() => ({
  quoteState: {
    value: {
      data: undefined as
        | {
            usableAmountA: bigint;
            usableAmountB: bigint;
            expectedLiquidity: bigint;
            willSwap: boolean;
          }
        | undefined,
      isLoading: false,
      isError: false,
      refetch: () => {},
    },
  },
  txState: {
    value: {
      stage: 'idle' as const,
      approveStage: 'idle' as const,
      approveHash: null,
      approveRevision: 0,
      receipt: null,
      error: null,
      watch: {
        status: 'idle',
        hash: null,
        receipt: null,
        remainingMs: 0,
        remainingSeconds: 0,
        isStuck: false,
        isSettled: false,
        refresh: () => {},
      },
      approveWatch: {
        status: 'idle',
        hash: null,
        receipt: null,
        remainingMs: 0,
        remainingSeconds: 0,
        isStuck: false,
        isSettled: false,
        refresh: () => {},
      },
      approve: async () => {},
      run: async () => {},
      resubmit: () => {},
      clearReceipt: () => {},
      clearError: () => {},
    },
  },
}));

vi.mock('wagmi', () => ({ useAccount: () => ({ address: SELF }) }));

const { reads } = vi.hoisted(() => ({
  reads: {
    tokenBalance: 10n ** 24n,
    nativeBalance: 10n ** 19n,
    allowance: 10n ** 30n,
  },
}));

vi.mock('@/features/liquidity-pool/model/use-liquidity-reads', () => ({
  useTokenBalance: () => ({
    value: reads.tokenBalance,
    decimals: 18,
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
  useNativeBalance: () => ({
    value: reads.nativeBalance,
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
  useTokenAllowance: () => ({
    value: reads.allowance,
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}));

vi.mock('@/features/liquidity-pool/model/use-hub-quote', () => ({
  useHubQuote: () => quoteState.value,
}));

vi.mock('@/features/liquidity-pool/model/use-liquidity-transaction', () => ({
  useLiquidityTransaction: () => txState.value,
}));

const TOKEN: LiquidityToken = {
  kind: 'community',
  address: ADDRESSES.tokenAddress,
  symbol: 'TestLOVE20',
  decimals: 18,
};
const NATIVE: LiquidityToken = {
  kind: 'native',
  address: undefined,
  symbol: 'ETH',
  decimals: 18,
};
const WRAPPED: LiquidityToken = {
  kind: 'wrapped',
  address: ADDRESSES.weth,
  symbol: 'TestWETH',
  decimals: 18,
};

const PAIR = ADDRESSES.pair;

function pool(overrides: Partial<PoolStateResult>): PoolStateResult {
  return {
    pairAddress: PAIR,
    snapshot: undefined,
    reserves: undefined,
    hasLiquidity: false,
    isEmptyPool: false,
    isLoading: false,
    isError: false,
    refetch: () => {},
    ...overrides,
  };
}

const HYDRATED_POOL = pool({
  snapshot: {
    pairAddress: PAIR,
    token0: ADDRESSES.tokenAddress,
    token1: ADDRESSES.weth,
    reserve0: 2n * 10n ** 23n,
    reserve1: 10n ** 20n,
    totalSupply: 4472135954999579392818n,
    lpBalance: 0n,
  },
  reserves: { reserveToken: 2n * 10n ** 23n, reserveNative: 10n ** 20n },
  hasLiquidity: true,
});

const LOADING_POOL = pool({ isLoading: true });
const EMPTY_POOL = pool({ isEmptyPool: true });

function panelElement(overrides: {
  readonly pool?: PoolStateResult;
  readonly customSlippageError?: string;
}): React.ReactElement {
  return (
    <AddLiquidityPanel
      token={TOKEN}
      wrapped={WRAPPED}
      native={NATIVE}
      pool={overrides.pool ?? HYDRATED_POOL}
      slippagePercent={0.5}
      customSlippage="0.5"
      customSlippageError={overrides.customSlippageError}
      onSelectSlippagePreset={() => {}}
      onCustomSlippageChange={() => {}}
      isConnected
    />
  );
}

function renderPanel(overrides: { pool?: PoolStateResult; customSlippageError?: string } = {}) {
  return render(panelElement(overrides));
}

describe('AddLiquidityPanel · QA 缺陷回归', () => {
  it('D8：原生币单边把「不需要授权」写对，不冒充「已授权」', () => {
    quoteState.value.data = undefined;
    renderPanel();
    const approve = screen.getByTestId('liquidity-add-approve');
    expect(approve).toBeDisabled();
    expect(approve).toHaveTextContent('这一笔不需要代币授权');
    expect(screen.queryByText('这次要用的额度已经够，不需要再授权。')).toBeNull();
  });

  it('D3：池子读取中只说读取中，绝不断言「还没有池子」', () => {
    quoteState.value.data = undefined;
    renderPanel({ pool: LOADING_POOL });
    const note = screen.getByTestId('liquidity-fallback-note');
    expect(note).toHaveTextContent('正在读取池子…');
    expect(note).not.toHaveTextContent('第一次建池只能两侧都填');
  });

  it('D6/D7：只填一侧、显式 0、1 wei 三种状态各有自己的原因', () => {
    quoteState.value.data = undefined;
    renderPanel({ pool: EMPTY_POOL });

    fireEvent.change(screen.getByTestId('liquidity-token-amount'), { target: { value: '100' } });
    expect(screen.getByTestId('liquidity-amount-error')).toHaveTextContent(
      '另一侧的数量还需要填写。',
    );

    fireEvent.change(screen.getByTestId('liquidity-native-amount'), { target: { value: '0' } });
    expect(screen.getByTestId('liquidity-amount-error')).toHaveTextContent('金额必须大于 0。');

    fireEvent.change(screen.getByTestId('liquidity-token-amount'), {
      target: { value: '0.000000000000000001' },
    });
    fireEvent.change(screen.getByTestId('liquidity-native-amount'), {
      target: { value: '0.000000000000000001' },
    });
    expect(screen.getByTestId('liquidity-amount-error')).toHaveTextContent(
      '这笔数量太小，池子配平后没有可用的份额。',
    );
  });

  it('D2：自定义滑点非法时错误在弹层外可见，并挡住提交', () => {
    quoteState.value.data = {
      usableAmountA: 1000n * 10n ** 18n,
      usableAmountB: 5n * 10n ** 17n,
      expectedLiquidity: 22n * 10n ** 18n,
      willSwap: false,
    };
    const view = renderPanel();
    fireEvent.change(screen.getByTestId('liquidity-token-amount'), { target: { value: '1000' } });
    const submit = screen.getByTestId('liquidity-add-submit');
    expect(submit).toBeEnabled();
    expect(screen.queryByTestId('liquidity-slippage-error')).toBeNull();

    view.rerender(
      panelElement({ customSlippageError: '自定义值需要在 0.01% 到 50% 之间。（0.01%–50%）' }),
    );
    expect(screen.getByTestId('liquidity-slippage-error')).toHaveTextContent(
      '自定义值需要在 0.01% 到 50% 之间。',
    );
    expect(screen.getByTestId('liquidity-add-submit')).toBeDisabled();
    expect(screen.getByTestId('liquidity-add-approve')).toBeDisabled();
  });
});
