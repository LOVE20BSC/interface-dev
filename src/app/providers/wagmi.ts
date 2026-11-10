import { fallback, http, type Transport } from 'viem';
import { createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { targetChain } from '@/config/chain';
import { NETWORK } from '@/config/networks';

const transports = NETWORK.rpcUrls.map((url) =>
  http(url, {
    // BSC public dataseed caps batches at 100; keep well below it.
    batch: { batchSize: 50, wait: 16 },
    retryCount: 2,
    timeout: 15_000,
  }),
);

const transport: Transport = fallback(
  transports.length > 0 ? transports : [http('http://127.0.0.1:8545')],
  { rank: false, retryCount: 1 },
);

export const wagmiConfig = createConfig({
  chains: [targetChain],
  connectors: [injected()],
  transports: {
    [targetChain.id]: transport,
  },
  // Only window.ethereum. No EIP-6963 fan-out means no second connector can
  // appear in the UI, and no WalletConnect bundle can leak into first paint.
  multiInjectedProviderDiscovery: false,
  ssr: false,
  pollingInterval: 12_000,
});
