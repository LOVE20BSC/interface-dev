import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { isolateChain } from './chain';
import {
  ACCOUNTS,
  SEEDED_NAME,
  countSolidButtons,
  connect,
  expectHomeWordmark,
  installWallet,
  seedIdentity,
} from './wallet-stub';

/**
 * 首页提醒流 + 我的页 (UX spec §3.1 / §3.7, owners 2026-11-11/12).
 *
 * The home page opens with a greeting naming the current identity NFT, then only
 * answers 「有没有需要我处理的事」 with conditional reminder cards. With nothing
 * to do it is just the greeting — no footer, no muted "nothing to do" sentence.
 * Identity and balance details live on 我的.
 */

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS, name), animations: 'disabled' });
}

function greeting(page: Page) {
  return page.getByRole('heading', { level: 1 });
}

isolateChain();

test.describe('首页提醒流', () => {
  test('disconnected: greeting + connect entry + wordmark, no reminders', async ({ page }) => {
    await installWallet(page, ACCOUNTS.withIdentity);
    await page.goto('/');

    await expect(page.getByRole('button', { name: '连接钱包' })).toHaveCount(2);
    await expectHomeWordmark(page, true);
    await expect(greeting(page)).toHaveText('你好');
    await expect(page.getByTestId('home-thin-line')).toHaveCount(0);
    await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '铸造身份 NFT' })).toHaveCount(0);
    await expect(page.getByText('你有空投资格')).toHaveCount(0);
  });

  test('connected with identity and nothing to do: greeting only', async ({ page }) => {
    await installWallet(page, ACCOUNTS.withIdentity);
    await seedIdentity(page, ACCOUNTS.withIdentity, '1');
    await page.goto('/');
    await connect(page);

    await expect(greeting(page)).toHaveText(`你好，${SEEDED_NAME}`, { timeout: 15_000 });
    // Balance stays on 我的; home does not repeat it.
    await expect(page.getByText(/99,799,100/)).toHaveCount(0);
    await expectHomeWordmark(page, false);

    // No filler sentence, no reminder cards and no footer.
    await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
    await expect(page.locator('section[aria-labelledby^="home-reminder"]')).toHaveCount(0);
    expect(await countSolidButtons(page)).toBe(0);
  });

  test('no identity: the first reminder offers 铸造身份 NFT', async ({ page }) => {
    await installWallet(page, ACCOUNTS.outsider);
    await page.goto('/');
    await connect(page);

    const reminder = page.locator('section[aria-labelledby="home-reminder-identity"]');
    await expect(reminder).toBeVisible({ timeout: 15_000 });
    await expect(reminder.getByRole('heading', { name: '你还没有身份 NFT' })).toBeVisible();
    await expect(reminder.getByRole('link', { name: '铸造身份 NFT' })).toHaveAttribute(
      'href',
      '/mint?symbol=TestLOVE20',
    );
    await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
    expect(await countSolidButtons(page)).toBe(1);
    await expectHomeWordmark(page, false);
  });

  test('holds identities but none selected: asks to pick one, no empty sentence', async ({
    page,
  }) => {
    await installWallet(page, ACCOUNTS.withIdentity);
    await page.goto('/');
    await connect(page);

    const reminder = page.locator('section[aria-labelledby="home-reminder-choose-identity"]');
    await expect(reminder).toBeVisible({ timeout: 15_000 });
    await expect(reminder.getByRole('heading', { name: '你还没有选择身份 NFT' })).toBeVisible();
    await expect(reminder.getByRole('link', { name: '选择身份 NFT' })).toHaveAttribute(
      'href',
      '/my-nft?symbol=TestLOVE20',
    );
    await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
    // Mutually exclusive with the no-identity card; it owns the one filled button.
    await expect(page.getByRole('link', { name: '铸造身份 NFT' })).toHaveCount(0);
    expect(await countSolidButtons(page)).toBe(1);

    await shot(page, 'home-needs-selection.png');
  });

  test('eligible: the airdrop reminder shows the claimable amount and one CTA', async ({
    page,
  }) => {
    await installWallet(page, ACCOUNTS.eligible);
    await page.goto('/');
    await connect(page);

    const reminder = page.locator('section[aria-labelledby="home-reminder-airdrop"]');
    await expect(reminder).toBeVisible({ timeout: 20_000 });
    await expect(reminder.getByRole('heading')).toContainText('你有空投资格，可铸造');
    await expect(reminder.getByRole('link', { name: '空投铸造' })).toHaveAttribute(
      'href',
      '/airdrop?symbol=TestLOVE20',
    );
    // Two reminders can coexist; only the first one spends the filled button.
    expect(await countSolidButtons(page)).toBe(1);
  });
});

test.describe('我的', () => {
  test('carries identity and balance as a settings-ish list', async ({ page }) => {
    await installWallet(page, ACCOUNTS.withIdentity);
    await seedIdentity(page, ACCOUNTS.withIdentity, '1');
    await page.goto('/me?symbol=TestLOVE20');
    await connect(page);

    const identityBlock = page.locator('section[aria-labelledby="me-identity-title"]');
    await expect(identityBlock).toBeVisible({ timeout: 15_000 });
    await expect(identityBlock.getByText(SEEDED_NAME)).toBeVisible();
    await expect(identityBlock.getByText('NFT #1')).toBeVisible();
    for (const name of ['切换身份 NFT', '转让', '查看全部']) {
      await expect(page.getByRole('link', { name })).toHaveAttribute(
        'href',
        '/my-nft?symbol=TestLOVE20',
      );
    }

    await expect(page.getByRole('heading', { name: '我的余额' })).toBeVisible();
    await expect(page.getByText('99,799,100 TestLOVE20')).toBeVisible();
    await expect(page.getByRole('link', { name: '兑换' })).toHaveAttribute(
      'href',
      '/swap?symbol=TestLOVE20',
    );

    // Settings-ish: no filled action on the page.
    expect(await countSolidButtons(page)).toBe(0);

    await shot(page, 'me-profile.png');
  });

  test('falls back to 铸造身份 NFT when the wallet has no identity NFT', async ({ page }) => {
    await installWallet(page, ACCOUNTS.outsider);
    await page.goto('/me?symbol=TestLOVE20');
    await connect(page);

    await expect(page.getByText('你还没有身份 NFT')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: '铸造身份 NFT' })).toHaveAttribute(
      'href',
      '/mint?symbol=TestLOVE20',
    );
  });
});
