import { useCallback, useSyncExternalStore } from 'react';
import { assetProtectionPreference } from '@/shared/lib/ui-preferences';

export interface AssetProtectionState {
  /** True = protection on (default). */
  readonly enabled: boolean;
  readonly setEnabled: (enabled: boolean) => void;
}

const getSnapshot = (): boolean => assetProtectionPreference.get();
const getServerSnapshot = (): boolean => assetProtectionPreference.defaultValue;
const subscribe = (listener: () => void): (() => void) =>
  assetProtectionPreference.subscribe(listener);

/**
 * 智能资产保护 state for a single surface. The preference is external
 * (localStorage + a change event), never component state, so the three transfer
 * pages and any two mounted switches observe the same value immediately.
 */
export function useAssetProtection(): AssetProtectionState {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setEnabled = useCallback((next: boolean) => {
    assetProtectionPreference.set(next);
  }, []);
  return { enabled, setEnabled };
}
