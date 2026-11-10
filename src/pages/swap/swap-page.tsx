import { useAccount } from 'wagmi';
import { copy } from '@/shared/config/copy';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { SwapTokenPanel } from '@/features/swap-token/ui/swap-token-panel';

export function SwapPage() {
  const { isConnected } = useAccount();
  return (
    <div>
      <p className="mb-4 text-sm leading-6 text-muted">{copy.pages.swap.description}</p>
      <SwapTokenPanel isConnected={isConnected} connectAction={<ConnectWalletButton />} />
    </div>
  );
}
