import { useAccount } from 'wagmi';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { BatchTransferPanel } from '@/features/batch-transfer/ui/batch-transfer-panel';

/**
 * 批量转账 (owner 2026-11-14). The page needs the BatchTransfer contract in the
 * address book, so the app-directory row is disabled (with a reason) when this
 * build has no deployment; the panel renders that state instead of fake data.
 * ?symbol= is the community context and stays in the URL; this page does not
 * depend on it.
 */
export function BatchTransferPage() {
  const { isConnected } = useAccount();
  const { isWrongChain } = useWalletConnection();

  return (
    <BatchTransferPanel
      isConnected={isConnected}
      isWrongChain={isWrongChain}
      connectAction={<ConnectWalletButton />}
    />
  );
}
