import { expect, test } from '@playwright/test';

test.describe('M0 shell', () => {
  test('renders the home shell and connect entry', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();
    // The home wordmark follows the community symbol() (LOVE20 only as fallback),
    // so assert the accessible brand link without pinning it to the protocol name.
    await expect(page.getByRole('banner').getByRole('link', { name: /首页$/ })).toBeVisible();
    // The header pill and the identity area both offer connect while disconnected.
    await expect(page.getByRole('button', { name: '连接钱包' }).first()).toBeVisible();
    // Five mobile tabs are visible at the phone viewport.
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
  });

  test('deep link to a secondary page has a back control', async ({ page }) => {
    await page.goto('/my-nft');
    await expect(page.getByRole('heading', { name: '我的 NFT' })).toBeVisible();
    await expect(page.getByRole('button', { name: '返回上一页' })).toBeVisible();
    // lazy route chunk + community resolution share the §1.3 tab-title rule.
    await expect(page).toHaveTitle('我的 NFT · TestLOVE20', { timeout: 15_000 });
  });

  test('unknown community falls back to the protocol label in tab title and wordmark', async ({
    page,
  }) => {
    await page.goto('/?symbol=NOT_A_REAL_COMMUNITY');
    await expect(page.getByRole('link', { name: 'LOVE20协议 首页' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveTitle('LOVE20协议');
  });
});
