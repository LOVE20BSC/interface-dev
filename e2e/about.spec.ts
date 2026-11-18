import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { countSolidButtons } from './wallet-stub';

/**
 * 关于 (UX spec §3.8): the in-app open-source documentation surface.
 *
 * Read-only against the dedicated e2e chain — no wallet and no chain mutation,
 * so this file does not snapshot/revert. It proves the 应用 catalog entry keeps
 * `?symbol=`, both tabs switch with keyboard/click, the docs link is the
 * configured environment URL, the addresses tab shows the configured MemberNFT
 * and airdrop addresses shortened in the middle with tap-to-copy (no explorer on
 * anvil), the data tab reads a numeric supply, and no filled primary action is
 * spent. It also captures the two 390×844 acceptance screenshots.
 */

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');
const SYMBOL = 'TestLOVE20';
const QUERY = `?symbol=${SYMBOL}`;

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/network/anvil31337_dev/network.json'), 'utf8'),
) as {
  brand: { docsUrl: string };
  addresses: { memberNFT: string; airdropDistributor: string; multicall3: string };
};

test.use({
  permissions: ['clipboard-read', 'clipboard-write'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

async function waitForDocsLink(page: Page): Promise<void> {
  await expect(page.getByTestId('about-docs-link')).toBeVisible({ timeout: 15_000 });
}

test.describe('关于页', () => {
  test('应用 → 开源文档 opens /about and keeps ?symbol=', async ({ page }) => {
    await page.goto(`/apps${QUERY}`);

    const entry = page.getByRole('link', { name: /开源文档/ });
    await expect(entry).toBeVisible({ timeout: 15_000 });
    await entry.click();

    await expect(page).toHaveURL(new RegExp(`/about\\${QUERY}$`), { timeout: 15_000 });
    await expect(page.locator('header h1')).toHaveText('关于');
    await waitForDocsLink(page);
    await expect(page.getByRole('tab', { name: '合约地址' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '数据' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/apps\\${QUERY}$`));
  });

  test('shows the configured docs link, both tabs and their data', async ({ page }) => {
    await page.goto(`/about${QUERY}`);
    await waitForDocsLink(page);

    const docs = page.getByTestId('about-docs-link');
    await expect(docs).toHaveAttribute('href', deployment.brand.docsUrl);
    await expect(docs).toHaveAttribute('target', '_blank');
    await expect(docs).toHaveAttribute('rel', /noreferrer/);

    const contractsTab = page.getByRole('tab', { name: '合约地址' });
    const dataTab = page.getByRole('tab', { name: '数据' });
    await expect(contractsTab).toHaveAttribute('aria-selected', 'true');

    // Owner 2026-11-19: every address in the app is shortened in the middle and
    // copied on tap, so /about no longer paints the 40-character address in full.
    // The full string stays in the copy button's `title` (what tapping copies).
    const memberNft = deployment.addresses.memberNFT;
    const airdrop = deployment.addresses.airdropDistributor;
    await expect(page.getByTestId('about-address-memberNFT')).toContainText('身份 NFT');
    const memberNftCopy = page.getByTestId('about-copy-memberNFT');
    await expect(memberNftCopy).toHaveText(/^0x[0-9a-f]{4}…[0-9a-f]{4}$/i);
    await expect(memberNftCopy).toHaveAttribute('title', memberNft);
    await expect(page.getByTestId('about-address-airdropDistributor')).toContainText('空投分发器');
    const airdropCopy = page.getByTestId('about-copy-airdropDistributor');
    await expect(airdropCopy).toHaveText(/^0x[0-9a-f]{4}…[0-9a-f]{4}$/i);
    await expect(airdropCopy).toHaveAttribute('title', airdrop);
    // The abbreviation is real: no 40-char address is printed anywhere on the tab.
    await expect(page.getByText(memberNft)).toHaveCount(0);
    await expect(page.getByText(airdrop)).toHaveCount(0);
    // anvil has no block explorer, so no explorer link may be rendered.
    await expect(page.getByRole('link', { name: /在区块浏览器查看/ })).toHaveCount(0);

    // Copy button gives immediate feedback in place and still copies the full address.
    await memberNftCopy.click();
    await expect(memberNftCopy).toContainText('已复制');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(memberNft);

    // Click switches the tab; ArrowLeft returns to 合约地址 with focus.
    await dataTab.click();
    await expect(dataTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('about-member-nft-total-supply')).toHaveText(/^[0-9,]+$/, {
      timeout: 15_000,
    });
    await expect(page.getByTestId('about-community-total-supply')).toHaveText(/^[0-9,]+ .+$/, {
      timeout: 15_000,
    });
    await expect(page.getByTestId('about-current-phase')).toHaveText(/^[0-9,]+$/, {
      timeout: 15_000,
    });

    await dataTab.press('ArrowLeft');
    await expect(contractsTab).toHaveAttribute('aria-selected', 'true');
    await expect(contractsTab).toBeFocused();

    // No filled primary action on this documentation page.
    expect(await countSolidButtons(page)).toBe(0);
  });

  test('captures both 390×844 tab screenshots', async ({ page }) => {
    await page.goto(`/about${QUERY}`);
    await waitForDocsLink(page);
    // Settle the injected-wallet probe so the header pill does not read 检测钱包中….
    await expect(page.getByRole('button', { name: '连接钱包' }).first()).toHaveText('连接钱包', {
      timeout: 15_000,
    });

    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({
      path: resolve(SHOTS, 'about-contracts.png'),
      animations: 'disabled',
    });

    await page.getByRole('tab', { name: '数据' }).click();
    await expect(page.getByTestId('about-member-nft-total-supply')).toHaveText(/^[0-9,]+$/, {
      timeout: 15_000,
    });
    await page.screenshot({
      path: resolve(SHOTS, 'about-data.png'),
      animations: 'disabled',
    });
  });
});
