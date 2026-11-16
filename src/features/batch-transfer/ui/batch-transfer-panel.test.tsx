import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ADDRESSES } from '@/config/networks';
import { BatchTransferPanel } from '@/features/batch-transfer/ui/batch-transfer-panel';

/**
 * 全局精度显示统一 (owner 2026-11-14: 「只有18位不显示精度，其他都要显示」).
 *
 * 批量转账的资产行此前无条件写「精度 18 位」，这里锁住共享规则：18 位不渲染精度
 * 字样，其它精度（含 6 位）照常显示。批量表单的其余行为由 e2e 覆盖。
 */

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const { catalogState, balanceState, txState, codesState, balancesState } = vi.hoisted(() => ({
  codesState: { value: [] as boolean[] },
  /**
   * 预余额读（owner 2026-11-17）：values 对齐表里的行；`isFetching` 覆盖「刷新中」，
   * 与 `isLoading`（首读）分开，因为刷新时旧数字必须留在屏幕上。
   */
  balancesState: {
    value: {
      values: [] as readonly (bigint | undefined)[],
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: () => {},
    },
  },
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
  useBatchRecipientBalances: () => balancesState.value,
  useBatchBalanceReader: () => async () => [],
}));

vi.mock('@/features/batch-transfer/model/use-batch-recipient-codes', () => ({
  useBatchRecipientCodes: () => codesState.value,
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
  // 智能资产保护 is a device preference; every test starts from the shipped default (on).
  window.localStorage.clear();
  // No recipient reads bytecode by default; tests that need the generic contract
  // warning set the per-row flags themselves.
  codesState.value = [];
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
  balancesState.value = {
    values: [],
    isLoading: false,
    isFetching: false,
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

describe('BatchTransferPanel 智能资产保护（owner 2026-11-16）', () => {
  const PAIR = ADDRESSES.pair as string;

  function fillBatch(value: string): void {
    fireEvent.change(screen.getByTestId('batch-transfer-input'), { target: { value } });
  }

  it('shares the same switch and default as 代币转账', () => {
    renderPanel();
    expect(screen.getByText('智能资产保护')).toBeVisible();
    expect(screen.getByTestId('asset-protection-toggle')).toHaveAttribute('aria-checked', 'true');
  });

  it('intercepts a batch that names a known address-book contract while on', () => {
    renderPanel();
    fillBatch(`${PAIR} 0.1`);

    const panel = screen.getByTestId('batch-transfer-known-contract');
    expect(panel).toHaveTextContent('有 1 行是协议合约，智能资产保护已拦截');
    expect(panel).toHaveTextContent('第 1 行：这是「交易对」合约地址');
    expect(screen.getByTestId('batch-transfer-submit')).toBeDisabled();
  });

  it('merges the known and generic contract prompts into one block', () => {
    const token = ADDRESSES.tokenAddress as string;
    // Row 1 = 地址簿已知合约（交易对），row 2 = 有 bytecode 的任意合约。
    codesState.value = [true, true];
    renderPanel();
    fillBatch(`${PAIR} 0.1\n${token} 0.2`);

    const merged = screen.getByTestId('batch-transfer-known-contract');
    expect(merged).toHaveTextContent('有 1 行是协议合约、1 行是其它合约地址，智能资产保护已拦截');
    expect(screen.getByTestId('batch-transfer-known-line-1')).toHaveTextContent(
      '第 1 行：这是「交易对」合约地址',
    );
    expect(screen.getByTestId('batch-transfer-contract-line-2')).toHaveTextContent(
      '第 2 行：这是一个合约地址',
    );
    // 合并成一块：通用合约警告不与它并存。
    expect(screen.queryByTestId('batch-transfer-contract-warning')).toBeNull();
    expect(screen.getByTestId('batch-transfer-submit')).toBeDisabled();
  });

  it('falls back to the generic contract warning once the switch is off', () => {
    // 开关关闭后已知合约不再被点名；它按「有 bytecode 的任意合约」落到通用警告。
    codesState.value = [true];
    renderPanel();
    fillBatch(`${PAIR} 0.1`);
    expect(screen.getByTestId('batch-transfer-submit')).toBeDisabled();

    fireEvent.click(screen.getByTestId('asset-protection-toggle'));
    // 已知合约块完全消失（不再出现「这是交易对合约」），只剩通用警告。
    expect(screen.queryByTestId('batch-transfer-known-contract')).toBeNull();
    expect(screen.getByTestId('batch-transfer-contract-warning')).toHaveTextContent(
      '有收款方是合约地址',
    );
    expect(screen.getByTestId('batch-transfer-submit')).toBeEnabled();
  });

  it('never blocks a batch of plain wallets', () => {
    renderPanel();
    fillBatch('0x70997970C51812dc3A010C7d01b50e0d17dc79C8 0.1');
    expect(screen.queryByTestId('batch-transfer-known-contract')).toBeNull();
    expect(screen.getByTestId('batch-transfer-submit')).toBeEnabled();
  });
});

/**
 * 预余额表常驻刷新（owner 2026-11-17）：表头「刷新」随时重读整批余额，刷新期间
 * 保留已有数字、禁止提交；刷新后的读数就是提交时写进回执的「到账前」基线。
 * 读失败时同一个按钮承担 D6 的恢复职责（表下只留错误说明，不再并列第二个按钮）。
 */
describe('BatchTransferPanel 预余额刷新（owner 2026-11-17）', () => {
  const PLAIN = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const TEN_THOUSAND_ETH = 10_000n * 10n ** 18n;

  function fillBatch(value: string): void {
    fireEvent.change(screen.getByTestId('batch-transfer-input'), { target: { value } });
  }

  function setBalances(patch: Partial<(typeof balancesState)['value']>): void {
    balancesState.value = { ...balancesState.value, ...patch };
  }

  it('表头按钮常驻，点它重新读取整批余额', () => {
    const refetch = vi.fn();
    setBalances({ values: [TEN_THOUSAND_ETH], refetch });
    renderPanel();
    fillBatch(`${PLAIN} 0.1`);

    const refresh = screen.getByTestId('batch-transfer-rows-refresh');
    // 读到余额时按钮也在（不是只有失败态才出现），可访问名点明刷的是什么。
    expect(refresh).toBeVisible();
    expect(refresh).toBeEnabled();
    expect(refresh).toHaveAccessibleName('刷新收款方当前余额');

    fireEvent.click(refresh);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('刷新中保留已有数字、按钮 busy 且禁止提交', () => {
    // 首读已完成（isLoading=false）后再刷新：旧读数必须留在屏幕上。
    setBalances({ values: [TEN_THOUSAND_ETH], isFetching: true });
    renderPanel();
    fillBatch(`${PLAIN} 0.1`);

    expect(screen.getByTestId('batch-transfer-row-balance-0')).toHaveTextContent('10,000');
    expect(screen.queryByText('—')).toBeNull();
    const refresh = screen.getByTestId('batch-transfer-rows-refresh');
    expect(refresh).toHaveAttribute('aria-busy', 'true');
    expect(refresh).toBeDisabled();
    // 刷新未落地 → 基线不可信 → 主按钮禁用。
    expect(screen.getByTestId('batch-transfer-submit')).toBeDisabled();
  });

  it('刷新落地后主按钮恢复可提交', () => {
    setBalances({ values: [TEN_THOUSAND_ETH], isFetching: false });
    renderPanel();
    fillBatch(`${PLAIN} 0.1`);
    expect(screen.getByTestId('batch-transfer-rows-refresh')).toBeEnabled();
    expect(screen.getByTestId('batch-transfer-submit')).toBeEnabled();
  });

  it('交易进行中禁用刷新', () => {
    txState.value = { ...txState.value, stage: 'pending' };
    setBalances({ values: [TEN_THOUSAND_ETH] });
    renderPanel();
    fillBatch(`${PLAIN} 0.1`);

    expect(screen.getByTestId('batch-transfer-rows-refresh')).toBeDisabled();
  });

  it('读失败：说明文字保留，同一个刷新按钮就是恢复入口（不并列第二个按钮）', () => {
    setBalances({ values: [undefined], isError: true });
    renderPanel();
    fillBatch(`${PLAIN} 0.1`);

    expect(screen.getByTestId('batch-transfer-row-balance-0')).toHaveTextContent('—');
    expect(screen.getByTestId('batch-transfer-rows-error')).toHaveTextContent(
      '收款方余额暂时读不到',
    );
    const refresh = screen.getByTestId('batch-transfer-rows-refresh');
    expect(refresh).toBeEnabled();
    expect(screen.queryByTestId('batch-transfer-rows-retry')).toBeNull();
    // D6：读失败仍是可提交态（回执会明确写「核对不完整」），不被刷新按钮挤成阻断。
    expect(screen.getByTestId('batch-transfer-submit')).toBeEnabled();
  });
});
