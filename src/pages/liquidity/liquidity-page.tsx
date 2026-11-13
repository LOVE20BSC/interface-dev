import { useAccount } from 'wagmi';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { LiquidityPage as LiquidityView } from '@/features/liquidity-pool/ui/liquidity-page';

/**
 * 应用·流动性池 (owner 2026-11-14). The thin route wrapper only wires the wallet
 * state in; the feature owns every read, write and piece of copy. The page needs
 * the router (address book `router`), so the app-directory entry disables itself
 * when the deployment has none.
 */
export function LiquidityPage() {
  const { isConnected } = useAccount();
  const { isWrongChain } = useWalletConnection();

  return (
    <LiquidityView
      isConnected={isConnected}
      isWrongChain={isWrongChain}
      connectAction={<ConnectWalletButton />}
    />
  );
}
