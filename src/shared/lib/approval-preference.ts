import { readPreference, writePreference } from '@/shared/lib/cache';

/**
 * 默认使用长期授权偏好 (owner 2026-11-14, carried over from the legacy library).
 *
 * The TKM page persisted this boolean in `localStorage` under
 * `love20:tokenApproval:useUnlimitedByDefault` (`'1'` = on). This repo has one
 * storage boundary (`shared/lib/cache.ts`) whose global-preference key grammar
 * forbids `:`, so the entry is `love20:tokenApprovalUseUnlimitedByDefault` with
 * the same meaning: `'1'` on, anything else/absent off. It is a browser
 * preference, deliberately not wallet- or chain-scoped.
 *
 * Scope (owner 2026-11-16): EVERY page that asks for a token allowance consumes
 * this preference — the approvals page switch, the swap/mint/liquidity/batch
 * approve ladders and their button copy. `decideApproveAmount` in
 * `shared/lib/approve-amount.ts` is the amount rule; this module is the storage
 * rule. The live value is exposed to React through
 * `shared/model/use-unlimited-approval-preference.ts`, so a toggle on
 * `/approvals` reaches an already-mounted page in the same tab and any page
 * opened later reads the same entry.
 */

export const APPROVAL_PREFERENCE_KEY = 'tokenApprovalUseUnlimitedByDefault';

/** Broadcast within the tab; `storage` events cover another tab changing it. */
export const APPROVAL_PREFERENCE_CHANGE_EVENT = 'love20:approval-preference-change';

/** The exact storage key, mirrored from `shared/lib/cache.ts` for `storage` events. */
export const APPROVAL_PREFERENCE_STORAGE_KEY = `love20:${APPROVAL_PREFERENCE_KEY}`;

export function readUnlimitedApprovalPreference(): boolean {
  return readPreference(APPROVAL_PREFERENCE_KEY) === '1';
}

/**
 * Persists the preference and notifies every mounted reader in this tab.
 * Returns whether the write reached storage (storage can be full/unavailable;
 * the in-memory toggle must still feel instant, so callers use the returned
 * value only for telemetry, never to block the UI).
 */
export function writeUnlimitedApprovalPreference(enabled: boolean): boolean {
  const written = writePreference(APPROVAL_PREFERENCE_KEY, enabled ? '1' : '0');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(APPROVAL_PREFERENCE_CHANGE_EVENT));
  }
  return written;
}

/**
 * Re-read the preference when a component in this tab writes it (or another tab
 * changes the same entry). Returns an unsubscribe function.
 */
export function subscribeUnlimitedApprovalPreference(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (event: StorageEvent): void => {
    // `key === null` means storage was cleared wholesale (private mode exit, …).
    if (event.key === null || event.key === APPROVAL_PREFERENCE_STORAGE_KEY) listener();
  };
  window.addEventListener(APPROVAL_PREFERENCE_CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(APPROVAL_PREFERENCE_CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
