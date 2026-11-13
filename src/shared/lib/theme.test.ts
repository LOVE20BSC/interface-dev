import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  DEFAULT_THEME,
  getTheme,
  readStoredTheme,
  resolveTheme,
  THEME_META_COLOR,
  THEMES,
} from './theme';

const STORAGE_KEY = 'love20:theme';

function html(): string {
  return readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
}

beforeEach(() => {
  document.head.innerHTML =
    '<meta name="theme-color" content="#f6f7fb" /><meta name="color-scheme" content="light" />';
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveTheme', () => {
  it('accepts exactly the two known palettes', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('falls back to light for absent or illegal values', () => {
    for (const value of [null, undefined, '', 'system', 'DARK', ' dark', 'blue']) {
      expect(resolveTheme(value)).toBe(DEFAULT_THEME);
    }
    expect(DEFAULT_THEME).toBe('light');
  });
});

describe('readStoredTheme', () => {
  it('reads the persisted palette through the cache boundary', () => {
    expect(readStoredTheme()).toBe('light');
    window.localStorage.setItem(STORAGE_KEY, 'dark');
    expect(readStoredTheme()).toBe('dark');
  });

  it('falls back to light when the stored value is junk', () => {
    window.localStorage.setItem(STORAGE_KEY, 'sepia');
    expect(readStoredTheme()).toBe('light');
  });
});

describe('applyTheme', () => {
  it('writes data-theme, .dark, color-scheme, meta tags and storage', () => {
    applyTheme('dark');

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      THEME_META_COLOR.dark,
    );
    expect(document.querySelector('meta[name="color-scheme"]')?.getAttribute('content')).toBe(
      'dark',
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');

    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('still applies the palette when localStorage throws (private mode)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => applyTheme('dark')).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(getTheme()).toBe('dark');
  });

  it('always exposes a stable theme id per definition', () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(['light', 'dark']);
    expect(THEMES.map((theme) => theme.colorScheme)).toEqual(['light', 'dark']);
  });
});

describe('index.html bootstrap script', () => {
  it('applies the stored palette before the module entry (no light flash)', () => {
    const source = html();
    const bootstrap = source.indexOf(STORAGE_KEY);
    const moduleEntry = source.indexOf('<script type="module"');

    expect(bootstrap).toBeGreaterThan(-1);
    expect(moduleEntry).toBeGreaterThan(-1);
    // The inline script must run before the React entry chunk is requested.
    expect(bootstrap).toBeLessThan(moduleEntry);
    expect(source).toContain(`'${STORAGE_KEY}'`);
    expect(source).toContain("setAttribute('data-theme'");
    expect(source).toContain("classList.toggle('dark'");
    expect(source).toContain('root.style.colorScheme');
    expect(source).toContain(THEME_META_COLOR.light);
    expect(source).toContain(THEME_META_COLOR.dark);
    expect(source).toContain('meta[name="theme-color"]');
    expect(source).toContain('meta[name="color-scheme"]');
  });
});
