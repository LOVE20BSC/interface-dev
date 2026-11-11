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
 * Home is a reminder feed (UX spec §3.1, owner 2026-11-11): a thin line into
 * 我的 plus conditional reminder cards; the old identity/balance cards and the
 * three navigation rows are gone (they live on /apps and /me now).
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

/** The home thin line into 我的 (the bottom nav/sidebar also link there). */
function thinLine(page: Page) {
  // Scoped by test id: the bottom nav and desktop sidebar also link to /me.
  return page.getByTestId('home-thin-line');
}

// Snapshot before any test touches the chain; afterAll restores it.
isolateChain();

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });
});

test('home: disconnected shows the connect entry, the wordmark and the thin line', async ({
  page,
}) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await page.goto('/');

  await expect(page.getByRole('button', { name: '连接钱包' })).toHaveCount(2);
  await expect(page.getByText('一个钱包可以拥有多个身份，身份才是参与凭证。')).toBeVisible();
  await expect(page.getByText('你还没有身份')).toHaveCount(0);
  await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
  expect(await countSolidButtons(page)).toBe(1);
  await expectHomeWordmark(page, true);

  // Thin line is always visible, even disconnected: name —, balance —.
  await expect(thinLine(page)).toBeVisible();
  await expect(thinLine(page)).toContainText('—');
  // The old navigation rows are gone.
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

test('home: connected without identity shows the 铸造身份 reminder only', async ({ page }) => {
  await installWallet(page, ACCOUNTS.outsider);
  await page.goto('/');
  await connect(page);

  await expect(page.getByText('你还没有身份')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: '铸造身份' })).toHaveAttribute(
    'href',
    '/mint?symbol=TestLOVE20',
  );
  await expect(page.getByRole('link', { name: '去我的 NFT' })).toHaveCount(0);
  await expect(page.getByText('你参与了销毁活动，获得空投铸造资格')).toHaveCount(0);
  await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
  expect(await countSolidButtons(page)).toBe(1);
  await expectHomeWordmark(page, false);
  await expect(thinLine(page)).toContainText('还没有身份');
  await expect(page).toHaveTitle('TestLOVE20');

  await shot(page, 'home-no-identity.png');
});

test('home: identity and balance stay in the thin line across reload', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/');
  await connect(page);

  const line = thinLine(page);
  await expect(line).toContainText(SEEDED_NAME, { timeout: 15_000 });
  // 99,799,100 renders with thousands separators, never as a wall of digits.
  await expect(line).toContainText('99,799,100 TestLOVE20');
  await expect(line).not.toContainText('99799100');
  // No greeting card, no identity pill, no 切换身份 button on home.
  await expect(page.getByText(`你好，${SEEDED_NAME}`)).toHaveCount(0);
  await expect(page.getByText('身份 #1')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '切换身份' })).toHaveCount(0);
  await expectHomeWordmark(page, false);
  // The thin line is one row: it must not wrap at 390 px.
  const box = await line.boundingBox();
  expect(box?.height ?? 0).toBeLessThan(32);

  await shot(page, 'home-connected-with-identity.png');

  await page.reload();
  await expect(thinLine(page)).toContainText(SEEDED_NAME, { timeout: 15_000 });
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
  await expect(page.getByText('你还没有身份')).toBeVisible();
  expect(await countSolidButtons(page)).toBe(1);
  await expectHomeWordmark(page, false);
  await shot(page, 'home-airdrop-eligible.png');
});

test('home: a non-eligible account never sees the airdrop reminder', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity); // claimed its share during seeding
  const snapshotLoaded = page.waitForResponse(
    (response) => response.url().includes('/airdrop/anvil31337_dev.json'),
    { timeout: 20_000 },
  );
  await page.goto('/');
  await connect(page);
  await snapshotLoaded;
  await expect(page.getByText('你有空投资格')).toHaveCount(0);
  await expect(page.getByText('现在没有需要你处理的事。')).toBeVisible();
});

test('my-nft: card list and local selection without a transaction', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await page.goto('/my-nft?symbol=TestLOVE20');
  await connect(page);

  await expect(page.getByText('持有 1 个身份')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('当前：未选择')).toBeVisible();
  await expect(page.getByRole('button', { name: '使用此身份' })).toBeVisible();
  await shot(page, 'my-nft-list.png');

  await page.getByRole('button', { name: '使用此身份' }).click();
  await expect(page.getByText(`当前：${SEEDED_NAME}`)).toBeVisible();
  await expect(page.getByRole('button', { name: '当前身份' })).toBeDisabled();
  // No wallet confirmation appeared: selection is a local cache write.
  await expect(page.getByRole('button', { name: '打开钱包与身份菜单' })).toBeVisible();
  await shot(page, 'my-nft-selected.png');

  await page.reload();
  await expect(page.getByText(`当前：${SEEDED_NAME}`)).toBeVisible({ timeout: 15_000 });
});

test('identity cache is cleared when ownerOf belongs to someone else', async ({ page }) => {
  // Account #5 has no NFT, but a tokenId owned by account #0 is cached.
  await installWallet(page, ACCOUNTS.eligible);
  await seedIdentity(page, ACCOUNTS.eligible, '1');
  await page.goto('/');
  await connect(page);

  // Home no longer renders the neutral invalidation notice; it falls back to
  // the no-identity reminder and the thin line. The cache is the proof.
  await expect(page.getByText('你还没有身份')).toBeVisible({ timeout: 15_000 });
  await expect(thinLine(page)).toContainText('还没有身份');
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

  await expect(page.getByText('持有 0 个身份')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('你还没有身份。')).toBeVisible();
  await expect(page.getByRole('link', { name: '铸造身份' })).toHaveAttribute('href', '/mint');
});

test('my-nft: md+ renders the 编号/名称/操作 table', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/my-nft');
  await connect(page);

  await expect(page.getByRole('columnheader', { name: '编号' })).toBeVisible({
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
  await expect(
    page.getByText(
      '转让会改变这个身份的控制者。身份的历史与质押仍留在身份上，不随钱包转走；转让不可撤销。',
    ),
  ).toBeVisible();
  await page.getByPlaceholder('0x 开头的 40 位地址').fill(ACCOUNTS.withIdentity);
  await expect(page.getByText('不能转让给自己。')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认转让' })).toBeDisabled();
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
  await expect(page.getByText('持有 1 个身份')).toBeVisible({ timeout: 15_000 });

  // aggregate3((address,bool,bytes)[]) selector 0x82ad56cb, sent to the
  // Multicall3 address from the address book.
  const batched = calls.some(
    (body) => body.includes(MULTICALL3.toLowerCase()) && body.includes('0x82ad56cb'),
  );
  expect(batched).toBe(true);
});
