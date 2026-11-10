import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { http } from 'viem';
import { createConfig, WagmiProvider } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { targetChain } from '@/config/chain';
import { NETWORK } from '@/config/networks';
import { useInjectedWalletStatus } from '@/features/connect-wallet/model/use-injected-wallet-status';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';

// Pin the detection status so each branch is exercised without real timers;
// jsdom has no window.ethereum either.
vi.mock('@/features/connect-wallet/model/use-injected-wallet-status', () => ({
  useInjectedWalletStatus: vi.fn(),
}));

const walletStatus = vi.mocked(useInjectedWalletStatus);

const config = createConfig({
  chains: [targetChain],
  connectors: [injected()],
  transports: {
    [targetChain.id]: http(NETWORK.rpcUrls[0] ?? 'http://127.0.0.1:8545'),
  },
  multiInjectedProviderDiscovery: false,
  ssr: false,
});

function renderButton() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <ConnectWalletButton />
      </QueryClientProvider>
    </WagmiProvider>,
  );
}

describe('ConnectWalletButton', () => {
  beforeEach(() => {
    walletStatus.mockReturnValue('missing');
  });

  it('shows the detection label only while the provider check is in flight', () => {
    walletStatus.mockReturnValue('checking');
    renderButton();

    const button = screen.getByRole('button', { name: '连接钱包' });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('检测钱包中…');
  });

  it('offers a no-wallet sheet instead of a dead connect button', async () => {
    renderButton();
    const button = screen.getByRole('button', { name: '连接钱包' });
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('连接钱包');

    fireEvent.click(button);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('没有检测到钱包')).toBeInTheDocument();
    expect(screen.getByText('在手机钱包 App 的内置浏览器中打开本页。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '复制本页链接' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '知道了' })).toBeInTheDocument();
  });
});
