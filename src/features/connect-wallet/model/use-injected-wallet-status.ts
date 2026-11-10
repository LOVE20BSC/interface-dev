import { useEffect, useState } from 'react';

export type InjectedWalletStatus = 'checking' | 'available' | 'missing';

const POLL_INTERVAL_MS = 250;
const MAX_ATTEMPTS = 12; // 3 s, matching the UX spec's "don't show a dead button" rule

/**
 * Some wallets inject window.ethereum after the document loads, so "no provider
 * yet" is not the same as "no wallet". We wait briefly, then expose an explicit
 * `missing` state that opens the fallback sheet instead of a dead button.
 */
export function useInjectedWalletStatus(): InjectedWalletStatus {
  const [status, setStatus] = useState<InjectedWalletStatus>(() => {
    if (typeof window === 'undefined') return 'checking';
    return window.ethereum !== undefined ? 'available' : 'checking';
  });

  useEffect(() => {
    if (status === 'available') return;
    if (typeof window === 'undefined') return;

    let attempts = 0;
    let settled = false;

    const settle = (next: InjectedWalletStatus) => {
      if (settled) return;
      settled = true;
      setStatus(next);
    };

    const onInitialized = () => settle('available');
    window.addEventListener('ethereum#initialized', onInitialized);

    if (window.ethereum !== undefined) {
      settle('available');
      return () => {
        window.removeEventListener('ethereum#initialized', onInitialized);
      };
    }

    const timer = window.setInterval(() => {
      if (window.ethereum !== undefined) {
        window.clearInterval(timer);
        settle('available');
        return;
      }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) {
        window.clearInterval(timer);
        settle('missing');
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('ethereum#initialized', onInitialized);
    };
  }, [status]);

  return status;
}
