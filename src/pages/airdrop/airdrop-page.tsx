import { useAccount } from 'wagmi';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { WrongNetworkButton } from '@/features/connect-wallet/ui/wrong-network-button';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { ClaimAirdropPanel } from '@/features/claim-airdrop/ui/claim-airdrop-panel';

/**
 * 空投铸造. There is no page subtitle: the status card's meta line names the
 * genesis token and the rules fold explains the snapshot mechanism (UX spec §3.4).
 * The page deliberately ignores ?symbol= — the airdrop unit is fixed at deploy.
 */
export function AirdropPage() {
  const { isConnected } = useAccount();
  const { isWrongChain } = useWalletConnection();

  return (
    <ClaimAirdropPanel
      isConnected={isConnected}
      isWrongChain={isWrongChain}
      connectAction={<ConnectWalletButton />}
      wrongNetworkAction={<WrongNetworkButton />}
    />
  );
}
