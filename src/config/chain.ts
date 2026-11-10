import { defineChain } from 'viem';
import { ADDRESSES, NETWORK, isConfiguredAddress } from './networks';

/**
 * Chain definition derived entirely from the environment package.
 * Kept in config/ so features can reference it without importing the app layer.
 */
export const targetChain = defineChain({
  id: NETWORK.chainId,
  name: NETWORK.name,
  nativeCurrency: NETWORK.nativeCurrency,
  rpcUrls: {
    default: { http: [...NETWORK.rpcUrls] },
  },
  ...(NETWORK.blockExplorerUrl === null
    ? {}
    : { blockExplorers: { default: { name: 'Block explorer', url: NETWORK.blockExplorerUrl } } }),
  ...(isConfiguredAddress(ADDRESSES.multicall3)
    ? { contracts: { multicall3: { address: ADDRESSES.multicall3 } } }
    : {}),
  testnet: NETWORK.testnet,
});
