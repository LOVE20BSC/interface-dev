import { useAccount } from 'wagmi';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { GovernanceStakePage } from '@/features/governance-stake/ui/governance-stake-page';

/**
 * 治理（/gov）。2026-11-17 起不再是占位页：页面主体是流动性质押与加速质押
 * （见 features/governance-stake）。页面本身只做连接/网络门禁，业务在 feature 里。
 */
export function GovPage() {
  const { isConnected } = useAccount();
  const { isWrongChain } = useWalletConnection();

  return (
    <GovernanceStakePage
      isConnected={isConnected}
      isWrongChain={isWrongChain}
      connectAction={<ConnectWalletButton />}
    />
  );
}
