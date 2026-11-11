import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WrongNetworkButton } from '@/features/connect-wallet/ui/wrong-network-button';

vi.mock('@/features/connect-wallet/model/use-wallet-connection', () => ({
  useWalletConnection: () => ({
    isSwitching: false,
    switchToTargetChain: vi.fn(),
  }),
}));

vi.mock('@/features/connect-wallet/ui/lazy-dialogs', () => ({
  LazyWalletErrorDialog: () => null,
  preloadWalletDialogs: vi.fn(),
}));

describe('WrongNetworkButton', () => {
  it('is a red outline button, not a solid danger fill (UX spec §1.4)', () => {
    render(<WrongNetworkButton />);

    const button = screen.getByRole('button', { name: '网络不对，点此切换' });
    const classes = button.className.split(/\s+/);

    expect(classes).toContain('border');
    expect(classes).toContain('border-danger');
    expect(classes).toContain('bg-transparent');
    expect(classes).toContain('text-danger');
    // A solid fill would be the bare `bg-danger` utility; `bg-danger-soft` is
    // the hover tint and is allowed.
    expect(classes).not.toContain('bg-danger');
    // Geometry is the normal connect-pill size: same h-11 / px-4, so the
    // header does not jump when the chain changes.
    expect(classes).toContain('h-11');
    expect(classes).toContain('px-4');
  });
});
