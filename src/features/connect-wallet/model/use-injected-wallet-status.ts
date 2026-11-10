import { useEffect, useState } from 'react';

export type InjectedWalletStatus = 'checking' | 'available' | 'missing';

/**
 * The longest the connect surface says 「检测钱包中…」 when nothing has injected
 * yet. The owner saw 1–3 s of it on the live site, so the window is short enough
 * that the no-wallet path settles well under a second.
 */
export const DETECTION_WINDOW_MS = 600;

/** Late injectors that never dispatch `ethereum#initialized` are still noticed. */
export const LATE_PROVIDER_RECHECK_MS = 500;

function hasInjectedProvider(): boolean {
  return typeof window !== 'undefined' && window.ethereum !== undefined;
}

/**
 * Some wallets inject window.ethereum after the document loads, so "no provider
 * yet" is not the same as "no wallet". We wait briefly, then expose an explicit
 * `missing` state that opens the fallback sheet instead of a dead button.
 *
 * States only move forward: checking → available | missing, and a late provider
 * upgrades missing → available. The surface never falls back to `checking`, so a
 * slow injector cannot produce a 「连接钱包」 → 「检测钱包中…」 flicker.
 */
export function useInjectedWalletStatus(): InjectedWalletStatus {
  const [status, setStatus] = useState<InjectedWalletStatus>(() =>
    hasInjectedProvider() ? 'available' : 'checking',
  );

  useEffect(() => {
    if (status === 'available') return;
    if (typeof window === 'undefined') return;

    const upgrade = () => {
      if (window.ethereum !== undefined) setStatus('available');
    };

    // Covers a provider injected between the initial render and this effect.
    upgrade();
    // The standardized event is the fast path; the recheck covers wallets that
    // inject silently, including after we have already settled to `missing`.
    window.addEventListener('ethereum#initialized', upgrade);
    const recheck = window.setInterval(upgrade, LATE_PROVIDER_RECHECK_MS);

    let deadline: number | undefined;
    if (status === 'checking') {
      deadline = window.setTimeout(() => {
        setStatus(hasInjectedProvider() ? 'available' : 'missing');
      }, DETECTION_WINDOW_MS);
    }

    return () => {
      window.clearTimeout(deadline);
      window.clearInterval(recheck);
      window.removeEventListener('ethereum#initialized', upgrade);
    };
  }, [status]);

  return status;
}
