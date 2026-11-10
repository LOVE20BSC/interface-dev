export {};

/**
 * Minimal EIP-1193 surface. We only use the injected provider for two things:
 * connecting (wagmi does that) and wallet_addEthereumChain when the wallet does
 * not know the target chain yet. No WalletConnect, no projectId, no injected
 * provider SDK.
 */
export interface InjectedProvider {
  request(args: { method: string; params?: readonly unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
  providers?: InjectedProvider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
}

declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}
