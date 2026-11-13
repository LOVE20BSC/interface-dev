import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createPublicClient, encodeFunctionData, http, parseAbi } from 'viem';
import { ANVIL_RPC, anvilRpc, isolateChain } from './chain';
import { ACCOUNTS, connect, installWallet } from './wallet-stub';

/**
 * 应用·代币授权 前端线（三线校验 §3）:
 * `docs/product/three-line/approvals.md` §1 的理论值必须逐字出现在页面上。
 *
 * 断言只读页面文字（不读合约再拼答案）；链上夹具只依赖 clean bootstrap 的固定
 * 初始状态 + 测试自己通过 anvil unlocked 账户预置的 allowance。用例 C/E/F/G
 * 的「具体额度」是夹具预置的（页面只提供长期授权/撤销两种写值），其余用例走
 * 真实页面按钮。每个用例都从同一个文件级快照出发。
 */

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/deployments/anvil31337_dev.json'), 'utf8'),
) as {
  addresses: {
    firstTokenAddress: `0x${string}`;
    router: `0x${string}`;
    stake: `0x${string}`;
    vote: `0x${string}`;
    submit: `0x${string}`;
    mint: `0x${string}`;
  };
};

const TOKEN = deployment.addresses.firstTokenAddress;
const ROUTER = deployment.addresses.router;
const STAKE = deployment.addresses.stake;
const VOTE = deployment.addresses.vote;
const SUBMIT = deployment.addresses.submit;
const MINT = deployment.addresses.mint;

const SYMBOL = 'TestLOVE20';
const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');

// anvil #1: 99,799,100 TestLOVE20 (theory line §0). #5 is the custom spender EOA.
const WALLET = ACCOUNTS.withIdentity;
const CUSTOM_SPENDER = ACCOUNTS.eligible;

// Theory line §1 constants (deliberately re-typed here, never imported from the page).
const UNLIMITED_THRESHOLD = 2n ** 255n;
const CONCRETE = 1234567890123456789n;
const CUSTOM_AMOUNT = 2500000000000000000n;
const CONCRETE_TEXT = `1.234567 ${SYMBOL}`;
const BOUNDARY_TEXT = `57,896,044,618,658,097,711,785,492,504,343,953,926,634,992,332,820,282,019,728.792003 ${SYMBOL}`;
const BELOW_MINIMUM_TEXT = `< 0.000001 ${SYMBOL}`;

const ERC20 = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);
const rpcClient = createPublicClient({ transport: http(ANVIL_RPC) });

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 240_000 });

// Snapshot the dedicated verification chain (E2E_ANVIL_RPC, default 8555; this task
// runs it against 8567). Every test below reverts back to this state afterwards.
isolateChain();

/** Pre-seed an allowance through the anvil unlocked account (a chain fixture). */
async function seedAllowance(spender: `0x${string}`, amount: bigint): Promise<void> {
  const data = encodeFunctionData({
    abi: ERC20,
    functionName: 'approve',
    args: [spender, amount],
  });
  const hash = await anvilRpc<`0x${string}`>('eth_sendTransaction', [
    { from: WALLET, to: TOKEN, data },
  ]);
  await rpcClient.waitForTransactionReceipt({ hash });
}

async function selectTestToken(page: Page): Promise<void> {
  const trigger = page.getByTestId('approvals-token');
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  const option = page.getByTestId(`approvals-token-option-${SYMBOL}`);
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
  await expect(trigger).toContainText(SYMBOL);
}

async function openApprovals(page: Page): Promise<void> {
  await installWallet(page, WALLET);
  await page.goto('/approvals');
  await connect(page);
  await selectTestToken(page);
  await expect(page.getByTestId('approvals-balance')).toHaveText(`${SYMBOL} 余额 99,799,100`, {
    timeout: 20_000,
  });
}

test.describe('代币授权 前端线（理论线 §1）', () => {
  test('用例 A/B/D 未授权 → 长期授权 → 撤销，回执可关闭且状态不丢', async ({ page }) => {
    await openApprovals(page);

    const amount = page.getByTestId('approvals-amount-router');
    await expect(amount).toHaveText('未授权', { timeout: 20_000 });
    await expect(page.getByTestId('approvals-amount-stake')).toHaveText('未授权');
    await expect(page.getByTestId('approvals-revoke-router')).toBeDisabled();
    await expect(page.getByTestId('approvals-unlimited-router')).toBeEnabled();

    // B: 长期授权，写 maxUint256 → 页面显示 长期授权。
    await page.getByTestId('approvals-unlimited-router').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('把「兑换路由」设为长期授权？');
    await expect(page.getByTestId('approvals-confirm-next')).toHaveText('长期授权');
    await page.getByTestId('approvals-confirm-submit').click();
    await expect(amount).toHaveText('长期授权', { timeout: 30_000 });

    const strip = page.getByTestId('approvals-success-strip');
    await expect(strip).toContainText('已把「兑换路由」设为长期授权');
    await expect(page.getByTestId('approvals-success-strip-hash')).toHaveText(
      /^0x[0-9a-fA-F]{64}$/,
    );
    await page.getByRole('button', { name: '知道了' }).click();
    await expect(strip).toHaveCount(0);
    // 关闭回执后不丢已提交状态：列表仍是撤销后的链上真值。
    await expect(amount).toHaveText('长期授权');
    await expect(page).toHaveURL(/\/approvals(\?.*)?$/);

    // D: 撤销，写 0 → 页面显示 未授权。
    await page.getByTestId('approvals-revoke-router').click();
    await expect(dialog).toContainText('撤销「兑换路由」的授权？');
    await expect(page.getByTestId('approvals-confirm-next')).toHaveText('未授权');
    await page.getByTestId('approvals-confirm-submit').click();
    await expect(amount).toHaveText('未授权', { timeout: 30_000 });
    await expect(page.getByTestId('approvals-revoke-router')).toBeDisabled();
  });

  test('用例 C/E/F 具体额度截断、阈值边界与最小可见额度', async ({ page }) => {
    await seedAllowance(STAKE, CONCRETE);
    await seedAllowance(VOTE, UNLIMITED_THRESHOLD - 1n);
    await seedAllowance(SUBMIT, UNLIMITED_THRESHOLD);
    await seedAllowance(MINT, 1n);

    await openApprovals(page);

    await expect(page.getByTestId('approvals-amount-stake')).toHaveText(CONCRETE_TEXT, {
      timeout: 20_000,
    });
    // E1: 2^255 − 1 仍是具体额度，显示按 6 位小数截断。
    await expect(page.getByTestId('approvals-amount-vote')).toHaveText(BOUNDARY_TEXT);
    // E2: 2^255 起算长期授权。
    await expect(page.getByTestId('approvals-amount-submit')).toHaveText('长期授权');
    await expect(page.getByTestId('approvals-unlimited-submit')).toBeDisabled();
    // F: 1 wei 不能显示成 0（会被误读为未授权）。
    await expect(page.getByTestId('approvals-amount-mint')).toHaveText(BELOW_MINIMUM_TEXT);

    // D: 从具体额度撤销到 0。
    await page.getByTestId('approvals-revoke-stake').click();
    await page.getByTestId('approvals-confirm-submit').click();
    await expect(page.getByTestId('approvals-amount-stake')).toHaveText('未授权', {
      timeout: 30_000,
    });
  });

  test('用例 G 自定义地址：无额度提示、长期授权、撤销与非法输入', async ({ page }) => {
    await openApprovals(page);

    const input = page.getByTestId('approvals-spender');
    await input.fill(CUSTOM_SPENDER);
    const customAmount = page.getByTestId('approvals-custom-amount');
    await expect(customAmount).toHaveText('这个地址没有授权额度。', { timeout: 20_000 });
    await expect(page.getByTestId('approvals-custom-revoke')).toBeDisabled();

    // G3: 自定义地址走页面「长期授权」。
    await page.getByTestId('approvals-custom-unlimited').click();
    await page.getByTestId('approvals-confirm-submit').click();
    await expect(customAmount).toHaveText('长期授权', { timeout: 30_000 });

    await page.getByTestId('approvals-custom-revoke').click();
    await page.getByTestId('approvals-confirm-submit').click();
    await expect(customAmount).toHaveText('这个地址没有授权额度。', { timeout: 30_000 });

    // 非法地址即时提示，且不再展示额度块。
    await input.fill('0x1234');
    await expect(page.getByTestId('approvals-spender-error')).toHaveText(
      '这是一个无效的地址，需要 0x 开头的 40 位地址。',
    );
    await expect(customAmount).toHaveCount(0);

    await input.fill('0x0000000000000000000000000000000000000000');
    await expect(page.getByTestId('approvals-spender-error')).toHaveText('授权地址不能是零地址。');
  });

  test('用例 G2 自定义地址已有具体额度：显示 2.5 TestLOVE20', async ({ page }) => {
    await seedAllowance(CUSTOM_SPENDER, CUSTOM_AMOUNT);
    await openApprovals(page);

    await page.getByTestId('approvals-spender').fill(CUSTOM_SPENDER);
    await expect(page.getByTestId('approvals-custom-amount')).toHaveText(`2.5 ${SYMBOL}`, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('approvals-custom-revoke')).toBeEnabled();
  });

  test('默认长期授权偏好：勾选后写入本地存储，刷新后仍为勾选', async ({ page }) => {
    await openApprovals(page);
    const preference = page.getByTestId('approvals-preference');
    await expect(preference).not.toBeChecked();

    await preference.check();
    await page.reload();
    await connect(page);
    await selectTestToken(page);
    await expect(page.getByTestId('approvals-preference')).toBeChecked();
  });
});

/**
 * 验收截图：390×844 与 1280×800、浅色与深色，覆盖 列表态 / 撤销确认 / 自定义地址。
 * 主题通过 `love20:theme`（bootstrap 在首帧前读取）切换，每个组合都是一次真实加载。
 */
test.describe('代币授权 验收截图', () => {
  const VIEWPORTS = [
    { key: 'mobile', width: 390, height: 844 },
    { key: 'desktop', width: 1280, height: 800 },
  ] as const;
  const THEMES = ['light', 'dark'] as const;

  async function prepare(page: Page, theme: 'light' | 'dark', width: number, height: number) {
    await page.setViewportSize({ width, height });
    await page.addInitScript((nextTheme: string) => {
      window.localStorage.setItem('love20:theme', nextTheme);
    }, theme);
    await page.goto('/approvals');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await connect(page);
    await selectTestToken(page);
    await expect(page.getByTestId('approvals-amount-router')).toHaveText('长期授权', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('approvals-amount-stake')).toHaveText(CONCRETE_TEXT);
  }

  async function shoot(page: Page, name: string): Promise<void> {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({
      path: resolve(SHOTS, `approvals-${name}.png`),
      animations: 'disabled',
      fullPage: false,
    });
  }

  test('列表态 / 撤销确认 / 自定义地址截图', async ({ page }) => {
    // Deterministic three-state list: router 长期授权, stake 具体额度, others 未授权.
    await seedAllowance(ROUTER, 2n ** 256n - 1n);
    await seedAllowance(STAKE, CONCRETE);
    await seedAllowance(CUSTOM_SPENDER, CUSTOM_AMOUNT);
    await installWallet(page, WALLET);

    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, theme, viewport.width, viewport.height);
        await shoot(page, `list-${theme}-${viewport.key}`);

        await page.getByTestId('approvals-revoke-router').click();
        await expect(page.getByTestId('approvals-confirm')).toBeVisible();
        await shoot(page, `confirm-${theme}-${viewport.key}`);
        await page.getByTestId('approvals-confirm-cancel').click();
        await expect(page.getByTestId('approvals-confirm')).toHaveCount(0);

        await page.getByTestId('approvals-spender').fill(CUSTOM_SPENDER);
        await expect(page.getByTestId('approvals-custom-amount')).toHaveText(`2.5 ${SYMBOL}`);
        await page
          .getByTestId('approvals-custom-amount')
          .evaluate((element) => element.scrollIntoView({ block: 'center' }));
        await shoot(page, `custom-${theme}-${viewport.key}`);
      }
    }
  });
});
