import { readPreference, writePreference } from '@/shared/lib/cache';

/**
 * 默认长期授权偏好 (owner 2026-11-14, legacy semantics).
 *
 * The TKM page persisted this boolean in `localStorage` under
 * `love20:tokenApproval:useUnlimitedByDefault` (`'1'` = on). This repo has one
 * storage boundary (`shared/lib/cache.ts`) whose global-preference key grammar
 * forbids `:`, so the entry is `love20:tokenApprovalUseUnlimitedByDefault` with
 * the same meaning: `'1'` on, anything else/absent off. It is a browser
 * preference, deliberately not wallet- or chain-scoped.
 *
 * Scope note: only the 代币授权 page reads and writes it today; the existing
 * approve ladders on other pages do not consume it yet (see the worklog).
 */

export const APPROVAL_PREFERENCE_KEY = 'tokenApprovalUseUnlimitedByDefault';

export function readUnlimitedApprovalPreference(): boolean {
  return readPreference(APPROVAL_PREFERENCE_KEY) === '1';
}

export function writeUnlimitedApprovalPreference(enabled: boolean): boolean {
  return writePreference(APPROVAL_PREFERENCE_KEY, enabled ? '1' : '0');
}
