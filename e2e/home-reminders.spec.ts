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
 * 首页提醒流 + 我的页 (UX spec §3.1 / §3.7, owner 2026-11-11).
 *
 * The home page only answers 「有没有需要我处理的事」: a thin line into 我的
 * plus conditional reminder cards, or exactly one muted sentence when nothing
 * applies. Identity and balance details live on 我的.
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

function thinLine(page: Page) {
  // Scoped by test id: the bottom nav and desktop sidebar also link to /me.
  return page.getByTestId('home-thin-line');
}

isolateChain();

test.describe('首页提醒流', () => {
  test('disconnected: connect entry + wordmark + thin line, no reminders', async ({ page }) => {
    await installWallet(page, ACCOUNTS.withIdentity);
    await page.goto('/');

    await expect(page.getByRole('button', { name: '连接钱包' })).toHaveCount(2);
    await expectHomeWordmark(page, true);
    await expect(thinLine(page)).toBeVisible();
    await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '铸造身份' })).toHaveCount(0);
    await expect(page.getByText('你有空投资格')).toHaveCount(0);
  });

  test('connected with identity and nothing to do: thin line + one sentence only', async ({
    page,
  }) => {
    await installWallet(page, ACCOUNTS.withIdentity);
    await seedIdentity(page, ACCOUNTS.withIdentity, '1');
    await page.goto('/');
    await connect(page);

    const line = thinLine(page);
    await expect(line).toContainText(SEEDED_NAME, { timeout: 15_000 });
    await expect(line).toContainText('99,799,100 TestLOVE20');
    await expectHomeWordmark(page, false);

    // Exactly one muted sentence, and no reminder cards around it.
    await expect(page.getByText('现在没有需要你处理的事。')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(1);
    await expect(page.locator('section[aria-labelledby^="home-reminder"]')).toHaveCount(0);
    expect(await countSolidButtons(page)).toBe(0);
  });

  test('no identity: the first reminder offers 铸造身份', async ({ page }) => {
    await installWallet(page, ACCOUNTS.outsider);
    await page.goto('/');
    await connect(page);

    const reminder = page.locator('section[aria-labelledby="home-reminder-identity"]');
    await expect(reminder).toBeVisible({ timeout: 15_000 });
    await expect(reminder.getByRole('heading', { name: '你还没有身份' })).toBeVisible();
    await expect(reminder.getByRole('link', { name: '铸造身份' })).toHaveAttribute(
      'href',
      '/mint?symbol=TestLOVE20',
    );
    await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
    expect(await countSolidButtons(page)).toBe(1);
    await expectHomeWordmark(page, false);
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
    await expect(identityBlock.getByText('身份 #1')).toBeVisible();
    for (const name of ['切换身份', '转让', '查看全部']) {
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

  test('falls back to 铸造身份 when the wallet has no identity', async ({ page }) => {
    await installWallet(page, ACCOUNTS.outsider);
    await page.goto('/me?symbol=TestLOVE20');
    await connect(page);

    await expect(page.getByText('你还没有身份')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: '铸造身份' })).toHaveAttribute(
      'href',
      '/mint?symbol=TestLOVE20',
    );
  });
});
