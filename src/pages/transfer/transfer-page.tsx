import { useAccount } from 'wagmi';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { TransferTokenPanel } from '@/features/transfer-token/ui/transfer-token-panel';

/**
 * 代币转账 (owner 2026-11-14). The app-directory entry needs no protocol
 * contract (a plain transfer only needs a wallet), so the page is reachable on
 * any chain and degrades to native + custom ERC20 when the community catalog is
 * empty. ?symbol= is the community context and stays in the URL; this page does
 * not depend on it.
 */
export function TransferPage() {
  const { isConnected } = useAccount();
  const { isWrongChain } = useWalletConnection();

  return (
    <TransferTokenPanel
      isConnected={isConnected}
      isWrongChain={isWrongChain}
      connectAction={<ConnectWalletButton />}
    />
  );
}
