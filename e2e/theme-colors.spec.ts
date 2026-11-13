import { expect, test, type Page } from '@playwright/test';

/**
 * 主题 (ADR-0005): colour three-line check — line 2, the browser line.
 *
 * This spec reads the *computed* token values from the running app with
 * getComputedStyle and asserts they equal the theoretical values recorded in
 * docs/product/three-line/theme.md §1 (which were calculated from the WCAG
 * formula before any screenshot was taken). It also proves the persisted
 * choice survives a reload and that the theme page switches the palette
 * immediately.
 *
 * No chain interaction: the 主题 page is a local display preference, so this
 * file does not snapshot/revert the dedicated e2e chain.
 */

const STORAGE_KEY = 'love20:theme';

const THEORETICAL = {
  light: {
    background: '#f6f7fb',
    surface: '#ffffff',
    elevated: '#f8fafc',
    'elevated-hover': '#f1f5f9',
    foreground: '#0f172a',
    muted: '#64748b',
    line: '#e5e9f1',
    'line-strong': '#cbd5e1',
    brand: '#2563eb',
    'brand-strong': '#1d4ed8',
    'brand-soft': '#dbeafe',
    'on-brand': '#ffffff',
    danger: '#dc2626',
    'danger-strong': '#b91c1c',
    'danger-soft': '#fee2e2',
    warning: '#b45309',
    'warning-soft': '#fef3c7',
    success: '#047857',
    'success-soft': '#d1fae5',
  },
  dark: {
    background: '#0b0e11',
    surface: '#1e2329',
    elevated: '#2b3139',
    'elevated-hover': '#2b3139',
    foreground: '#eaecef',
    muted: '#848e9c',
    line: '#2b3139',
    'line-strong': '#474d57',
    brand: '#fcd535',
    'brand-strong': '#fcd535',
    'brand-soft': '#3a331a',
    'on-brand': '#181a20',
    danger: '#f6465d',
    'danger-strong': '#ff6b7a',
    'danger-soft': '#3a1e24',
    warning: '#f0b90b',
    'warning-soft': '#3a3212',
    success: '#0ecb81',
    'success-soft': '#123027',
  },
} as const;

type Palette = keyof typeof THEORETICAL;
type TokenKey = keyof (typeof THEORETICAL)['light'];

const TOKEN_KEYS = Object.keys(THEORETICAL.light) as TokenKey[];

const META_COLOR: Record<Palette, string> = { light: '#f6f7fb', dark: '#0b0e11' };

const BODY_BACKGROUND: Record<Palette, string> = {
  light: 'rgb(246, 247, 251)',
  dark: 'rgb(11, 14, 17)',
};

interface ThemeReadback {
  readonly dataTheme: string | null;
  readonly hasDarkClass: boolean;
  readonly colorScheme: string;
  readonly metaThemeColor: string | null;
  readonly metaColorScheme: string | null;
  readonly bodyBackground: string;
  readonly bodyColor: string;
  readonly tokens: Readonly<Record<string, string>>;
}

async function readTheme(page: Page): Promise<ThemeReadback> {
  return page.evaluate((keys) => {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    return {
      dataTheme: root.dataset.theme ?? null,
      hasDarkClass: root.classList.contains('dark'),
      colorScheme: styles.colorScheme,
      metaThemeColor:
        document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
      metaColorScheme:
        document.querySelector('meta[name="color-scheme"]')?.getAttribute('content') ?? null,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
      tokens: Object.fromEntries(
        keys.map((key) => [key, styles.getPropertyValue(`--color-${key}`).trim()]),
      ),
    };
  }, TOKEN_KEYS as string[]);
}

/**
 * Seeds (or clears) the persisted choice before the app boots.
 *
 * The init script runs on EVERY navigation, so it must seed only once per tab:
 * otherwise the reload after switching to dark would be reset back to the seeded
 * value and the persistence assertion would test the seed, not the app.
 * sessionStorage survives reloads in the same tab, which is exactly the scope we
 * need for this file.
 */
async function seedStoredTheme(page: Page, theme: Palette | null): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      if (window.sessionStorage.getItem('e2e-theme-seeded') === '1') return;
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
      window.sessionStorage.setItem('e2e-theme-seeded', '1');
    },
    { key: STORAGE_KEY, value: theme },
  );
}

/** Expands `#fff` → `#ffffff` so a CSS minifier's shorthand cannot fail the assertion. */
function normalizeHex(value: string): string {
  const token = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(token);
  if (short === null) return token;
  return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
}

async function expectApplied(page: Page, palette: Palette): Promise<void> {
  const readback = await readTheme(page);
  const tokens = Object.fromEntries(
    Object.entries(readback.tokens).map(([key, value]) => [key, normalizeHex(value)]),
  );

  expect(readback.dataTheme).toBe(palette);
  expect(readback.hasDarkClass).toBe(palette === 'dark');
  expect(readback.colorScheme).toBe(palette);
  expect(readback.metaThemeColor).toBe(META_COLOR[palette]);
  expect(readback.metaColorScheme).toBe(palette);
  expect(readback.bodyBackground).toBe(BODY_BACKGROUND[palette]);
  // Line 2 must equal line 1 token by token (the doc records the same table).
  expect(tokens).toEqual(THEORETICAL[palette]);
}

test.describe('主题配色（线二：浏览器计算样式）', () => {
  test('defaults to the light palette when nothing is stored', async ({ page }) => {
    await seedStoredTheme(page, null);
    await page.goto('/theme');
    await expect(page.getByTestId('theme-page')).toBeVisible({ timeout: 15_000 });

    await expectApplied(page, 'light');
    await expect(page.getByRole('radio', { name: '浅色' })).toHaveAttribute('aria-checked', 'true');
  });

  test('applies the stored dark palette before paint and after reload', async ({ page }) => {
    await seedStoredTheme(page, 'dark');
    await page.goto('/theme');
    await expect(page.getByTestId('theme-page')).toBeVisible({ timeout: 15_000 });

    await expectApplied(page, 'dark');
    await expect(page.getByRole('radio', { name: '深色' })).toHaveAttribute('aria-checked', 'true');

    // The boot script must have applied dark before React: the inline script sets
    // the attribute, so a reload keeps the same computed values with no flash.
    await page.reload();
    await expect(page.getByTestId('theme-page')).toBeVisible({ timeout: 15_000 });
    await expectApplied(page, 'dark');
  });

  test('switching on /theme takes effect immediately and persists', async ({ page }) => {
    await seedStoredTheme(page, 'light');
    await page.goto('/theme');
    await expect(page.getByTestId('theme-page')).toBeVisible({ timeout: 15_000 });
    await expectApplied(page, 'light');

    await page.getByRole('radio', { name: '深色' }).click();
    await expectApplied(page, 'dark');
    expect(await page.evaluate(() => window.localStorage.getItem('love20:theme'))).toBe('dark');

    await page.reload();
    await expect(page.getByTestId('theme-page')).toBeVisible({ timeout: 15_000 });
    await expectApplied(page, 'dark');

    await page.getByRole('radio', { name: '浅色' }).click();
    await expectApplied(page, 'light');
    expect(await page.evaluate(() => window.localStorage.getItem('love20:theme'))).toBe('light');
  });
});
