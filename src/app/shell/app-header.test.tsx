import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppHeader } from '@/app/shell/app-header';

vi.mock('@/widgets/connect-pill/connect-pill', () => ({
  ConnectPill: () => <span data-testid="connect-pill" />,
}));

vi.mock('@/features/switch-community/model/use-community-context', () => ({
  useCommunityContext: () => ({ symbol: 'TestLOVE20', fromUrl: true, switchSymbol: vi.fn() }),
}));

const display = vi.hoisted(() => ({ pending: false }));

vi.mock('@/entities/community-token/model/use-community-display', () => ({
  useCommunityDisplay: () => ({
    symbol: display.pending ? 'LOVE20协议' : 'TestLOVE20',
    resolved: !display.pending,
    pending: display.pending,
  }),
}));

const wallet = vi.hoisted(() => ({
  isConnected: false,
  isWrongChain: false,
}));

vi.mock('@/features/connect-wallet/model/use-wallet-connection', () => ({
  useWalletConnection: () => ({
    address: wallet.isConnected ? '0x1234567890abcdef1234567890abcdef12345678' : undefined,
    isConnected: wallet.isConnected,
    isConnecting: false,
    isSwitching: false,
    chainId: 31337,
    targetChainId: 31337,
    isWrongChain: wallet.isWrongChain,
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchToTargetChain: vi.fn(),
  }),
}));

function renderHeader(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppHeader />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  wallet.isConnected = false;
  wallet.isWrongChain = false;
  display.pending = false;
});

describe('AppHeader', () => {
  it('home shows the community wordmark while disconnected, keeps the landmark and pill', () => {
    renderHeader('/');

    // §1.3: disconnected mobile home is the only state with a left wordmark.
    expect(screen.getByTestId('home-wordmark')).toHaveTextContent('TestLOVE20');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByTestId('connect-pill')).toBeVisible();
    // The wordmark is a label, not a second home link.
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('home holds the wordmark back until the community symbol resolves (QA G8)', () => {
    display.pending = true;
    renderHeader('/');

    // Cold start: no protocol-label flash before the on-chain symbol lands.
    expect(screen.queryByTestId('home-wordmark')).toBeNull();
    expect(screen.queryByText('LOVE20协议')).toBeNull();
  });

  it('home hides the wordmark once connected: the top-right chip is the only community name', () => {
    wallet.isConnected = true;
    renderHeader('/');

    expect(screen.queryByTestId('home-wordmark')).toBeNull();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByTestId('connect-pill')).toBeVisible();
  });

  it('home hides the wordmark on the wrong chain too', () => {
    wallet.isConnected = true;
    wallet.isWrongChain = true;
    renderHeader('/');

    expect(screen.queryByTestId('home-wordmark')).toBeNull();
  });

  it('desktop home keeps the page label as plain text, not a link', () => {
    wallet.isConnected = true;
    renderHeader('/');

    expect(screen.getByText('首页')).toBeInTheDocument();
    expect(screen.getByText('首页').closest('a')).toBeNull();
  });

  it('secondary pages still render the back control, title and pill', () => {
    wallet.isConnected = true;
    renderHeader('/my-nft');

    expect(screen.getByRole('button', { name: '返回上一页' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '我的 NFT' })).toBeVisible();
    expect(screen.getByTestId('connect-pill')).toBeVisible();
    expect(screen.queryByText('首页')).toBeNull();
    expect(screen.queryByTestId('home-wordmark')).toBeNull();
  });
});
