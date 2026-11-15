import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADDRESSES } from '@/config/networks';
import { TransferForm } from '@/features/transfer-identity/ui/transfer-drawer';
import { canSubmitTransfer } from '@/features/transfer-identity/lib/transfer-submit';

const PAIR = ADDRESSES.pair;
const TOKEN_CONTRACT = ADDRESSES.tokenAddress;

// A known address-book contract and an arbitrary contract both have bytecode; an
// EOA does not (wagmi surfaces null/undefined).
vi.mock('wagmi', () => ({
  useBytecode: ({ address }: { address?: string }) => ({
    data:
      address !== undefined &&
      [PAIR.toLowerCase(), TOKEN_CONTRACT.toLowerCase()].includes(address.toLowerCase())
        ? '0x6080'
        : null,
  }),
}));

vi.mock('@/features/transfer-identity/model/use-member-recipient', () => ({
  useMemberRecipient: () => ({ status: 'idle', memberId: null, address: null, retry: vi.fn() }),
}));

vi.mock('@/features/transfer-identity/model/use-member-name-recipient', () => ({
  useMemberNameRecipient: () => ({
    status: 'ok',
    memberId: 2n,
    name: 'Testdev-member-1',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    retry: vi.fn(),
  }),
}));

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

beforeEach(() => {
  window.localStorage.clear();
});

function renderAddressForm(): void {
  render(
    <TransferForm
      target={{ tokenId: 1n, name: 'Testdev-member-0' }}
      memberNftAddress="0xdC64a140Aa3E981100a9becA4E685f962f0cF6C9"
      selfAddress={SELF}
      phase="idle"
      errorMessage={null}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
      initialMode="address"
    />,
  );
}

function renderNameForm(): void {
  render(
    <TransferForm
      target={{ tokenId: 1n, name: 'Testdev-member-0' }}
      memberNftAddress="0xdC64a140Aa3E981100a9becA4E685f962f0cF6C9"
      selfAddress={SELF}
      phase="idle"
      errorMessage={null}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
      initialMode="name"
    />,
  );
}

describe('canSubmitTransfer', () => {
  const base = {
    busy: false,
    addressValid: false,
    memberResolved: false,
    nameResolved: false,
    nameAcknowledged: false,
  } as const;

  it('never enables a resolved name before the acknowledgement', () => {
    expect(
      canSubmitTransfer({ ...base, mode: 'name', nameResolved: true, nameAcknowledged: false }),
    ).toBe(false);
    expect(
      canSubmitTransfer({ ...base, mode: 'name', nameResolved: true, nameAcknowledged: true }),
    ).toBe(true);
  });

  it('does not let the acknowledgement alone enable the name mode', () => {
    expect(
      canSubmitTransfer({ ...base, mode: 'name', nameResolved: false, nameAcknowledged: true }),
    ).toBe(false);
  });

  it('keeps address and id modes independent of the acknowledgement', () => {
    expect(canSubmitTransfer({ ...base, mode: 'address', addressValid: true })).toBe(true);
    expect(canSubmitTransfer({ ...base, mode: 'member', memberResolved: true })).toBe(true);
    expect(canSubmitTransfer({ ...base, mode: 'address', busy: true, addressValid: true })).toBe(
      false,
    );
  });
});

describe('TransferForm 按身份 NFT 名字 confirmation gate', () => {
  it('shows the resolved name → id and owner, with the CTA disabled until acknowledged', () => {
    renderNameForm();

    expect(screen.getByText('名称「Testdev-member-1」→ 身份 NFT #2')).toBeVisible();
    expect(screen.getByTestId('transfer-name-confirmation')).toHaveTextContent(/收款人 0x7099/);
    expect(screen.getByText(/名称不是唯一依据/)).toBeVisible();

    const submit = screen.getByRole('button', { name: '确认转让' });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByTestId('transfer-name-ack'));
    expect(submit).toBeEnabled();
  });
});

describe('TransferForm 智能资产保护（owner 2026-11-16）', () => {
  it('shares the same switch and default as 代币转账', () => {
    renderAddressForm();
    expect(screen.getByText('智能资产保护')).toBeVisible();
    expect(screen.getByTestId('asset-protection-toggle')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('intercepts a known address-book contract while the switch is on', () => {
    renderAddressForm();
    fireEvent.change(screen.getByTestId('transfer-recipient-input'), {
      target: { value: PAIR },
    });

    const submit = screen.getByRole('button', { name: '确认转让' });
    expect(screen.getByTestId('transfer-identity-protection')).toHaveTextContent(
      '智能资产保护已拦截：这是「交易对」合约地址',
    );
    expect(submit).toBeDisabled();
  });

  it('only warns once the switch is off, and then allows the transfer', () => {
    renderAddressForm();
    fireEvent.change(screen.getByTestId('transfer-recipient-input'), {
      target: { value: PAIR },
    });
    const submit = screen.getByRole('button', { name: '确认转让' });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByTestId('asset-protection-toggle'));
    // 关闭 = 只跳过已知合约检测：已知合约块消失，同一地址按任意合约只警告。
    expect(screen.queryByTestId('transfer-identity-protection')).toBeNull();
    expect(screen.getByTestId('transfer-identity-contract-warning')).toHaveTextContent(
      '这个地址是一个合约',
    );
    expect(submit).toBeEnabled();
  });

  it('warns about an arbitrary contract without ever blocking', () => {
    renderAddressForm();
    fireEvent.change(screen.getByTestId('transfer-recipient-input'), {
      target: { value: TOKEN_CONTRACT },
    });
    expect(screen.getByTestId('transfer-identity-contract-warning')).toHaveTextContent(
      '这个地址是一个合约',
    );
    expect(screen.getByRole('button', { name: '确认转让' })).toBeEnabled();
  });
});
