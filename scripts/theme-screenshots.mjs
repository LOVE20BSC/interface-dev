/* global document, window, getComputedStyle */
/**
 * Theme screenshot + colour verification harness (ADR-0005, three-line check).
 *
 * Runs against the Vite dev server (`pnpm dev --port 5175`) so it never builds a
 * dist and never touches the human anvil chain on :8545 — every request to that
 * origin is aborted, so the page renders its honest "cannot read the chain"
 * states while the palette itself is fully verifiable.
 *
 * What it does
 *   1. Loads /, /apps and /theme in both palettes at 390×844 and 1280×800 and
 *      writes docs/product/screenshots/theme-<palette>-<page>-<viewport>.png;
 *   2. Reads the real token values with getComputedStyle, recomputes the WCAG
 *      contrast pairs and compares them with the theoretical values from
 *      docs/product/three-line/theme.md §1 (line 2 of the three-line check);
 *   3. Prints a JSON summary on stdout (the same numbers §2 of the doc records).
 *
 * Usage:
 *   pnpm dev --port 5175          # separate terminal
 *   node scripts/theme-screenshots.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = (process.env.THEME_BASE_URL ?? 'http://127.0.0.1:5175').replace(/\/+$/, '');
const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');
const HUMAN_CHAIN = 'http://127.0.0.1:8545';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'apps', path: '/apps' },
  { name: 'theme', path: '/theme' },
];

/** Line 1 values, copied verbatim from src/index.css (light @theme / dark block). */
const EXPECTED_TOKENS = {
  light: {
    background: '#edf1f7',
    surface: '#ffffff',
    elevated: '#f2f6fb',
    'elevated-hover': '#e4ebf5',
    foreground: '#0f172a',
    muted: '#55647a',
    line: '#d9e1ec',
    'line-strong': '#b7c3d4',
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
};

/** WCAG pairs from docs/product/three-line/theme.md §1. */
const PAIRS = [
  ['foreground', 'background', 4.5],
  ['foreground', 'surface', 4.5],
  ['foreground', 'elevated', 4.5],
  ['brand-strong', 'background', 4.5],
  ['brand-strong', 'surface', 4.5],
  ['brand-strong', 'brand-soft', 4.5],
  ['on-brand', 'brand', 4.5],
  ['on-brand', 'danger', 4.5],
  ['danger-strong', 'surface', 4.5],
  ['danger-strong', 'danger-soft', 4.5],
  ['warning', 'warning-soft', 4.5],
  ['success', 'success-soft', 4.5],
  ['muted', 'background', 3],
  ['muted', 'surface', 3],
  ['muted', 'elevated', 3],
  ['brand', 'surface', 3],
];

function luminance(hex) {
  const clean = hex.trim().replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(clean.slice(offset, offset + 2), 16) / 255);
  const linear = (channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function normalizeColor(value) {
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  const rgb = hex.match(/^rgba?\(([^)]+)\)$/);
  if (rgb === null) return hex;
  const [r, g, b] = rgb[1]
    .split(/[,/]/)
    .slice(0, 3)
    .map((part) => Math.round(Number.parseFloat(part.trim())));
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

async function readTokens(page) {
  return page.evaluate((keys) => {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const tokens = Object.fromEntries(
      keys.map((key) => [key, styles.getPropertyValue(`--color-${key}`).trim()]),
    );
    return {
      tokens,
      colorScheme: styles.colorScheme,
      dataTheme: root.dataset.theme ?? null,
      hasDarkClass: root.classList.contains('dark'),
      htmlBackground: getComputedStyle(root).backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
      metaThemeColor:
        document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
    };
  }, Object.keys(EXPECTED_TOKENS.light));
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const report = { baseUrl: BASE_URL, palettes: {}, screenshots: [], failures: [] };

  try {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: VIEWPORTS[0] });
      await context.addInitScript((palette) => {
        window.localStorage.setItem('love20:theme', palette);
      }, theme);
      await context.route('**/*', (route) => {
        if (route.request().url().startsWith(HUMAN_CHAIN)) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();

      // Line 2: real computed values from the running app.
      await page.goto(`${BASE_URL}/theme`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('theme-page').waitFor({ state: 'visible' });
      const readback = await readTokens(page);
      const computed = Object.fromEntries(
        Object.entries(readback.tokens).map(([key, value]) => [key, normalizeColor(value)]),
      );
      const mismatches = Object.entries(EXPECTED_TOKENS[theme]).filter(
        ([key, expected]) => computed[key] !== expected.toLowerCase(),
      );
      const pairs = PAIRS.map(([fg, bg, requirement]) => {
        const ratio = contrast(computed[fg], computed[bg]);
        const ok = ratio >= requirement;
        if (!ok)
          report.failures.push(`${theme}: ${fg} on ${bg} = ${ratio.toFixed(2)} < ${requirement}`);
        return {
          foreground: fg,
          background: bg,
          foregroundHex: computed[fg],
          backgroundHex: computed[bg],
          ratio: Number(ratio.toFixed(2)),
          requirement,
          ok,
        };
      });
      report.palettes[theme] = {
        dataTheme: readback.dataTheme,
        hasDarkClass: readback.hasDarkClass,
        colorScheme: readback.colorScheme,
        metaThemeColor: readback.metaThemeColor,
        htmlBackground: normalizeColor(readback.htmlBackground),
        bodyBackground: normalizeColor(readback.bodyBackground),
        bodyColor: normalizeColor(readback.bodyColor),
        mismatches,
        pairs,
      };
      if (readback.dataTheme !== theme)
        report.failures.push(`${theme}: data-theme=${readback.dataTheme}`);
      if (readback.hasDarkClass !== (theme === 'dark')) {
        report.failures.push(`${theme}: .dark class=${readback.hasDarkClass}`);
      }
      if (readback.colorScheme !== theme)
        report.failures.push(`${theme}: color-scheme=${readback.colorScheme}`);
      for (const mismatch of mismatches) {
        report.failures.push(
          `${theme}: token ${mismatch[0]} = ${computed[mismatch[0]]} ≠ ${mismatch[1]}`,
        );
      }

      // Screenshots: both viewports, all three pages.
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        for (const target of PAGES) {
          await page.goto(`${BASE_URL}${target.path}`, { waitUntil: 'domcontentloaded' });
          await page.locator('header').first().waitFor({ state: 'visible' });
          // Wait out the 600 ms injected-wallet probe so the pill settles on
          // 连接钱包 instead of capturing the transient 检测钱包中… state.
          await page
            .waitForFunction(
              () =>
                [...document.querySelectorAll('button')].some((button) =>
                  (button.textContent ?? '').includes('连接钱包'),
                ),
              undefined,
              { timeout: 6_000 },
            )
            .catch(() => undefined);
          if (target.name === 'apps') {
            await page.getByRole('link', { name: /主题/ }).waitFor({ state: 'visible' });
          }
          if (target.name === 'theme') {
            await page.getByTestId('theme-page').waitFor({ state: 'visible' });
          }
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(250);
          const file = `theme-${theme}-${target.name}-${viewport.name}.png`;
          await page.screenshot({
            path: resolve(SHOTS, file),
            animations: 'disabled',
            fullPage: false,
          });
          report.screenshots.push(`docs/product/screenshots/${file}`);
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const summaryPath = process.env.THEME_REPORT_PATH ?? '/tmp/theme-line2.json';
  writeFileSync(summaryPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length > 0) {
    console.error(`\nFAILED: ${report.failures.length} colour check(s)`);
    process.exitCode = 1;
  }
}

await main();
