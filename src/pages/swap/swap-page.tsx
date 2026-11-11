import { useAccount } from 'wagmi';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { WrongNetworkButton } from '@/features/connect-wallet/ui/wrong-network-button';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { SwapTokenPanel } from '@/features/swap-token/ui/swap-token-panel';

/**
 * 通用兑换 (UX spec §3.5). Any token ↔ any token: native, wrapped native and
 * community tokens discovered from Launch. ?from/?to own the pair; ?symbol=
 * stays the community context and is deliberately independent.
 */
export function SwapPage() {
  const { isConnected } = useAccount();
  const { isWrongChain } = useWalletConnection();

  return (
    <SwapTokenPanel
      isConnected={isConnected}
      isWrongChain={isWrongChain}
      connectAction={<ConnectWalletButton />}
      wrongNetworkAction={<WrongNetworkButton />}
    />
  );
}
