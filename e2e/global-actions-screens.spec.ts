import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, connect, installWallet } from './wallet-stub';

/**
 * 全局动作按钮与回执整改（owner 2026-11-14）截图证据.
 *
 * Four combinations per page: 390×844 / 1280×800 × light / dark. The pages are
 * read-only (no transaction is submitted), so this spec never mutates the chain.
 * Files land in docs/product/screenshots/ with a `global-actions-` prefix so the
 * per-page agents' canonical screenshots are not overwritten.
 */

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');
const SYMBOL = 'TestLOVE20';
const QUERY = `?symbol=${SYMBOL}`;

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

const THEMES = ['light', 'dark'] as const;

async function shot(page: Page, name: string, theme: string, viewport: string): Promise<void> {
  await page.screenshot({ path: resolve(SHOTS, `global-actions-${name}-${theme}-${viewport}.png`) });
}

async function seedTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((value: string) => {
    window.localStorage.setItem('love20:theme', value);
  }, theme);
}

async function open(
  page: Page,
  path: string,
  theme: 'light' | 'dark',
  account: string = ACCOUNTS.withIdentity,
): Promise<void> {
  await installWallet(page, account);
  await seedTheme(page, theme);
  await page.goto(path);
  await connect(page);
}

test.describe('全局动作按钮与回执整改截图', () => {
  test('390×844 / 1280×800 · 浅色 / 深色：六个任务页', async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    test.setTimeout(240_000);
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        // 兑换：ERC20 输入 → 卡内出现 授权 {symbol}，兑换按钮在其后。
        await open(page, `/swap${QUERY}&from=${SYMBOL}&to=ETH`, theme);
        await expect(page.getByTestId('swap-from-token')).toContainText(SYMBOL, {
          timeout: 20_000,
        });
        await page.getByTestId('swap-from-amount').fill('100');
        await expect(page.getByTestId('swap-approve-step')).toBeVisible({ timeout: 20_000 });
        await shot(page, 'swap', theme, viewport.name);

        // 铸造：先授权按钮、后铸造主按钮，都在内容流里。
        await open(page, `/mint${QUERY}`, theme);
        await expect(page.getByTestId('mint-approve')).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId('mint-approve')).not.toContainText('读取授权额度中');
        await expect(page.getByTestId('mint-submit')).toBeVisible();
        await shot(page, 'mint', theme, viewport.name);

        // 空投：可铸造态只有「空投铸造」，页面底部没有「回首页」。
        // #5 is in the snapshot and has not claimed yet, so the page shows S5
        // 可铸造 (the only state with the 空投铸造 CTA).
        await open(page, `/airdrop${QUERY}`, theme, ACCOUNTS.eligible);
        await expect(page.getByTestId('airdrop-expected-amount')).toBeVisible({ timeout: 20_000 });
        await shot(page, 'airdrop', theme, viewport.name);

        // 转账：没有「不能撤回」提示，也没有底部「回首页」。
        await open(page, `/transfer${QUERY}`, theme);
        await expect(page.getByTestId('transfer-submit')).toBeVisible({ timeout: 20_000 });
        await shot(page, 'transfer', theme, viewport.name);

        // 批量转账：代币模式的授权 CTA 用全局文案。
        await open(page, `/batch-transfer${QUERY}`, theme);
        await expect(page.getByTestId('batch-transfer-submit')).toBeVisible({ timeout: 20_000 });
        await shot(page, 'batch-transfer', theme, viewport.name);

        // 流动性：授权按钮在前、确认按钮在后，都在流内。
        await open(page, `/liquidity${QUERY}`, theme);
        await expect(page.getByTestId('liquidity-add-approve')).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId('liquidity-add-approve')).not.toContainText('读取授权额度中');
        await expect(page.getByTestId('liquidity-add-submit')).toBeVisible();
        await shot(page, 'liquidity', theme, viewport.name);
      }
    }
  });
});
