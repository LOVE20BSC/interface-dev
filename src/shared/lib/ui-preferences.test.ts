import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASSET_PROTECTION_CHANGE_EVENT,
  ASSET_PROTECTION_STORAGE_KEY,
  assetProtectionPreference,
  createBooleanPreference,
} from '@/shared/lib/ui-preferences';

describe('assetProtectionPreference', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to ON when this device has no stored choice', () => {
    expect(window.localStorage.getItem(ASSET_PROTECTION_STORAGE_KEY)).toBeNull();
    expect(assetProtectionPreference.get()).toBe(true);
    expect(assetProtectionPreference.defaultValue).toBe(true);
  });

  it('reads the legacy key and encoding verbatim (`1` on / `0` off)', () => {
    // The TKM library wrote this exact key/value; a returning user keeps their choice.
    expect(ASSET_PROTECTION_STORAGE_KEY).toBe('love20:transfer:assetProtectionEnabled');
    window.localStorage.setItem(ASSET_PROTECTION_STORAGE_KEY, '0');
    expect(assetProtectionPreference.get()).toBe(false);
    window.localStorage.setItem(ASSET_PROTECTION_STORAGE_KEY, '1');
    expect(assetProtectionPreference.get()).toBe(true);
  });

  it('treats an unrecognised stored value as off instead of crashing', () => {
    window.localStorage.setItem(ASSET_PROTECTION_STORAGE_KEY, 'yes');
    expect(assetProtectionPreference.get()).toBe(false);
  });

  it('persists with the same encoding and notifies listeners in this tab', () => {
    const listener = vi.fn();
    const unsubscribe = assetProtectionPreference.subscribe(listener);

    assetProtectionPreference.set(false);
    expect(window.localStorage.getItem(ASSET_PROTECTION_STORAGE_KEY)).toBe('0');
    expect(assetProtectionPreference.get()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    assetProtectionPreference.set(true);
    expect(window.localStorage.getItem(ASSET_PROTECTION_STORAGE_KEY)).toBe('1');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    assetProtectionPreference.set(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('dispatches the documented change event', () => {
    const onEvent = vi.fn();
    window.addEventListener(ASSET_PROTECTION_CHANGE_EVENT, onEvent);
    assetProtectionPreference.set(false);
    expect(onEvent).toHaveBeenCalledTimes(1);
    window.removeEventListener(ASSET_PROTECTION_CHANGE_EVENT, onEvent);
  });
});

describe('createBooleanPreference', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('falls back to its own default and honours the same encoding', () => {
    const preference = createBooleanPreference(
      'love20:test:someFlag',
      'testPreferenceChanged',
      false,
    );
    expect(preference.get()).toBe(false);
    preference.set(true);
    expect(preference.get()).toBe(true);
    expect(window.localStorage.getItem('love20:test:someFlag')).toBe('1');
    preference.set(false);
    expect(window.localStorage.getItem('love20:test:someFlag')).toBe('0');
  });
});
