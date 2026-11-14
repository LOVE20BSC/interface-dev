import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { isolateChain } from './chain';
import { ACCOUNTS, connect, installWallet } from './wallet-stub';

/**
 * 全局地址复制 + 社区 symbol 搜索 (owner 2026-11-14 09:30):
 *
 * 1. 右上角社区菜单 can switch by typing a symbol: exact match through
 *    Launch.tokenAddressBySymbol and prefix matches over the loaded Launch
 *    catalog, with 最近访问 kept as the default surface (UX spec §1.3).
 * 2. 钱包菜单 address is copyable through the shared 全局地址组件: full address,
 *    已复制 feedback and the exact address in the clipboard.
 *
 * The symbol fixture launches one child community through the same `cast`
 * pattern e2e/swap.spec.ts uses; the file-level chain snapshot reverts it.
 */

const deployment = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'src/config/deployments/anvil31337_dev.json'),
    'utf8',
  ),
) as {
  chainId: number;
  addresses: {
    tokenAddress: `0x${string}`;
    launch: `0x${string}`;
    mint: `0x${string}`;
  };
};

const RPC_URL = process.env.E2E_ANVIL_RPC ?? 'http://127.0.0.1:8555';
const GENESIS_SYMBOL = 'TestLOVE20';
/** launchToken takes a 6-byte uppercase symbol; the dev chain prefixes `Test`. */
const CHILD_INPUT_SYMBOL = 'CMTOK1';
const CHILD_SYMBOL = 'TestCMTOK1';
const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');

test.use({
  permissions: ['clipboard-read', 'clipboard-write'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 180_000 });

isolateChain();

function cast(args: string[]): string {
  return execFileSync('cast', [...args, '--rpc-url', RPC_URL], { encoding: 'utf8' }).trim();
}

function castCall(address: string, signature: string, ...args: string[]): string {
  return cast(['call', address, signature, ...args]);
}

function castSend(
  address: string,
  signature: string,
  args: readonly string[],
  from: string = ACCOUNTS.withIdentity,
): void {
  execFileSync(
    'cast',
    ['send', address, signature, ...args, '--from', from, '--unlocked', '--rpc-url', RPC_URL],
    { encoding: 'utf8' },
  );
}

function addressOf(address: string, signature: string, ...args: string[]): `0x${string}` {
  const raw = castCall(address, signature, ...args);
  const match = /0x[0-9a-fA-F]{40}/.exec(raw);
  if (match === null) throw new Error(`expected an address from ${signature}, got ${raw}`);
  return match[0] as `0x${string}`;
}

/** Launch one child community so the menu has a second symbol to switch to. */
function ensureChildCommunity(): string {
  const existing = addressOf(
    deployment.addresses.launch,
    'tokenAddressBySymbol(string)(address)',
    CHILD_SYMBOL,
  );
  if (existing !== '0x0000000000000000000000000000000000000000') return CHILD_SYMBOL;

  cast(['rpc', 'anvil_impersonateAccount', deployment.addresses.mint]);
  cast(['rpc', 'anvil_setBalance', deployment.addresses.mint, '0xde0b6b3a7640000']);
  castSend(
    deployment.addresses.launch,
    'addLaunchCount(address,uint256,uint256)',
    [deployment.addresses.tokenAddress, '1', '1'],
    deployment.addresses.mint,
  );
  castSend(deployment.addresses.launch, 'launchToken(string,address,uint256,address,uint8,bytes[])', [
    CHILD_INPUT_SYMBOL,
    deployment.addresses.tokenAddress,
    '1',
    ACCOUNTS.withIdentity,
    '0',
    '[]',
  ]);
  const child = addressOf(
    deployment.addresses.launch,
    'tokenAddressBySymbol(string)(address)',
    CHILD_SYMBOL,
  );
  if (child === '0x0000000000000000000000000000000000000000') {
    throw new Error('launchToken did not register the child community symbol');
  }
  return CHILD_SYMBOL;
}

async function openCommunityMenu(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: new RegExp(`当前代币社区 ${GENESIS_SYMBOL}`) })
    .click();
  await expect(page.getByTestId('community-search')).toBeVisible();
}

test.beforeAll(() => {
  ensureChildCommunity();
});

test('社区菜单：输入 symbol 精确匹配并切换社区，保留最近访问', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await page.goto(`/?symbol=${GENESIS_SYMBOL}`);
  await connect(page);

  await openCommunityMenu(page);
  const menu = page.getByRole('dialog');
  // 默认仍是最近访问列表（新钱包还没有别的社区）。
  await expect(menu.getByText('最近访问')).toBeVisible();

  const search = page.getByTestId('community-search');
  await search.fill(CHILD_SYMBOL);
  const result = page.getByTestId(`community-search-result-${CHILD_SYMBOL}`);
  await expect(result).toBeVisible({ timeout: 20_000 });
  await expect(result).toContainText('精确匹配');

  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({
    path: resolve(SHOTS, 'community-search.png'),
    animations: 'disabled',
  });

  await result.click();
  await expect(page).toHaveURL(new RegExp(`[?&]symbol=${CHILD_SYMBOL}(&|$)`), {
    timeout: 15_000,
  });
  // 菜单关闭，标题/药丸跟着新社区走。
  await expect(page.getByTestId('community-search')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: new RegExp(`当前代币社区 ${CHILD_SYMBOL}`) }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveTitle(new RegExp(CHILD_SYMBOL));

  // 再次打开：前缀候选包含首币社区；点回去后，最近访问里应该留下刚访问过的子币。
  await page
    .getByRole('button', { name: new RegExp(`当前代币社区 ${CHILD_SYMBOL}`) })
    .click();
  const searchAgain = page.getByTestId('community-search');
  await searchAgain.fill('Test');
  const genesisResult = page.getByTestId(`community-search-result-${GENESIS_SYMBOL}`);
  await expect(genesisResult).toBeVisible({ timeout: 20_000 });
  await genesisResult.click();
  await expect(page).toHaveURL(new RegExp(`[?&]symbol=${GENESIS_SYMBOL}(&|$)`), {
    timeout: 15_000,
  });

  await page
    .getByRole('button', { name: new RegExp(`当前代币社区 ${GENESIS_SYMBOL}`) })
    .click();
  const reopened = page.getByRole('dialog');
  await expect(reopened.getByText('最近访问')).toBeVisible();
  await expect(reopened.getByText(CHILD_SYMBOL, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('社区菜单：未知 symbol 给诚实空态，不发切换', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await page.goto(`/?symbol=${GENESIS_SYMBOL}`);
  await connect(page);
  await openCommunityMenu(page);

  await page.getByTestId('community-search').fill('NoSuchSymbol99');
  await expect(page.getByRole('dialog').getByText('没有找到这个 symbol 的社区。')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('community-search-results')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`[?&]symbol=${GENESIS_SYMBOL}(&|$)`));
});

test('钱包菜单：完整钱包地址点击复制，剪贴板拿到完整地址', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await page.goto(`/?symbol=${GENESIS_SYMBOL}`);
  await connect(page);

  await page.getByRole('button', { name: '打开钱包与身份 NFT 菜单' }).click();
  const address = page.getByTestId('wallet-menu-address');
  await expect(address).toBeVisible({ timeout: 15_000 });
  await expect(address).toHaveText(ACCOUNTS.withIdentity);
  await expect(address).toHaveAttribute('title', ACCOUNTS.withIdentity);

  await address.click();
  await expect(address).toContainText('已复制');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(ACCOUNTS.withIdentity);

  await page.screenshot({
    path: resolve(SHOTS, 'wallet-menu-address-copied.png'),
    animations: 'disabled',
  });
});
