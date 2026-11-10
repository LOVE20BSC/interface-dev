import { useAccount } from 'wagmi';
import { copy } from '@/shared/config/copy';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { ClaimAirdropPanel } from '@/features/claim-airdrop/ui/claim-airdrop-panel';

export function AirdropPage() {
  const { isConnected } = useAccount();
  return (
    <div>
      <p className="mb-4 text-sm leading-6 text-muted">{copy.pages.airdrop.description}</p>
      <ClaimAirdropPanel isConnected={isConnected} connectAction={<ConnectWalletButton />} />
    </div>
  );
}
