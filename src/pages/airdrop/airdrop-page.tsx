import { useAccount } from 'wagmi';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { ClaimAirdropPanel } from '@/features/claim-airdrop/ui/claim-airdrop-panel';

/**
 * 空投铸造. There is no page subtitle: the status card starts directly with the
 * current state (owner 2026-11-17 removed the 「本次空投：{symbol}」 meta line),
 * and the rules fold — expanded by default — explains eligibility and where the
 * share comes from (UX spec §3.4). The page deliberately ignores ?symbol= — the
 * airdrop unit is fixed at deploy.
 */
export function AirdropPage() {
  const { isConnected } = useAccount();
  const { isWrongChain } = useWalletConnection();

  return (
    <ClaimAirdropPanel
      isConnected={isConnected}
      isWrongChain={isWrongChain}
      connectAction={<ConnectWalletButton />}
    />
  );
}
