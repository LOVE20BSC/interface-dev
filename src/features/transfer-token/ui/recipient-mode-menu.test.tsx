import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  RecipientModeMenu,
  type TransferRecipientMode,
} from '@/features/transfer-token/ui/recipient-mode-menu';

function Harness() {
  const [mode, setMode] = useState<TransferRecipientMode>('address');
  return (
    <>
      <RecipientModeMenu mode={mode} onChange={setMode} />
      <output data-testid="mode-value">{mode}</output>
    </>
  );
}

describe('RecipientModeMenu 收款方左侧下拉', () => {
  it('offers exactly 按地址 / 按身份 NFT ID / 按身份 NFT 名字', () => {
    render(<Harness />);
    const trigger = screen.getByTestId('transfer-recipient-mode');
    expect(trigger).toHaveTextContent('按地址');
    expect(trigger).toHaveAttribute('aria-label', '收款方类型：按地址');

    fireEvent.click(trigger);
    expect(screen.getByTestId('transfer-mode-address')).toBeVisible();
    expect(screen.getByTestId('transfer-mode-member')).toHaveTextContent('按身份 NFT ID');
    expect(screen.getByTestId('transfer-mode-name')).toHaveTextContent('按身份 NFT 名字');
  });

  it('switches the mode and never infers it from the typed text', () => {
    render(<Harness />);
    const trigger = screen.getByTestId('transfer-recipient-mode');

    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId('transfer-mode-member'));
    expect(screen.getByTestId('mode-value')).toHaveTextContent('member');
    expect(trigger).toHaveTextContent('按身份 NFT ID');

    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId('transfer-mode-name'));
    expect(screen.getByTestId('mode-value')).toHaveTextContent('name');
    expect(trigger).toHaveTextContent('按身份 NFT 名字');
  });
});
