import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { isolateChain } from './chain';
import {
  ACCOUNTS,
  MULTICALL3,
  RPC_URL,
  SEEDED_NAME,
  countSolidButtons,
  connect,
  expectHomeWordmark,
  identityCacheKey,
  installWallet,
  seedIdentity,
} from './wallet-stub';

/**
 * M0 identity-first pages against the dedicated anvil chain.
 *
 * Home is greeting + reminder feed (UX spec §3.1, owners 2026-11-11/12): the
 * page h1 greets the current identity NFT, followed by conditional reminder
 * cards; identity and balance details live in 我的. With nothing to do the page
 * is just greeting + footer (no filler sentence).
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

/** The page h1 greeting (never a link). */
function greeting(page: Page) {
  return page.getByRole('heading', { level: 1 });
}

// Snapshot before any test touches the chain; afterAll restores it.
isolateChain();

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });
});

test('home: disconnected shows the greeting, connect entry and wordmark', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await page.goto('/');

  await expect(page.getByRole('button', { name: '连接钱包' })).toHaveCount(2);
  await expect(
    page.getByText('一个钱包可以拥有多个身份 NFT，身份 NFT 才是参与凭证。'),
  ).toBeVisible();
  // Not connected still greets, and never names an identity.
  await expect(greeting(page)).toHaveText('你好');
  expect(await greeting(page).locator('a').count()).toBe(0);
  await expect(page.getByText('你还没有身份 NFT')).toHaveCount(0);
  await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
  expect(await countSolidButtons(page)).toBe(1);
  await expectHomeWordmark(page, true);

  // The old navigation rows and thin line are gone.
  await expect(page.getByTestId('home-thin-line')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '我的 NFT' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '兑换代币' })).toHaveCount(0);
  await expect(page).toHaveTitle('TestLOVE20');

  await shot(page, 'home-disconnected.png');
});

test('home: wrong chain shows the red outlined switch pill, not a solid fill', async ({ page }) => {
  // EIP-1193 stub reports mainnet; the app targets 31337, so the header pill
  // must become the §1.4 outlined switch button instead of a danger fill.
  await installWallet(page, ACCOUNTS.outsider, '0x1');
  await page.goto('/');

  const connect = page.getByRole('button', { name: '连接钱包' }).first();
  await expect(connect).toBeEnabled({ timeout: 15_000 });
  await connect.click();

  const pill = page.getByRole('button', { name: '网络不对，点此切换' }).first();
  await expect(pill).toBeVisible({ timeout: 15_000 });

  const style = await pill.evaluate((node) => {
    const element = node as HTMLElement;
    const computed = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      backgroundColor: computed.backgroundColor,
      borderTopColor: computed.borderTopColor,
      borderTopWidth: computed.borderTopWidth,
      color: computed.color,
      height: rect.height,
      paddingLeft: computed.paddingLeft,
      paddingRight: computed.paddingRight,
    };
  });
  // Transparent fill, 1px red border, red text.
  expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(style.borderTopColor).toBe('rgb(220, 38, 38)');
  expect(style.borderTopWidth).toBe('1px');
  expect(style.color).toBe('rgb(220, 38, 38)');
  // The md connect-pill geometry is unchanged, so the header does not jump.
  expect(style.height).toBe(44);
  expect(style.paddingLeft).toBe('16px');
  expect(style.paddingRight).toBe('16px');
  // Wrong chain counts as connected: the wordmark is gone (§1.3).
  await expectHomeWordmark(page, false);

  await shot(page, 'home-wrong-network.png');
});

test('home: connected without identity shows the 铸造身份 NFT reminder only', async ({ page }) => {
  await installWallet(page, ACCOUNTS.outsider);
  await page.goto('/');
  await connect(page);

  await expect(page.getByText('你还没有身份 NFT')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: '铸造身份 NFT' })).toHaveAttribute(
    'href',
    '/mint?symbol=TestLOVE20',
  );
  await expect(page.getByRole('link', { name: '去我的 NFT' })).toHaveCount(0);
  await expect(page.getByText('你参与了销毁活动，获得空投铸造资格')).toHaveCount(0);
  await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
  expect(await countSolidButtons(page)).toBe(1);
  await expectHomeWordmark(page, false);
  // Connected without an identity: plain 你好, no name and no balance.
  await expect(greeting(page)).toHaveText('你好');
  await expect(page.getByText(/99,799,100/)).toHaveCount(0);
  await expect(page.getByTestId('home-thin-line')).toHaveCount(0);
  await expect(page).toHaveTitle('TestLOVE20');

  await shot(page, 'home-no-identity.png');
});

test('home: the greeting names the identity NFT and survives reload', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/');
  await connect(page);

  const heading = greeting(page);
  await expect(heading).toHaveText(`你好，${SEEDED_NAME}`, { timeout: 15_000 });
  // The greeting is not a link and does not carry the balance: that is 我的.
  expect(await heading.locator('a').count()).toBe(0);
  await expect(page.getByText(/99,799,100/)).toHaveCount(0);
  await expect(page.getByText('NFT #1')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '切换身份 NFT' })).toHaveCount(0);
  await expectHomeWordmark(page, false);
  // Single line at 390 px: the h1 must not wrap.
  const box = await heading.boundingBox();
  expect(box?.height ?? 0).toBeLessThan(40);

  await shot(page, 'home-connected-with-identity.png');

  await page.reload();
  await expect(greeting(page)).toHaveText(`你好，${SEEDED_NAME}`, { timeout: 15_000 });
});

test('home: eligible wallet sees the airdrop reminder', async ({ page }) => {
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
  // No-identity reminder comes first and owns the one filled button.
  await expect(page.getByText('你还没有身份 NFT')).toBeVisible();
  expect(await countSolidButtons(page)).toBe(1);
  await expectHomeWordmark(page, false);
  await shot(page, 'home-airdrop-eligible.png');
});

test('home: a non-eligible account never sees the airdrop reminder', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity); // claimed its share during seeding
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  const snapshotLoaded = page.waitForResponse(
    (response) => response.url().includes('/airdrop/anvil31337_dev.json'),
    { timeout: 20_000 },
  );
  await page.goto('/');
  await connect(page);
  await snapshotLoaded;
  await expect(page.getByText('你有空投资格')).toHaveCount(0);
  // Nothing to do: greeting + footer only, no filler sentence.
  await expect(greeting(page)).toHaveText(`你好，${SEEDED_NAME}`);
  await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
  await expect(page.locator('section[aria-labelledby^="home-reminder"]')).toHaveCount(0);
});

test('my-nft: card list and local selection without a transaction', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await page.goto('/my-nft?symbol=TestLOVE20');
  await connect(page);

  await expect(page.getByText('持有 1 个身份 NFT')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: '当前身份 NFT' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '使用此身份 NFT' })).toBeVisible();
  await shot(page, 'my-nft-list.png');

  await page.getByRole('button', { name: '使用此身份 NFT' }).click();
  // The row keeps its 当前 pill + tint; the disabled button carries the state
  // only as its accessible name (the visible duplicate is gone).
  const identityList = page.getByRole('list', { name: '我的 NFT' });
  await expect(identityList.getByText('当前', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '当前身份 NFT' })).toBeDisabled();
  // No wallet confirmation appeared: selection is a local cache write.
  await expect(page.getByRole('button', { name: '打开钱包与身份 NFT 菜单' })).toBeVisible();
  await shot(page, 'my-nft-selected.png');

  await page.reload();
  await expect(
    page.getByRole('list', { name: '我的 NFT' }).getByText('当前', { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
});

test('identity cache is cleared when ownerOf belongs to someone else', async ({ page }) => {
  // Account #5 has no NFT, but a tokenId owned by account #0 is cached.
  await installWallet(page, ACCOUNTS.eligible);
  await seedIdentity(page, ACCOUNTS.eligible, '1');
  await page.goto('/');
  await connect(page);

  // Home no longer renders the neutral invalidation notice; it falls back to
  // the no-identity reminder and a plain greeting. The cache is the proof.
  await expect(page.getByText('你还没有身份 NFT')).toBeVisible({ timeout: 15_000 });
  await expect(greeting(page)).toHaveText('你好');
  await expect(page.getByText(`你好，${SEEDED_NAME}`)).toHaveCount(0);
  const stored = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    identityCacheKey(ACCOUNTS.eligible),
  );
  expect(stored).toBeNull();
});

test('my-nft: empty wallet gets the mint identity next step', async ({ page }) => {
  await installWallet(page, ACCOUNTS.outsider);
  await page.goto('/my-nft');
  await connect(page);

  // Empty state: no summary bar above the card (「持有 0 个身份 NFT」 was the same
  // fact as 「你还没有身份 NFT。」).
  await expect(page.getByText('你还没有身份 NFT。')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('持有 0 个身份 NFT')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '铸造身份 NFT' })).toHaveAttribute('href', '/mint');
});

test('my-nft: md+ renders the 编号/名称/操作 table', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/my-nft');
  await connect(page);

  await expect(page.getByRole('columnheader', { name: 'NFT 编号' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('columnheader', { name: '名称' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '操作' })).toBeVisible();
  await expect(page.getByRole('cell', { name: SEEDED_NAME })).toBeVisible();
});

test('my-nft: transfer drawer warns and rejects the current wallet', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/my-nft');
  await connect(page);

  await page.getByRole('button', { name: '转让' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // The terminology pass may word this as 身份 NFT; the two owner-approved
  // promises (irreversible, history/stake move with the NFT) must stay.
  await expect(page.getByText(/转让会改变这个身份/)).toBeVisible();
  await expect(page.getByText(/历史与质押/)).toBeVisible();
  await expect(page.getByText(/转让不可撤销/)).toBeVisible();
  await page.getByPlaceholder('0x 开头的 40 位地址').fill(ACCOUNTS.withIdentity);
  await expect(page.getByText('不能转让给自己。')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认转让' })).toBeDisabled();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('my-nft: transfer recipient can be an address or an identity NFT', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/my-nft');
  await connect(page);

  await page.getByRole('button', { name: '转让' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('收款人', { exact: true })).toBeVisible();

  // Default is 按地址: same 0x input as before, with the mode selector on the left.
  const modeTrigger = page.getByTestId('transfer-mode-trigger');
  await expect(modeTrigger).toContainText('按地址');
  await expect(page.getByPlaceholder('0x 开头的 40 位地址')).toBeVisible();
  await shot(page, 'transfer-drawer-address-mode.png');

  // Switch to 按身份 NFT with the compact menu (not a second full-screen sheet).
  await modeTrigger.click();
  await page.getByTestId('transfer-mode-member').click();
  await expect(modeTrigger).toContainText('按身份 NFT');
  const input = page.getByTestId('transfer-recipient-input');
  await expect(input).toHaveAttribute('placeholder', '#身份 NFT 编号');

  // Invalid id: specific copy, CTA disabled.
  await input.fill('abc');
  await expect(page.getByText('请输入身份 NFT 编号，例如 #12。')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认转让' })).toBeDisabled();

  // Own identity NFT: reading ownerOf() returns the connected wallet.
  await input.fill('#1');
  await expect(page.getByText('这是你自己的身份 NFT。')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: '确认转让' })).toBeDisabled();

  // A seeded identity NFT owned by another wallet resolves to its owner; the
  // confirmation line shows the short address and the transfer becomes possible.
  await input.fill('#2');
  const resolved = page.getByTestId('transfer-recipient-resolved');
  await expect(resolved).toBeVisible({ timeout: 15_000 });
  await expect(resolved).toContainText('收款人：0x7099');
  await expect(page.getByRole('button', { name: '确认转让' })).toBeEnabled();
  await shot(page, 'transfer-drawer-member-mode.png');

  // No transfer is sent: cancel leaves the drawer and the list untouched.
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('reads are batched through Multicall3, never one RPC per list item', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().startsWith(RPC_URL)) return;
    const body = request.postData();
    if (body !== null) calls.push(body.toLowerCase());
  });

  await installWallet(page, ACCOUNTS.withIdentity);
  await page.goto('/my-nft');
  await connect(page);
  await expect(page.getByText('持有 1 个身份 NFT')).toBeVisible({ timeout: 15_000 });

  // aggregate3((address,bool,bytes)[]) selector 0x82ad56cb, sent to the
  // Multicall3 address from the address book.
  const batched = calls.some(
    (body) => body.includes(MULTICALL3.toLowerCase()) && body.includes('0x82ad56cb'),
  );
  expect(batched).toBe(true);
});
