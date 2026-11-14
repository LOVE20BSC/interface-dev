import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { targetChain } from '@/config/chain';
import { NETWORK } from '@/config/networks';
import { addTargetChain, isUnknownChainError } from '@/features/connect-wallet/lib/add-chain';
import { getInjectedProvider } from '@/features/connect-wallet/lib/injected';
import { useInjectedChainId } from '@/features/connect-wallet/model/use-injected-chain';

export class WalletUnavailableError extends Error {
  public constructor() {
    super('no injected wallet');
    this.name = 'WalletUnavailableError';
  }
}

export interface WalletConnection {
  readonly address: `0x${string}` | undefined;
  readonly isConnected: boolean;
  readonly isConnecting: boolean;
  readonly isSwitching: boolean;
  readonly chainId: number | undefined;
  readonly targetChainId: number;
  readonly isWrongChain: boolean;
  readonly connect: () => Promise<void>;
  readonly disconnect: () => void;
  readonly switchToTargetChain: () => Promise<void>;
}

/**
 * Injected-only wallet adapter. This is the only place UI code touches wagmi's
 * connect/switch mutations; components consume plain async functions.
 */
export function useWalletConnection(): WalletConnection {
  const account = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  const targetChainId = NETWORK.chainId;
  const injected = useInjectedChainId();
  // D11: before the wagmi connection exists, the injected wallet's own chain id
  // still tells us the network is wrong — so the first paint shows the
  // network-wrong state (header pill + page) instead of 「连接钱包」.
  const currentChainId = account.isConnected ? account.chainId : injected.chainId;
  const isWrongChain = currentChainId !== undefined && currentChainId !== targetChainId;

  const connect = async (): Promise<void> => {
    if (getInjectedProvider() === null) throw new WalletUnavailableError();
    const connector = connectors.find((candidate) => candidate.id === 'injected') ?? connectors[0];
    if (connector === undefined) throw new WalletUnavailableError();
    await connectAsync({ connector });
  };

  const switchToTargetChain = async (): Promise<void> => {
    if (!account.isConnected) {
      // No wagmi session yet: EIP-3326 works straight through the injected
      // provider, with the EIP-3085 add-chain fallback for unknown chains.
      const provider = getInjectedProvider();
      if (provider === null) throw new WalletUnavailableError();
      const switchParams = { chainId: `0x${targetChain.id.toString(16)}` };
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [switchParams] });
      } catch (error) {
        if (!isUnknownChainError(error)) throw error;
        await addTargetChain(provider);
        await provider.request({ method: 'wallet_switchEthereumChain', params: [switchParams] });
      }
      injected.reprobe();
      return;
    }
    try {
      await switchChainAsync({ chainId: targetChain.id });
    } catch (error) {
      if (!isUnknownChainError(error)) throw error;
      const provider = getInjectedProvider();
      if (provider === null) throw new WalletUnavailableError();
      await addTargetChain(provider);
      await switchChainAsync({ chainId: targetChain.id });
    }
  };

  return {
    address: account.address,
    isConnected: account.isConnected,
    isConnecting,
    isSwitching,
    chainId: currentChainId,
    targetChainId,
    isWrongChain,
    connect,
    disconnect,
    switchToTargetChain,
  };
}
