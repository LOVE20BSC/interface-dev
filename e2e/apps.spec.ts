import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * 应用 (UX spec §3.6): the fourth tab is a data-driven feature directory.
 *
 * Read-only against the dedicated e2e chain: no wallet is needed and no chain
 * mutation happens here, so this file does not snapshot/revert. It proves the
 * tab swap (链群 → 应用), the three catalog rows, URL/query preservation, sane
 * back navigation and the 390×844 acceptance screenshot.
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

test.describe('应用目录', () => {
  test('the fourth tab is 应用, opens /apps and 链群 is gone', async ({ page }) => {
    await page.goto(`/${QUERY}`);
    const nav = page.getByRole('navigation', { name: '主导航' });

    await expect(nav.getByRole('link')).toHaveCount(5);
    await expect(nav.getByRole('link', { name: '链群' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: '应用' })).toBeVisible();

    await nav.getByRole('link', { name: '应用' }).click();

    await expect(page).toHaveURL(new RegExp(`/apps\\${QUERY}$`));
    await expect(page.locator('header h1')).toHaveText('应用');
    // Two categories today, so the grouped layout (and its headings) is visible.
    await expect(page.getByRole('heading', { name: '代币' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '身份' })).toBeVisible();
  });

  test('each catalog row opens its feature page with ?symbol= and back returns to /apps', async ({
    page,
  }) => {
    const rows = [
      { name: /创世空投/, path: '/airdrop', title: '空投铸造' },
      { name: /身份 NFT/, path: '/my-nft', title: '我的 NFT' },
      { name: /代币兑换/, path: '/swap', title: '兑换代币' },
    ] as const;

    for (const row of rows) {
      await page.goto(`/apps${QUERY}`);
      await page.getByRole('link', { name: row.name }).click();

      await expect(page).toHaveURL(new RegExp(`${row.path}\\${QUERY}`), { timeout: 15_000 });
      await expect(page.locator('header h1')).toHaveText(row.title, { timeout: 15_000 });

      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/apps\\${QUERY}$`), { timeout: 15_000 });
      await expect(page.locator('header h1')).toHaveText('应用');
    }
  });

  test('captures the 390×844 apps catalog screenshot', async ({ page }) => {
    await page.goto(`/apps${QUERY}`);
    await expect(page).toHaveTitle(`应用 · ${SYMBOL}`, { timeout: 15_000 });
    // The header renders before the lazy route chunk: wait for real rows, not
    // the route-fallback skeleton, before taking the acceptance screenshot.
    await expect(page.getByRole('link', { name: /创世空投/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('按快照份额铸造创世代币')).toBeVisible();
    // Settle the injected-wallet probe so the pill does not read 检测钱包中….
    // The accessible name is always 连接钱包, so assert the visible label too.
    await expect(page.getByRole('button', { name: '连接钱包' }).first()).toHaveText('连接钱包', {
      timeout: 15_000,
    });
    // No filled action belongs on a navigation-only page.
    await expect(page.locator('main button')).toHaveCount(0);

    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({
      path: resolve(SHOTS, 'apps-catalog.png'),
      animations: 'disabled',
    });
  });
});
