import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createPublicClient, encodeFunctionData, http, parseAbi } from 'viem';
import { ANVIL_RPC, anvilRpc, isolateChain } from './chain';
import { ACCOUNTS, connect, installWallet } from './wallet-stub';

/**
 * 默认使用长期授权偏好穿透各页 approve (owner 2026-11-16).
 *
 * The owner's complaint: `/approvals` shows 「默认使用长期授权」 selected, but other
 * pages still approved the exact amount, and their buttons never said 长期授权.
 * This spec proves the whole chain end to end on the dedicated suite chain:
 *
 *   开关打开 → 兑换页授权按钮文案 = 「长期授权 TestLOVE20」
 *            → 点击后链上 allowance(router) == maxUint256
 *   开关关闭（默认） → 按钮 = 「授权 TestLOVE20」 → allowance == 本次输入金额
 */

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/deployments/anvil31337_dev.json'), 'utf8'),
) as {
  addresses: { firstTokenAddress: `0x${string}`; router: `0x${string}` };
};

const TOKEN = deployment.addresses.firstTokenAddress;
const ROUTER = deployment.addresses.router;
const SYMBOL = 'TestLOVE20';
const WALLET = ACCOUNTS.withIdentity;
const PREFERENCE_KEY = 'love20:tokenApprovalUseUnlimitedByDefault';
const MAX_UINT256 = 2n ** 256n - 1n;
const AMOUNT_IN = 10n ** 18n; // 1 TestLOVE20: the dapp's 授权 target when the preference is off

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');

const ERC20 = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);
const rpcClient = createPublicClient({ transport: http(ANVIL_RPC) });

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 240_000 });

// Snapshot the dedicated verification chain (E2E_ANVIL_RPC, default 8555) and
// revert after the file, so a second run starts from the same state.
isolateChain();

/** Pre-seed the router allowance through an anvil unlocked account (a chain fixture). */
async function seedAllowance(amount: bigint): Promise<void> {
  const data = encodeFunctionData({
    abi: ERC20,
    functionName: 'approve',
    args: [ROUTER, amount],
  });
  const hash = await anvilRpc<`0x${string}`>('eth_sendTransaction', [
    { from: WALLET, to: TOKEN, data },
  ]);
  await rpcClient.waitForTransactionReceipt({ hash });
}

function allowance(): Promise<bigint> {
  return rpcClient.readContract({
    address: TOKEN,
    abi: ERC20,
    functionName: 'allowance',
    args: [WALLET, ROUTER],
  }) as Promise<bigint>;
}

/**
 * Screenshot with the approve/swap action row visible and unobstructed.
 * Mobile: viewport shot with the row centered above the fixed bottom tab bar.
 * Desktop: the sidebar replaces the bottom bar, so the whole page is captured.
 */
async function shootActions(page: Page, name: string, desktop = false): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  if (desktop) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(SHOTS, name), fullPage: true, animations: 'disabled' });
    return;
  }
  await page
    .getByTestId('swap-actions')
    .evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(SHOTS, name), animations: 'disabled' });
}

/** Open the swap form with TestLOVE20 → ETH and a 1-token input (needs a router approve). */
async function openSwapNeedingApproval(page: Page): Promise<void> {
  await installWallet(page, WALLET);
  await page.goto('/swap?symbol=TestLOVE20&from=TestLOVE20&to=ETH');
  await connect(page);
  await expect(page.getByTestId('swap-from-token')).toContainText(SYMBOL, { timeout: 20_000 });
  await page.getByTestId('swap-from-amount').fill('1');
  await expect(page.getByTestId('swap-approve')).toBeVisible({ timeout: 20_000 });
}

test('偏好关闭（默认）：兑换页授权按钮=授权 {symbol}，链上 allowance=本次金额', async ({
  page,
}) => {
  await seedAllowance(0n);
  await openSwapNeedingApproval(page);

  const approve = page.getByTestId('swap-approve');
  await expect(approve).toContainText(`授权 ${SYMBOL}`);
  await expect(approve).not.toContainText('长期授权');

  await approve.click();
  await expect(page.getByText('已授权', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(allowance, { timeout: 15_000 }).toBe(AMOUNT_IN);
});

test('偏好打开：兑换页按钮=长期授权 {symbol}，链上 allowance=maxUint256', async ({ page }) => {
  await seedAllowance(0n);

  // 1. 在代币授权页打开开关（设备级偏好，同一存储键）。
  await installWallet(page, WALLET);
  await page.goto('/approvals');
  await connect(page);
  const preference = page.getByTestId('approvals-preference');
  await expect(preference).toBeVisible({ timeout: 20_000 });
  await expect(preference).not.toBeChecked();
  await preference.check();
  await expect(preference).toBeChecked();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), PREFERENCE_KEY)).toBe('1');

  // 2. 换到兑换页：按钮与提示都必须体现长期授权。
  await page.goto('/swap?symbol=TestLOVE20&from=TestLOVE20&to=ETH');
  await connect(page);
  await expect(page.getByTestId('swap-from-token')).toContainText(SYMBOL, { timeout: 20_000 });
  await page.getByTestId('swap-from-amount').fill('1');
  const approve = page.getByTestId('swap-approve');
  await expect(approve).toBeVisible({ timeout: 20_000 });
  await expect(approve).toContainText(`长期授权 ${SYMBOL}`);
  await expect(page.getByTestId('swap-approve-note')).toContainText(
    '这次会授权长期额度（几乎无限）',
  );

  // 3. 截图：按钮文案本身就是 owner 要的证据（移动端 390，按钮与提示都露在底栏之上）。
  await shootActions(page, 'swap-approve-longterm.png');

  // 4. 点击后链上额度必须是 maxUint256（不是本次输入金额）。
  await approve.click();
  await expect(page.getByText('已长期授权', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(allowance, { timeout: 15_000 }).toBe(MAX_UINT256);
});

test('截图：长期授权按钮 390×844 / 1280×800 × 浅色 / 深色', async ({ page }) => {
  test.setTimeout(180_000);
  await seedAllowance(0n);
  const combos = [
    { theme: 'light', viewport: { name: 'mobile', width: 390, height: 844 } },
    { theme: 'dark', viewport: { name: 'mobile', width: 390, height: 844 } },
    { theme: 'light', viewport: { name: 'desktop', width: 1280, height: 800 } },
    { theme: 'dark', viewport: { name: 'desktop', width: 1280, height: 800 } },
  ] as const;

  mkdirSync(SHOTS, { recursive: true });
  for (const combo of combos) {
    await page.setViewportSize({ width: combo.viewport.width, height: combo.viewport.height });
    await page.addInitScript(
      ({ theme, key }) => {
        window.localStorage.setItem('love20:theme', theme);
        window.localStorage.setItem(key, '1');
      },
      { theme: combo.theme, key: PREFERENCE_KEY },
    );
    await openSwapNeedingApproval(page);
    await expect(page.getByTestId('swap-approve')).toContainText(`长期授权 ${SYMBOL}`, {
      timeout: 20_000,
    });
    await shootActions(
      page,
      `swap-approve-longterm-${combo.theme}-${combo.viewport.name}.png`,
      combo.viewport.width >= 768,
    );
  }
});
