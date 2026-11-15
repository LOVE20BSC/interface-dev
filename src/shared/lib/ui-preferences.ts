import { readNamedPreference, writeNamedPreference } from '@/shared/lib/cache';

/**
 * Cross-page UI preferences (owner 2026-11-16).
 *
 * These are browser-level booleans shared by every transfer surface; they are
 * deliberately NOT scoped to a wallet or a chain (a safety preference belongs to
 * the person using this device). The legacy library (TKM) stored the transfer
 * protection toggle in `localStorage` under
 * `love20:transfer:assetProtectionEnabled` with `'1'` = on. We keep the exact key
 * and the `'1'`/`'0'` encoding so a user's existing choice survives the port; the
 * segmented key is read through `cache.readNamedPreference` (the business-key
 * grammar forbids `:`, and this entry predates it).
 *
 * The change event is how two mounted surfaces (or two tabs) stay in sync: the
 * writing surface dispatches it, every listener re-reads the same entry, so there
 * is exactly one source of truth and no private React copies to reconcile.
 */

export interface BooleanPreference {
  /** Exact storage key (validated by shared/lib/cache.ts). */
  readonly key: string;
  readonly eventName: string;
  readonly defaultValue: boolean;
  /** Current value; the default when absent or storage is unavailable. */
  readonly get: () => boolean;
  /** Persists the value and notifies every listener in this tab. */
  readonly set: (enabled: boolean) => void;
  /** Re-reads the value on our change event and on another tab's storage event. */
  readonly subscribe: (listener: () => void) => () => void;
}

export function createBooleanPreference(
  key: string,
  eventName: string,
  defaultValue: boolean,
): BooleanPreference {
  return {
    key,
    eventName,
    defaultValue,

    get(): boolean {
      const stored = readNamedPreference(key);
      // Same encoding as the legacy library: `'1'` is on; anything else that is
      // present (including junk) is off; absent falls back to the default.
      if (stored === null) return defaultValue;
      return stored === '1';
    },

    set(enabled: boolean): void {
      writeNamedPreference(key, enabled ? '1' : '0');
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(eventName));
    },

    subscribe(listener: () => void): () => void {
      if (typeof window === 'undefined') return () => {};
      const onStorage = (event: StorageEvent) => {
        // Another tab changed the same entry (or cleared storage).
        if (event.key === null || event.key === key) listener();
      };
      window.addEventListener(eventName, listener);
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener(eventName, listener);
        window.removeEventListener('storage', onStorage);
      };
    },
  };
}

/**
 * 智能资产保护 (owner 2026-11-16): default ON, shared by 代币转账 / 身份 NFT 转让 /
 * 批量转账. When on, a recipient that is a known address-book contract is
 * intercepted; turning it off is the explicit way to force the transfer.
 */
export const ASSET_PROTECTION_STORAGE_KEY = 'love20:transfer:assetProtectionEnabled';
export const ASSET_PROTECTION_CHANGE_EVENT = 'assetProtectionPreferenceChanged';
export const ASSET_PROTECTION_DEFAULT = true;

export const assetProtectionPreference: BooleanPreference = createBooleanPreference(
  ASSET_PROTECTION_STORAGE_KEY,
  ASSET_PROTECTION_CHANGE_EVENT,
  ASSET_PROTECTION_DEFAULT,
);
