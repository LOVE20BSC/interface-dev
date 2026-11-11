import { useAccount } from 'wagmi';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { MintIdentityPanel } from '@/features/mint-identity/ui/mint-identity-panel';

/**
 * 铸造身份. The panel owns the name → quote → branch → approve → mint order so
 * the page itself stays one task with one primary action (UX spec §3.3).
 */
export function MintPage() {
  const { isConnected } = useAccount();
  const { isWrongChain } = useWalletConnection();

  return (
    <MintIdentityPanel
      isConnected={isConnected}
      isWrongChain={isWrongChain}
      connectAction={<ConnectWalletButton />}
    />
  );
}
