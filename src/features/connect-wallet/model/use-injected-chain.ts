import { useCallback, useEffect, useState } from 'react';
import { getInjectedProvider } from '@/features/connect-wallet/lib/injected';

/** Late injectors (wallets that set `window.ethereum` after the first paint). */
const LATE_PROVIDER_PROBE_MS = 400;
const LATE_PROVIDER_PROBE_ATTEMPTS = 8;

function parseChainId(value: unknown): number | undefined {
  const parsed =
    typeof value === 'string'
      ? Number.parseInt(value, 16)
      : typeof value === 'number'
        ? value
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export interface InjectedChain {
  /** The injected wallet's chain id, known independently of the wagmi connection. */
  readonly chainId: number | undefined;
  /** Ask the wallet again (after a switch, or when a read failed). */
  readonly reprobe: () => void;
}

/**
 * The injected wallet's current chain, even while the dapp is still
 * disconnected (D11). wagmi's `isConnected` only turns true after the user
 * connects, so a wallet that is already installed on another chain used to look
 * "not connected": `/batch-transfer` rendered 「连接钱包后批量转账」 on first
 * paint instead of the network-wrong state.
 *
 * EIP-1193 providers answer `eth_chainId` without an account, so probing it is
 * safe (no permission prompt) and lets the connect entry decide the wrong-chain
 * state up front. `chainChanged` keeps it live; late injectors are re-probed for
 * a short, bounded window.
 */
export function useInjectedChainId(): InjectedChain {
  const [chainId, setChainId] = useState<number | undefined>(undefined);

  const probe = useCallback(() => {
    const provider = getInjectedProvider();
    if (provider === null) return;
    void provider
      .request({ method: 'eth_chainId' })
      .then((value) => {
        const next = parseChainId(value);
        if (next !== undefined) setChainId(next);
      })
      .catch(() => {
        setChainId(undefined);
      });
  }, []);

  useEffect(() => {
    probe();
    const provider = getInjectedProvider();
    const onChainChanged = (value: unknown) => {
      const next = parseChainId(value);
      if (next !== undefined) setChainId(next);
    };
    provider?.on?.('chainChanged', onChainChanged);
    window.addEventListener('ethereum#initialized', probe);

    // A provider injected after mount is picked up by the standardized event;
    // the bounded recheck also covers wallets that inject silently.
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (getInjectedProvider() !== null || attempts >= LATE_PROVIDER_PROBE_ATTEMPTS) {
        window.clearInterval(timer);
        probe();
      }
    }, LATE_PROVIDER_PROBE_MS);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('ethereum#initialized', probe);
      provider?.removeListener?.('chainChanged', onChainChanged);
    };
  }, [probe]);

  return { chainId, reprobe: probe };
}
