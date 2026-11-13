import { useAccount } from 'wagmi';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { ApprovalsPanel } from '@/features/approve-token/ui/approval-panel';

/**
 * 代币授权 (owner 2026-11-14). The app-directory entry needs no protocol
 * contract: ERC20 `allowance` / `approve` work for any token, and the spender
 * rows come from whatever the address book configures. That is why the catalog
 * row is `requires: null`.
 */
export function ApprovalsPage() {
  const { isConnected } = useAccount();
  const { isWrongChain } = useWalletConnection();

  return (
    <ApprovalsPanel
      isConnected={isConnected}
      isWrongChain={isWrongChain}
      connectAction={<ConnectWalletButton />}
    />
  );
}
