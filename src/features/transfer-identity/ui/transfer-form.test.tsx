import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransferForm } from '@/features/transfer-identity/ui/transfer-drawer';
import { canSubmitTransfer } from '@/features/transfer-identity/lib/transfer-submit';

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
    expect(screen.getByText(/收款人 0x7099/)).toBeVisible();
    expect(screen.getByText(/名称不是唯一依据/)).toBeVisible();

    const submit = screen.getByRole('button', { name: '确认转让' });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByTestId('transfer-name-ack'));
    expect(submit).toBeEnabled();
  });
});
