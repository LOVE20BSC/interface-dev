import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPROVAL_PREFERENCE_KEY,
  readUnlimitedApprovalPreference,
  writeUnlimitedApprovalPreference,
} from '@/features/approve-token/lib/approval-preference';

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
  });
});
