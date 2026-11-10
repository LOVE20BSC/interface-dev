import { NETWORK } from '@/config/networks';
import type { InjectedProvider } from '@/shared/types/ethereum';

export interface AddEthereumChainParams {
  readonly chainId: string;
  readonly chainName: string;
  readonly nativeCurrency: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
  };
  readonly rpcUrls: readonly string[];
  readonly blockExplorerUrls?: readonly string[];
}

/**
 * EIP-3085 payload built entirely from the build-time environment package.
 * No address or chain constant may be hard-coded in the UI layer.
 */
export function buildAddEthereumChainParams(): AddEthereumChainParams {
  const base = {
    chainId: `0x${NETWORK.chainId.toString(16)}`,
    chainName: NETWORK.name,
    nativeCurrency: {
      name: NETWORK.nativeCurrency.name,
      symbol: NETWORK.nativeCurrency.symbol,
      decimals: NETWORK.nativeCurrency.decimals,
    },
    rpcUrls: [...NETWORK.rpcUrls],
  } satisfies Omit<AddEthereumChainParams, 'blockExplorerUrls'>;

  return NETWORK.blockExplorerUrl === null
    ? base
    : { ...base, blockExplorerUrls: [NETWORK.blockExplorerUrl] };
}

export function isUnknownChainError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === 4902) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && /unrecognized chain|unknown chain/i.test(message);
}

export async function addTargetChain(provider: InjectedProvider): Promise<void> {
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [buildAddEthereumChainParams()],
  });
}
