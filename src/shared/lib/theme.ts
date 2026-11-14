import { readPreference, writePreference } from '@/shared/lib/cache';

/**
 * Theme state (ADR-0005).
 *
 * Three places must agree for a frame-perfect switch:
 *   1. `document.documentElement.dataset.theme` (`data-theme="light|dark"`) —
 *      `src/index.css` keys the whole dark token block off this attribute;
 *   2. `document.documentElement.classList` (`dark`) — kept for CSS/third-party
 *      conventions and `color-scheme` aware UA widgets;
 *   3. `document.documentElement.style.colorScheme` — native form controls,
 *      scrollbars and the `<meta name="color-scheme">` hint.
 *
 * The choice is persisted in `love20:theme` (chain/wallet independent, see
 * shared/lib/cache.ts) and is read *before the first paint* by the inline
 * bootstrap script in index.html. This module is the single source of truth for
 * the ids, the storage key and the meta colours; the inline script mirrors those
 * constants and `theme.test.ts` guards the mirror.
 *
 * There is deliberately no `system` option: the product ships exactly two
 * explicit palettes (owner 2026-11-14), matching the legacy library screen.
 */

export type ThemeId = 'light' | 'dark';
export type ThemeColorScheme = 'light' | 'dark';

/**
 * Colours used by the 主题 page's preview cards. They are literal token values
 * on purpose: the page shows both palettes at once, so neither card may depend
 * on the palette that is currently applied to the document.
 */
export interface ThemePreview {
  readonly canvas: string;
  readonly surface: string;
  readonly elevated: string;
  readonly text: string;
  readonly muted: string;
  readonly brand: string;
  readonly onBrand: string;
  readonly line: string;
}

export interface ThemeDefinition {
  readonly id: ThemeId;
  readonly colorScheme: ThemeColorScheme;
  readonly preview: ThemePreview;
}

export const DEFAULT_THEME: ThemeId = 'light';
export const THEME_STORAGE_KEY = 'theme';
export const THEME_CHANGE_EVENT = 'love20:theme-change';

/** `theme-color` meta content per palette (mobile browser chrome). */
export const THEME_META_COLOR: Readonly<Record<ThemeId, string>> = Object.freeze({
  light: '#edf1f7',
  dark: '#0b0e11',
});

export const THEMES: readonly ThemeDefinition[] = Object.freeze([
  {
    id: 'light',
    colorScheme: 'light',
    preview: {
      canvas: '#edf1f7',
      surface: '#ffffff',
      elevated: '#f2f6fb',
      text: '#0f172a',
      muted: '#55647a',
      brand: '#2563eb',
      onBrand: '#ffffff',
      line: '#d9e1ec',
    },
  },
  {
    id: 'dark',
    colorScheme: 'dark',
    preview: {
      canvas: '#0b0e11',
      surface: '#1e2329',
      elevated: '#2b3139',
      text: '#eaecef',
      muted: '#848e9c',
      brand: '#fcd535',
      onBrand: '#181a20',
      line: '#474d57',
    },
  },
] as const);

const THEME_IDS: ReadonlySet<string> = new Set(THEMES.map((theme) => theme.id));

/**
 * Pure resolver: anything that is not an exact known id falls back to light.
 * Used for storage reads, the `data-theme` attribute and tests, so an unknown
 * value can never leave the app without a palette.
 */
export function resolveTheme(value: string | null | undefined): ThemeId {
  return value !== null && value !== undefined && THEME_IDS.has(value)
    ? (value as ThemeId)
    : DEFAULT_THEME;
}

/** The persisted preference, or the default when absent/unreadable. */
export function readStoredTheme(): ThemeId {
  return resolveTheme(readPreference(THEME_STORAGE_KEY));
}

/** The palette currently applied to the document (the bootstrap value after load). */
export function getTheme(): ThemeId {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return resolveTheme(document.documentElement.dataset.theme);
}

function themeColorScheme(theme: ThemeId): ThemeColorScheme {
  return theme === 'dark' ? 'dark' : 'light';
}

/**
 * Applies a palette to the document and, by default, persists it.
 *
 * Persistence is best-effort: a throwing/full localStorage must not stop the
 * palette from switching on the current page (cache.writePreference swallows the
 * error). The change event lets every mounted `useTheme()` re-read the same DOM
 * attribute instead of keeping a private copy.
 */
export function applyTheme(theme: ThemeId, options: { readonly persist?: boolean } = {}): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(theme);
  const colorScheme = themeColorScheme(resolved);
  const root = document.documentElement;

  root.dataset.theme = resolved;
  root.classList.toggle('dark', colorScheme === 'dark');
  root.style.colorScheme = colorScheme;

  // Mobile browser chrome follows the canvas, not the stored object.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_META_COLOR[resolved]);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', colorScheme);

  if (options.persist !== false) {
    writePreference(THEME_STORAGE_KEY, resolved);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }
}

/** Subscribe to palette changes coming from any component. Returns an unsubscribe fn. */
export function subscribeTheme(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(THEME_CHANGE_EVENT, listener);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, listener);
}
