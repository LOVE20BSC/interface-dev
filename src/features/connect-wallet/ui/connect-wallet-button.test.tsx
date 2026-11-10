import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { http } from 'viem';
import { createConfig, WagmiProvider } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { describe, expect, it, vi } from 'vitest';
import { targetChain } from '@/config/chain';
import { NETWORK } from '@/config/networks';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';

// Simulate the "no provider after the 3s detection window" branch without
// waiting for real timers. jsdom has no window.ethereum either.
vi.mock('@/features/connect-wallet/model/use-injected-wallet-status', () => ({
  useInjectedWalletStatus: () => 'missing' as const,
}));

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
  it('offers a no-wallet sheet instead of a dead connect button', async () => {
    renderButton();
    const button = screen.getByRole('button', { name: '连接钱包' });
    expect(button).toBeEnabled();

    fireEvent.click(button);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('没有检测到钱包')).toBeInTheDocument();
    expect(screen.getByText('在手机钱包 App 的内置浏览器中打开本页。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '复制本页链接' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '知道了' })).toBeInTheDocument();
  });
});
