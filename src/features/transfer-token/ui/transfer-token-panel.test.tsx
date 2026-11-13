import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADDRESSES } from '@/config/networks';
import { TransferTokenPanel } from '@/features/transfer-token/ui/transfer-token-panel';

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const PAIR = ADDRESSES.pair;

const { identityState, submitMock } = vi.hoisted(() => ({
  identityState: {
    value: {
      status: 'idle' as string,
      memberId: null as bigint | null,
      name: null as string | null,
      address: null as string | null,
      retry: () => {},
    },
  },
  submitMock: vi.fn(),
}));

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
    nativeToken: { kind: 'native', address: undefined, symbol: 'ETH', decimals: 18 },
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
  useTransferBalance: () => ({
    // 10,000 ETH, the same initial state as the three-line verification chain.
    balance: 10000000000000000000000n,
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}));

vi.mock('@/features/transfer-token/model/use-identity-recipient', () => ({
  useIdentityRecipient: () => identityState.value,
}));

vi.mock('@/features/transfer-token/model/use-transfer-transaction', () => ({
  useTransferTransaction: () => ({
    stage: 'idle',
    receipt: null,
    pendingHash: null,
    error: null,
    watch: { hash: null, status: 'idle', isStuck: false, remainingSeconds: 0, refresh: () => {} },
    resubmit: () => {},
    submit: submitMock,
    clearReceipt: () => {},
    clearError: () => {},
  }),
}));

function renderPanel(): void {
  render(
    <MemoryRouter>
      <TransferTokenPanel
        isConnected
        isWrongChain={false}
        connectAction={<button type="button">连接钱包</button>}
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
  identityState.value = {
    status: 'idle',
    memberId: null,
    name: null,
    address: null,
    retry: () => {},
  };
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

    fillAmount('0');
    expect(screen.getByTestId('transfer-amount-error')).toHaveTextContent('金额必须大于 0');
    expect(submitButton()).toBeDisabled();

    fillAmount('0.1');
    fillRecipient(SELF);
    expect(screen.getByText('不能转给自己。')).toBeVisible();
    expect(submitButton()).toBeDisabled();
  });

  it('blocks a known address-book contract behind an explicit acknowledgement', () => {
    renderPanel();
    fillAmount('0.1');
    fillRecipient(PAIR);

    expect(screen.getByTestId('transfer-protection')).toBeVisible();
    expect(screen.getByText('这是「交易对」合约地址')).toBeVisible();
    expect(submitButton()).toBeDisabled();

    fireEvent.click(screen.getByTestId('transfer-known-ack'));
    expect(submitButton()).toBeEnabled();
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
  it('shows the resolved identity and requires the confirmation checkbox', () => {
    identityState.value = {
      status: 'ok',
      memberId: 2n,
      name: 'Testdev-member-1',
      address: OTHER,
      retry: () => {},
    };
    renderPanel();

    fireEvent.click(screen.getByTestId('transfer-mode-identity'));
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
});
