import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  APPROVAL_PREFERENCE_STORAGE_KEY,
  writeUnlimitedApprovalPreference,
} from '@/shared/lib/approval-preference';
import { useUnlimitedApprovalPreference } from '@/shared/model/use-unlimited-approval-preference';

/**
 * Cross-page consistency: the value a page reads must be the entry the
 * approvals page wrote, including for an already-mounted reader (the change
 * event) — that is what "开关改动后其它页下次打开即生效" rests on.
 */
beforeEach(() => {
  window.localStorage.clear();
});

describe('useUnlimitedApprovalPreference', () => {
  it('defaults to off when the device has no stored preference', () => {
    const { result } = renderHook(() => useUnlimitedApprovalPreference());
    expect(result.current.enabled).toBe(false);
  });

  it('writes the shared storage entry and flips its own readers', () => {
    const { result } = renderHook(() => useUnlimitedApprovalPreference());

    act(() => {
      result.current.setEnabled(true);
    });
    expect(result.current.enabled).toBe(true);
    expect(window.localStorage.getItem(APPROVAL_PREFERENCE_STORAGE_KEY)).toBe('1');

    act(() => {
      result.current.setEnabled(false);
    });
    expect(result.current.enabled).toBe(false);
    expect(window.localStorage.getItem(APPROVAL_PREFERENCE_STORAGE_KEY)).toBe('0');
  });

  it('picks up a write made outside React (another page opening/toggling)', () => {
    const { result } = renderHook(() => useUnlimitedApprovalPreference());
    act(() => {
      writeUnlimitedApprovalPreference(true);
    });
    expect(result.current.enabled).toBe(true);
  });
});
