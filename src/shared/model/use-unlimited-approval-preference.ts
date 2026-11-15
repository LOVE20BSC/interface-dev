import { useCallback, useSyncExternalStore } from 'react';
import {
  readUnlimitedApprovalPreference,
  subscribeUnlimitedApprovalPreference,
  writeUnlimitedApprovalPreference,
} from '@/shared/lib/approval-preference';

/**
 * The 默认使用长期授权 preference as live React state.
 *
 * `useSyncExternalStore` reads the same storage entry the approvals page writes,
 * so every approve ladder (swap / mint / liquidity / batch-transfer) and the
 * approvals switch itself can never drift: write here → every mounted reader
 * re-reads; a page opened later reads the entry directly. No private React copy,
 * no hydration flash.
 */
export interface UnlimitedApprovalPreference {
  /** True = 长期授权（写 `maxUint256`），false = 精确额度. */
  readonly enabled: boolean;
  /** Persists the preference and notifies every mounted reader. */
  readonly setEnabled: (enabled: boolean) => boolean;
}

export function useUnlimitedApprovalPreference(): UnlimitedApprovalPreference {
  const enabled = useSyncExternalStore(
    subscribeUnlimitedApprovalPreference,
    readUnlimitedApprovalPreference,
    () => false,
  );
  const setEnabled = useCallback((next: boolean) => writeUnlimitedApprovalPreference(next), []);
  return { enabled, setEnabled };
}
