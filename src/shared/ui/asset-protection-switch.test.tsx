import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { copy } from '@/shared/config/copy-pages';
import { ASSET_PROTECTION_STORAGE_KEY } from '@/shared/lib/ui-preferences';
import { AssetProtectionSwitch } from '@/shared/ui/asset-protection-switch';

beforeEach(() => {
  window.localStorage.clear();
});

describe('AssetProtectionSwitch 智能资产保护', () => {
  it('is ON by default and writes the shared preference when turned off', () => {
    render(<AssetProtectionSwitch />);

    const toggle = screen.getByTestId('asset-protection-toggle');
    expect(screen.getByText(copy.assetProtection.title)).toBeVisible();
    expect(toggle).toHaveAttribute('role', 'switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('asset-protection')).toHaveAttribute('data-enabled', 'true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('asset-protection-hint')).toHaveTextContent(
      copy.assetProtection.offHint,
    );
    // The exact legacy key survives the port, so a returning TKM user keeps it.
    expect(window.localStorage.getItem(ASSET_PROTECTION_STORAGE_KEY)).toBe('0');
  });

  it('shares one value between two mounted surfaces', () => {
    render(
      <>
        <AssetProtectionSwitch testId="asset-protection-a" />
        <AssetProtectionSwitch testId="asset-protection-b" />
      </>,
    );
    fireEvent.click(screen.getByTestId('asset-protection-a-toggle'));

    expect(screen.getByTestId('asset-protection-b-toggle')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('starts OFF when this device already chose off', () => {
    window.localStorage.setItem(ASSET_PROTECTION_STORAGE_KEY, '0');
    render(<AssetProtectionSwitch />);
    expect(screen.getByTestId('asset-protection-toggle')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('cannot be toggled while the page is busy', () => {
    render(<AssetProtectionSwitch disabled />);
    expect(screen.getByTestId('asset-protection-toggle')).toBeDisabled();
  });
});
