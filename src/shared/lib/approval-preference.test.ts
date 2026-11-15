import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPROVAL_PREFERENCE_CHANGE_EVENT,
  APPROVAL_PREFERENCE_KEY,
  APPROVAL_PREFERENCE_STORAGE_KEY,
  readUnlimitedApprovalPreference,
  subscribeUnlimitedApprovalPreference,
  writeUnlimitedApprovalPreference,
} from '@/shared/lib/approval-preference';

vi.mock('@/shared/lib/cache', () => ({
  readPreference: vi.fn(),
  writePreference: vi.fn(),
}));

const { readPreference, writePreference } = await import('@/shared/lib/cache');
const read = vi.mocked(readPreference);
const write = vi.mocked(writePreference);

beforeEach(() => {
  read.mockReset();
  write.mockReset();
});

describe('默认长期授权偏好', () => {
  it('reads the legacy "1 means on" value', () => {
    read.mockReturnValue('1');
    expect(readUnlimitedApprovalPreference()).toBe(true);
    expect(read).toHaveBeenCalledWith(APPROVAL_PREFERENCE_KEY);
  });

  it('treats absent or any other stored value as off', () => {
    for (const stored of [null, '0', 'true', '']) {
      read.mockReturnValue(stored);
      expect(readUnlimitedApprovalPreference()).toBe(false);
    }
  });

  it('persists on as "1" and off as "0" and reports the write result', () => {
    write.mockReturnValue(true);
    expect(writeUnlimitedApprovalPreference(true)).toBe(true);
    expect(write).toHaveBeenLastCalledWith(APPROVAL_PREFERENCE_KEY, '1');

    write.mockReturnValue(false);
    expect(writeUnlimitedApprovalPreference(false)).toBe(false);
    expect(write).toHaveBeenLastCalledWith(APPROVAL_PREFERENCE_KEY, '0');
  });

  it('uses the namespaced preference key, never a raw localStorage key', () => {
    expect(APPROVAL_PREFERENCE_KEY).toBe('tokenApprovalUseUnlimitedByDefault');
    expect(APPROVAL_PREFERENCE_STORAGE_KEY).toBe('love20:tokenApprovalUseUnlimitedByDefault');
  });

  it('broadcasts a change event so mounted pages re-read the same value', () => {
    write.mockReturnValue(true);
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    writeUnlimitedApprovalPreference(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((dispatch.mock.calls[0]?.[0] as Event).type).toBe(APPROVAL_PREFERENCE_CHANGE_EVENT);
    dispatch.mockRestore();
  });

  it('notifies subscribers on the change event and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUnlimitedApprovalPreference(listener);
    window.dispatchEvent(new Event(APPROVAL_PREFERENCE_CHANGE_EVENT));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.dispatchEvent(new Event(APPROVAL_PREFERENCE_CHANGE_EVENT));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('re-reads on another tab changing the same storage entry', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUnlimitedApprovalPreference(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: APPROVAL_PREFERENCE_STORAGE_KEY }));
    expect(listener).toHaveBeenCalledTimes(1);
    // An unrelated key must not trigger a re-render.
    window.dispatchEvent(new StorageEvent('storage', { key: 'love20:theme' }));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
