import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADDRESSES } from '@/config/networks';
import { TransferTokenPanel } from '@/features/transfer-token/ui/transfer-token-panel';

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const PAIR = ADDRESSES.pair;

interface TxMockState {
  stage: 'idle' | 'wallet' | 'pending';
  receipt: Record<string, unknown> | null;
  restoredRecord: Record<string, unknown> | null;
  pendingHash: `0x${string}` | null;
  error: { message: string; kind?: string } | null;
  watch: {
    hash: `0x${string}` | null;
    status: string;
    isStuck: boolean;
    remainingSeconds: number;
    refresh: () => void;
  };
  isHydrating: boolean;
  submit: (request: unknown) => Promise<void>;
  clearReceipt: () => void;
  clearError: () => void;
}

interface BalanceMockState {
  balance: bigint | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const { identityState, catalogState, submitMock, txState, balanceState } = vi.hoisted(() => {
  const submitMock = vi.fn((_request: unknown) => new Promise<void>(() => {}));
  return {
    identityState: {
      value: {
        status: 'idle' as string,
        memberId: null as bigint | null,
        name: null as string | null,
        address: null as string | null,
        namePending: false,
        retry: () => {},
      },
    },
    catalogState: { decimals: 18 },
    submitMock,
    txState: {
      value: {
        stage: 'idle',
        receipt: null,
        restoredRecord: null,
        pendingHash: null,
        error: null,
        watch: {
          hash: null,
          status: 'idle',
          isStuck: false,
          remainingSeconds: 0,
          refresh: () => {},
        },
        isHydrating: false,
        submit: submitMock,
        clearReceipt: () => {},
        clearError: () => {},
      } as TxMockState,
    },
    balanceState: {
      value: {
        balance: 10000000000000000000000n as bigint | undefined,
        isLoading: false,
        isError: false,
        refetch: () => {},
      } as BalanceMockState,
    },
  };
});

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: SELF }),
  // A real RPC returns undefined/null for an EOA (wagmi surfaces null) and the
  // deployed bytecode for a contract; both must not be mistaken for each other.
  useBytecode: ({ address }: { address?: string }) => ({
    data: address !== undefined && address.toLowerCase() === PAIR.toLowerCase() ? '0x6080' : null,
  }),
}));

vi.mock('@/features/transfer-token/model/use-transfer-catalog', () => ({
  useTransferCatalog: () => ({
    nativeToken: {
      kind: 'native',
      address: undefined,
      symbol: 'ETH',
      decimals: catalogState.decimals,
    },
    communityTokens: [
      {
        kind: 'community',
        address: ADDRESSES.tokenAddress,
        symbol: 'TestLOVE20',
        decimals: 18,
      },
    ],
    wrappedToken: undefined,
    lpToken: undefined,
    searchResults: [],
    searchStatus: 'idle',
    search: '',
    setSearch: () => {},
    hasMore: false,
    loadMore: () => {},
    isLoading: false,
    custom: { status: 'idle', token: undefined, address: undefined, retry: () => {} },
    addCustomToken: () => {},
    clearCustomToken: () => {},
  }),
}));

vi.mock('@/features/transfer-token/model/use-transfer-balance', () => ({
  // Defaults to 10,000 ETH, the same initial state as the three-line chain.
  useTransferBalance: () => balanceState.value,
}));

vi.mock('@/features/transfer-token/model/use-identity-recipient', () => ({
  useIdentityRecipient: () => identityState.value,
}));

vi.mock('@/features/transfer-token/model/use-transfer-transaction', () => ({
  useTransferTransaction: () => txState.value,
}));

function renderPanel(initialMode?: 'address' | 'member' | 'name'): void {
  render(
    <MemoryRouter>
      <TransferTokenPanel
        isConnected
        isWrongChain={false}
        connectAction={<button type="button">连接钱包</button>}
        initialMode={initialMode}
      />
    </MemoryRouter>,
  );
}

function submitButton(): HTMLElement {
  return screen.getByTestId('transfer-submit');
}

function fillAmount(value: string): void {
  fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value } });
}

function fillRecipient(value: string): void {
  fireEvent.change(screen.getByTestId('transfer-recipient'), { target: { value } });
}

beforeEach(() => {
  // 智能资产保护 is a device preference; every test starts from the shipped default (on).
  window.localStorage.clear();
  identityState.value = {
    status: 'idle',
    memberId: null,
    name: null,
    address: null,
    namePending: false,
    retry: () => {},
  };
  catalogState.decimals = 18;
  txState.value = {
    stage: 'idle',
    receipt: null,
    restoredRecord: null,
    pendingHash: null,
    error: null,
    watch: { hash: null, status: 'idle', isStuck: false, remainingSeconds: 0, refresh: () => {} },
    isHydrating: false,
    submit: submitMock,
    clearReceipt: () => {},
    clearError: () => {},
  };
  balanceState.value = {
    balance: 10000000000000000000000n,
    isLoading: false,
    isError: false,
    refetch: () => {},
  };
  submitMock.mockClear();
});

describe('TransferTokenPanel 布局与余额（owner 2026-11-16 布局）', () => {
  it('puts the balance under the amount as small muted text, not above it', () => {
    renderPanel();
    // The first line of the amount block is 转账金额 + the amount input; the
    // balance is a small muted line *below* the amount row, with a symbol.
    expect(screen.queryByText('代币')).toBeNull();
    const amount = screen.getByTestId('transfer-amount');
    const balance = screen.getByTestId('transfer-balance');
    expect(amount.compareDocumentPosition(balance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(balance).toHaveTextContent('余额 10,000 ETH');
    expect(balance.className).toContain('text-muted');
    expect(screen.queryByText(/精度/)).toBeNull();
  });

  it('writes the precision only when it is not the 18-digit default', () => {
    catalogState.decimals = 20;
    renderPanel();
    expect(screen.getByTestId('transfer-balance')).toHaveTextContent('余额 100 ETH');
    expect(screen.getByTestId('transfer-decimals')).toHaveTextContent('精度 20 位');
  });

  it('puts the token picker on the amount row, after the input', () => {
    renderPanel();
    const recipient = screen.getByTestId('transfer-recipient');
    const amount = screen.getByTestId('transfer-amount');
    expect(
      recipient.compareDocumentPosition(amount) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The selected token trigger is the amount row's right-hand control.
    expect(
      amount.compareDocumentPosition(screen.getByTestId('transfer-token')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId('transfer-recipient-mode')).toHaveTextContent('按地址');
  });
});

describe('TransferTokenPanel 按地址', () => {
  it('enables the CTA only for a positive amount and a valid non-self address', () => {
    renderPanel();
    expect(submitButton()).toBeDisabled();

    fillAmount('0.1');
    expect(submitButton()).toBeDisabled();

    fillRecipient(OTHER);
    expect(submitButton()).toBeEnabled();
    // A plain wallet must never show the contract-recipient warning.
    expect(screen.queryByTestId('transfer-contract-warning')).toBeNull();
    expect(screen.queryByTestId('transfer-protection')).toBeNull();
    // …but the shared protection switch is always available on the card.
    expect(screen.getByTestId('asset-protection')).toBeVisible();

    fillAmount('0');
    expect(screen.getByTestId('transfer-amount-error')).toHaveTextContent('金额必须大于 0');
    expect(submitButton()).toBeDisabled();

    fillAmount('0.1');
    fillRecipient(SELF);
    expect(screen.getByText('不能转给自己。')).toBeVisible();
    expect(submitButton()).toBeDisabled();
  });

  it('intercepts a known address-book contract while 智能资产保护 is on (default)', () => {
    renderPanel();
    fillAmount('0.1');
    fillRecipient(PAIR);

    expect(screen.getByTestId('asset-protection-toggle')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('transfer-protection')).toBeVisible();
    expect(screen.getByText('智能资产保护已拦截：这是「交易对」合约地址')).toBeVisible();
    // The interception offers no page-level checkbox: the only way forward is the
    // shared switch (the explicit way to force the transfer).
    expect(screen.queryByTestId('transfer-known-ack')).toBeNull();
    expect(submitButton()).toBeDisabled();
  });

  it('skips only the known-contract half once 智能资产保护 is turned off', () => {
    renderPanel();
    fillAmount('0.1');
    fillRecipient(PAIR);

    fireEvent.click(screen.getByTestId('asset-protection-toggle'));
    expect(screen.getByTestId('asset-protection-toggle')).toHaveAttribute('aria-checked', 'false');
    // 关闭 = 只跳过已知合约检测：已知合约块与勾选都不再出现……
    expect(screen.queryByTestId('transfer-protection')).toBeNull();
    expect(screen.queryByTestId('transfer-known-ack')).toBeNull();
    // ……同一地址按任意合约（有 bytecode）只警告，不再拦截。
    expect(screen.getByTestId('transfer-contract-warning')).toHaveTextContent('这个地址是一个合约');
    expect(submitButton()).toBeEnabled();

    // Turning protection back on re-blocks the same recipient.
    fireEvent.click(screen.getByTestId('asset-protection-toggle'));
    expect(screen.getByTestId('transfer-protection')).toBeVisible();
    expect(submitButton()).toBeDisabled();
  });

  it('shows the insufficient-balance reason with the exact shortfall', () => {
    renderPanel();
    fillAmount('10000');
    fillRecipient(OTHER);

    // 10,000 ETH balance − 0.001 native fee reserve = 9,999.999 spendable.
    expect(screen.getByTestId('transfer-amount-error')).toHaveTextContent('ETH 不够，还差 0.001');
    expect(submitButton()).toBeDisabled();
  });

  it('submits the parsed wei amount to the resolved address', () => {
    renderPanel();
    fillAmount('1.5');
    fillRecipient(OTHER);
    fireEvent.click(submitButton());

    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1500000000000000000n,
        recipient: OTHER,
        recipientLabel: undefined,
      }),
    );
  });
});

describe('TransferTokenPanel 按身份 NFT', () => {
  it('resolves the id, shows the identity and requires the confirmation checkbox', () => {
    identityState.value = {
      status: 'ok',
      memberId: 2n,
      name: 'Testdev-member-1',
      address: OTHER,
      namePending: false,
      retry: () => {},
    };
    renderPanel('member');

    expect(screen.getByTestId('transfer-recipient-mode')).toHaveTextContent('按身份 NFT ID');
    expect(screen.getByTestId('transfer-recipient')).toHaveAttribute(
      'placeholder',
      '#身份 NFT 编号',
    );

    fillAmount('2.5');
    fillRecipient('#2');

    expect(screen.getByTestId('transfer-identity-summary')).toBeVisible();
    expect(screen.getByText('身份 NFT #2 Testdev-member-1')).toBeVisible();
    expect(screen.getByTestId('transfer-identity-recipient')).toHaveTextContent('0x7099');
    expect(submitButton()).toBeDisabled();

    fireEvent.click(screen.getByTestId('transfer-identity-ack'));
    expect(submitButton()).toBeEnabled();

    fireEvent.click(submitButton());
    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2500000000000000000n,
        recipient: OTHER,
        recipientLabel: '身份 NFT #2 Testdev-member-1',
      }),
    );
  });

  it('keeps the name mode distinct from the id mode', () => {
    identityState.value = {
      status: 'ok',
      memberId: 2n,
      name: 'Testdev-member-1',
      address: OTHER,
      namePending: false,
      retry: () => {},
    };
    renderPanel('name');

    expect(screen.getByTestId('transfer-recipient-mode')).toHaveTextContent('按身份 NFT 名字');
    expect(screen.getByTestId('transfer-recipient')).toHaveAttribute(
      'placeholder',
      '身份 NFT 名字',
    );

    // A pure-digit string is looked up as a NAME in this mode, never as an id:
    // the resolver is called with name mode and the summary still shows the
    // canonical name + id it resolved to.
    fillRecipient('123456');
    expect(screen.getByTestId('transfer-identity-summary')).toBeVisible();
    expect(screen.getByText('身份 NFT #2 Testdev-member-1')).toBeVisible();
    expect(submitButton()).toBeDisabled();
  });

  it('shows the mode-specific not-found message', () => {
    identityState.value = {
      status: 'not-found',
      memberId: null,
      name: null,
      address: null,
      namePending: false,
      retry: () => {},
    };
    renderPanel('member');
    fillRecipient('#999');

    expect(screen.getByText('这个身份 NFT 不存在。')).toBeVisible();
    expect(submitButton()).toBeDisabled();
  });
});

describe('TransferTokenPanel 在途/恢复态（D1/D2）', () => {
  it('keeps the CTA disabled and explains that the pending transfer blocks a new one', () => {
    txState.value.pendingHash = `0x${'ab'.repeat(32)}`;
    txState.value.stage = 'pending';
    txState.value.watch = {
      hash: txState.value.pendingHash,
      status: 'pending',
      isStuck: false,
      remainingSeconds: 30,
      refresh: () => {},
    };
    renderPanel();
    fillAmount('0.1');
    fillRecipient(OTHER);

    expect(submitButton()).toBeDisabled();
    expect(screen.getByTestId('transfer-submit-note')).toHaveTextContent(
      '这笔转账还在确认中，确认后可以再转下一笔。',
    );
    expect(screen.getByTestId('tx-watch-pending')).toBeVisible();
  });

  it('never leaves a clickable but silent CTA when the recovery card is up (D2)', () => {
    txState.value.pendingHash = `0x${'ab'.repeat(32)}`;
    txState.value.stage = 'idle';
    txState.value.watch = {
      hash: txState.value.pendingHash,
      status: 'dropped',
      isStuck: true,
      remainingSeconds: 0,
      refresh: () => {},
    };
    renderPanel();
    fillAmount('0.1');
    fillRecipient(OTHER);

    expect(submitButton()).toBeDisabled();
    expect(screen.getByTestId('transfer-submit-note')).toHaveTextContent(
      '上面这笔还没有结果，请稍后在钱包或区块浏览器里查看。',
    );
    expect(screen.getByTestId('tx-watch-recovery')).toBeVisible();
  });
});

describe('TransferTokenPanel 余额门禁（D3/D5）', () => {
  it('blocks submission while the balance is unreadable and says so (D3)', () => {
    balanceState.value = {
      balance: undefined,
      isLoading: false,
      isError: true,
      refetch: () => {},
    };
    renderPanel();
    fillAmount('0.1');
    fillRecipient(OTHER);

    expect(screen.getByTestId('transfer-balance')).toHaveTextContent('余额暂时读不到');
    expect(submitButton()).toBeDisabled();
    expect(screen.getByTestId('transfer-submit-note')).toHaveTextContent(
      '余额暂时读不到，稍后重试。',
    );
  });

  it('disables 全部 at a zero spendable balance instead of filling an invalid 0 (D5)', () => {
    balanceState.value = { ...balanceState.value, balance: 0n };
    renderPanel();

    const max = screen.getByTestId('transfer-max');
    expect(max).toBeDisabled();
    fireEvent.click(max);
    expect(screen.getByTestId('transfer-amount')).toHaveValue('');
    expect(screen.queryByTestId('transfer-amount-error')).toBeNull();
  });

  it('keeps 全部 enabled with a positive balance and fills the spendable amount', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('transfer-max'));
    // 10,000 ETH − 0.001 native fee reserve.
    expect(screen.getByTestId('transfer-amount')).toHaveValue('9999.999');
  });
});

describe('TransferTokenPanel 身份门禁（D6/D7）', () => {
  it('keeps ID and name inputs apart, so a mode switch never reinterprets #2 (D6)', () => {
    identityState.value = {
      status: 'ok',
      memberId: 2n,
      name: 'Testdev-member-1',
      address: OTHER,
      namePending: false,
      retry: () => {},
    };
    renderPanel('member');
    const input = screen.getByTestId('transfer-recipient');

    fillAmount('0.5');
    fillRecipient('#2');
    fireEvent.click(screen.getByTestId('transfer-identity-ack'));
    expect(submitButton()).toBeEnabled();

    // Switch to the name mode: its own input is empty, so the id text cannot be
    // looked up as a name (the QA saw 「没有找到这个名称对应的身份 NFT。」).
    fireEvent.click(screen.getByTestId('transfer-recipient-mode'));
    fireEvent.click(screen.getByTestId('transfer-mode-name'));
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', '身份 NFT 名字');
    expect(screen.queryByText('没有找到这个名称对应的身份 NFT。')).toBeNull();
    expect(submitButton()).toBeDisabled();

    // Switching back restores the id input but not the acknowledgement.
    fireEvent.click(screen.getByTestId('transfer-recipient-mode'));
    fireEvent.click(screen.getByTestId('transfer-mode-member'));
    expect(input).toHaveValue('#2');
    expect(screen.getByTestId('transfer-identity-ack')).not.toBeChecked();
    expect(submitButton()).toBeDisabled();
  });

  it('holds the identity gate closed while the canonical name is still loading (D7)', () => {
    identityState.value = {
      status: 'ok',
      memberId: 2n,
      name: null,
      address: OTHER,
      namePending: true,
      retry: () => {},
    };
    renderPanel('member');
    fillAmount('0.1');
    fillRecipient('#2');

    expect(screen.getByTestId('transfer-identity-name-reading')).toHaveTextContent(
      '正在读取身份名字…',
    );
    expect(screen.queryByTestId('transfer-identity-summary')).toBeNull();
    expect(screen.queryByTestId('transfer-identity-ack')).toBeNull();
    expect(submitButton()).toBeDisabled();
  });
});

describe('TransferTokenPanel 成功条恢复（D4）', () => {
  it('restores the success strip with a checkable hash after a refresh', () => {
    txState.value.restoredRecord = {
      hash: `0x${'ef'.repeat(32)}`,
      tokenSymbol: 'TestLOVE20',
      tokenDecimals: 18,
      native: false,
      amount: 1000000000000000000n,
      recipient: OTHER,
      recipientLabel: undefined,
      recordedAt: 1,
    };
    renderPanel();

    expect(screen.getByTestId('transfer-success-strip-amount')).toHaveTextContent(
      '已转出 1 TestLOVE20',
    );
    expect(screen.getByTestId('transfer-success-strip-hash')).toHaveTextContent(
      `0x${'ef'.repeat(32)}`,
    );
    expect(screen.getByTestId('transfer-success-strip-copy')).toBeVisible();
    // The receipt sheet must never be replayed by the restore (owner rule).
    expect(screen.queryByTestId('transfer-receipt-amount')).toBeNull();
  });
});
