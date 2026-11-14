import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  IdentityInputModeMenu,
  IdentityRecipientField,
  type IdentityInputMode,
} from '@/shared/ui/identity-input-mode';

function MenuHarness() {
  const [mode, setMode] = useState<IdentityInputMode>('address');
  return (
    <>
      <IdentityInputModeMenu
        mode={mode}
        onChange={setMode}
        triggerTestId="transfer-recipient-mode"
        optionTestIdPrefix="transfer-mode"
      />
      <output data-testid="mode-value">{mode}</output>
    </>
  );
}

function FieldHarness() {
  const [mode, setMode] = useState<IdentityInputMode>('address');
  const [value, setValue] = useState('');
  return (
    <IdentityRecipientField
      id="transfer-recipient"
      label="收款方"
      mode={mode}
      onModeChange={setMode}
      value={value}
      onValueChange={setValue}
      inputTestId="transfer-recipient"
      modeTriggerTestId="transfer-recipient-mode"
      modeOptionTestIdPrefix="transfer-mode"
    />
  );
}

describe('IdentityInputModeMenu 收款方类型下拉', () => {
  it('offers exactly 按地址 / 按身份 NFT ID / 按身份 NFT 名字', () => {
    render(<MenuHarness />);
    const trigger = screen.getByTestId('transfer-recipient-mode');
    expect(trigger).toHaveTextContent('按地址');
    expect(trigger).toHaveAttribute('aria-label', '收款方类型：按地址');

    fireEvent.click(trigger);
    expect(screen.getByTestId('transfer-mode-address')).toBeVisible();
    expect(screen.getByTestId('transfer-mode-member')).toHaveTextContent('按身份 NFT ID');
    expect(screen.getByTestId('transfer-mode-name')).toHaveTextContent('按身份 NFT 名字');
  });

  it('switches the mode and never infers it from the typed text', () => {
    render(<MenuHarness />);
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

describe('IdentityRecipientField 共享三模式输入框', () => {
  it('drives placeholder + keyboard from the explicit mode, keeping one input', () => {
    render(<FieldHarness />);
    const input = screen.getByTestId('transfer-recipient');
    expect(input).toHaveAttribute('placeholder', '0x 开头的 40 位地址');
    expect(input).toHaveAttribute('inputmode', 'text');

    fireEvent.click(screen.getByTestId('transfer-recipient-mode'));
    fireEvent.click(screen.getByTestId('transfer-mode-member'));
    expect(input).toHaveAttribute('placeholder', '#身份 NFT 编号');
    expect(input).toHaveAttribute('inputmode', 'numeric');

    fireEvent.click(screen.getByTestId('transfer-recipient-mode'));
    fireEvent.click(screen.getByTestId('transfer-mode-name'));
    expect(input).toHaveAttribute('placeholder', '身份 NFT 名字');
    expect(input).toHaveAttribute('inputmode', 'text');

    fireEvent.change(input, { target: { value: '123456' } });
    expect(input).toHaveValue('123456');
  });

  it('exposes the label and marks the field invalid on demand', () => {
    render(
      <IdentityRecipientField
        id="drawer-recipient"
        label="收款人"
        ariaLabel="转账收款人"
        mode="address"
        onModeChange={() => {}}
        value=""
        onValueChange={() => {}}
        invalid
        inputTestId="drawer-input"
        modeTriggerTestId="drawer-mode"
        modeOptionTestIdPrefix="drawer-mode"
      />,
    );
    expect(screen.getByLabelText('转账收款人')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('drawer-mode')).toHaveTextContent('按地址');
  });
});
