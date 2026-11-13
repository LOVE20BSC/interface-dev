import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { isolateChain } from './chain';
import { ACCOUNTS, connect, installWallet } from './wallet-stub';

/**
 * 应用·代币转账 前端线（三线校验 §3）:
 * `docs/product/three-line/transfer.md` §1 的理论值必须逐字出现在页面上。
 *
 * 断言只读页面文字（不读合约再拼答案）；链上夹具只依赖 clean bootstrap 的固定
 * 初始状态，每个用例使用互不重叠的 anvil 账户，因此共享一个文件级快照即可。
 * 本 spec 既跑前端线，也在末尾生成 390×844 / 1280×800 × 浅色/深色 的验收截图。
 */

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/deployments/anvil31337_dev.json'), 'utf8'),
) as {
  nativeCurrency: { symbol: string; decimals: number };
  addresses: {
    firstTokenAddress: `0x${string}`;
    pair: `0x${string}`;
    weth: `0x${string}`;
  };
};

const NATIVE = deployment.nativeCurrency.symbol;
const TOKEN = deployment.addresses.firstTokenAddress;
const PAIR = deployment.addresses.pair;
const WETH = deployment.addresses.weth;
const SYMBOL = 'TestLOVE20';
const QUERY = `?symbol=${SYMBOL}`;
const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');

// anvil 固定账户：#1 有 TestLOVE20 与身份 NFT，#4 有 TestLOVE20，#7 只有原生币。
const ERC20_SENDER = ACCOUNTS.withIdentity; // 0xf39F…2266, 99,799,100 TestLOVE20
const IDENTITY_SENDER = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'; // #4, recipient of identity #5
const NATIVE_SENDER = '0x976EA74026E726554dB657fA54763abd0C3a0aa9'; // #6, 10,000 ETH
const NATIVE_RECIPIENT = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'; // #7
const OUTSIDER = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f'; // #8, 10,000 ETH / 0 token
const RECIPIENT = ACCOUNTS.eligible; // #5, 0 token, 10,000 ETH

const IDENTITY_2_OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 180_000 });

// Snapshot the dedicated verification chain (E2E_ANVIL_RPC, default 8555; this task
// runs it against 8566). Every test below reverts back to this state afterwards.
isolateChain();

async function openTransfer(page: Page, account: string): Promise<void> {
  await installWallet(page, account);
  await page.goto(`/transfer${QUERY}`);
  await connect(page);
}

async function selectToken(page: Page, symbol: string): Promise<void> {
  await page.getByTestId('transfer-token').click();
  const option = page.getByTestId(`transfer-token-option-${symbol}`);
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
  await expect(page.getByTestId('transfer-token')).toContainText(symbol);
}

async function fillTransfer(page: Page, amount: string, recipient: string): Promise<void> {
  await page.getByTestId('transfer-amount').fill(amount);
  await page.getByTestId('transfer-recipient').fill(recipient);
}

test.describe('代币转账 前端线（理论线 §1）', () => {
  test('用例 A 原生转账：余额 10,000 → 回执 0.1 ETH', async ({ page }) => {
    await openTransfer(page, NATIVE_SENDER);
    await expect(page.getByTestId('transfer-token')).toContainText(NATIVE, { timeout: 20_000 });
    await expect(page.getByTestId('transfer-balance')).toHaveText(`${NATIVE} 余额 10,000`, {
      timeout: 20_000,
    });

    await fillTransfer(page, '0.1', NATIVE_RECIPIENT);
    await expect(page.getByTestId('transfer-submit')).toBeEnabled();
    await page.getByTestId('transfer-submit').click();

    await expect(page.getByTestId('transfer-receipt-amount')).toHaveText(`0.1 ${NATIVE}`, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('transfer-receipt-recipient')).toHaveText(NATIVE_RECIPIENT);
    const hash = (await page.getByTestId('transfer-receipt-hash').innerText()).trim();
    expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // 回执可关闭且留在原页：收成成功条，不跳转。
    await page.getByRole('button', { name: '留在此页' }).click();
    await expect(page.getByTestId('transfer-success-strip-amount')).toHaveText(
      `已转出 0.1 ${NATIVE}`,
    );
    await expect(page).toHaveURL(new RegExp(`/transfer\\${QUERY}$`));
  });

  test('用例 B 非整数 ERC20 转账：99,799,100 → 99,799,098.5 TestLOVE20', async ({ page }) => {
    await openTransfer(page, ERC20_SENDER);
    await selectToken(page, SYMBOL);
    await expect(page.getByTestId('transfer-balance')).toHaveText(`${SYMBOL} 余额 99,799,100`, {
      timeout: 20_000,
    });
    await expect(page.getByText('精度 18 位')).toBeVisible();

    await fillTransfer(page, '1.5', RECIPIENT);
    await page.getByTestId('transfer-submit').click();
    await expect(page.getByTestId('transfer-receipt-amount')).toHaveText(`1.5 ${SYMBOL}`, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('transfer-receipt-recipient')).toHaveText(RECIPIENT);

    await page.getByRole('button', { name: '留在此页' }).click();
    // 余额刷新后与理论线 §1 用例 B 的 S_after 逐字相等。
    await expect(page.getByTestId('transfer-balance')).toHaveText(`${SYMBOL} 余额 99,799,098.5`, {
      timeout: 20_000,
    });
  });

  test('用例 C 余额不足：ERC20 差 1，原生币差 0.001', async ({ page }) => {
    await openTransfer(page, OUTSIDER);
    await selectToken(page, SYMBOL);
    await expect(page.getByTestId('transfer-balance')).toHaveText(`${SYMBOL} 余额 0`, {
      timeout: 20_000,
    });
    await fillTransfer(page, '1', RECIPIENT);
    await expect(page.getByTestId('transfer-amount-error')).toHaveText(`${SYMBOL} 不够，还差 1`);
    await expect(page.getByTestId('transfer-submit')).toBeDisabled();

    // 原生币：10,000 − 0.001 预留 = 9,999.999 可花，输入 10,000 差 0.001。
    await selectToken(page, NATIVE);
    await expect(page.getByTestId('transfer-balance')).toHaveText(`${NATIVE} 余额 10,000`, {
      timeout: 20_000,
    });
    await page.getByTestId('transfer-amount').fill('10000');
    await expect(page.getByTestId('transfer-amount-error')).toHaveText(
      `${NATIVE} 不够，还差 0.001`,
    );
    await expect(page.getByText(`需要预留一点 ${NATIVE} 支付网络手续费。`)).toBeVisible();
    await expect(page.getByTestId('transfer-submit')).toBeDisabled();
  });

  test('用例 D 收款方是已知合约：显示合约名并强制二次确认', async ({ page }) => {
    await openTransfer(page, ERC20_SENDER);
    await fillTransfer(page, '0.1', PAIR);

    const protection = page.getByTestId('transfer-protection');
    await expect(protection).toBeVisible({ timeout: 20_000 });
    await expect(protection).toContainText('这是「交易对」合约地址');
    await expect(page.getByTestId('transfer-submit')).toBeDisabled();

    await page.getByTestId('transfer-known-ack').check();
    await expect(page.getByTestId('transfer-submit')).toBeEnabled();

    // 任意有 bytecode 但不是地址簿条目的合约：只警告、不要求勾选。
    await page.getByTestId('transfer-recipient').fill(TOKEN);
    await expect(page.getByTestId('transfer-contract-warning')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('transfer-protection')).toHaveCount(0);
    await expect(page.getByTestId('transfer-submit')).toBeEnabled();
  });

  test('用例 E 按身份 NFT 收款：#2 → Testdev-member-1 的 owner', async ({ page }) => {
    await openTransfer(page, IDENTITY_SENDER);
    await selectToken(page, SYMBOL);
    await expect(page.getByTestId('transfer-balance')).toHaveText(
      `${SYMBOL} 余额 99,999,099.999639`,
      { timeout: 20_000 },
    );

    await page.getByTestId('transfer-mode-identity').click();
    await page.getByTestId('transfer-recipient').fill('#2');
    const summary = page.getByTestId('transfer-identity-summary');
    await expect(summary).toBeVisible({ timeout: 20_000 });
    await expect(summary).toContainText('身份 NFT #2 Testdev-member-1');
    await expect(page.getByTestId('transfer-identity-recipient')).toHaveText(`收款人 0x7099…79C8`);
    await expect(page.getByTestId('transfer-submit')).toBeDisabled();

    await page.getByTestId('transfer-identity-ack').check();
    await page.getByTestId('transfer-amount').fill('2.5');
    await expect(page.getByTestId('transfer-submit')).toBeEnabled();
    await page.getByTestId('transfer-submit').click();

    await expect(page.getByTestId('transfer-receipt-amount')).toHaveText(`2.5 ${SYMBOL}`, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('transfer-receipt-label')).toHaveText(
      '身份 NFT #2 Testdev-member-1',
    );
    await expect(page.getByTestId('transfer-receipt-recipient')).toHaveText(IDENTITY_2_OWNER);

    await page.getByRole('button', { name: '留在此页' }).click();
    await expect(page.getByTestId('transfer-balance')).toHaveText(
      `${SYMBOL} 余额 99,999,097.499639`,
      { timeout: 20_000 },
    );
  });

  test('自定义 ERC20：读 symbol/decimals 后可选中；非合约地址给人话错误', async ({ page }) => {
    await openTransfer(page, OUTSIDER);

    await page.getByTestId('transfer-token').click();
    await page.getByTestId('transfer-custom-address').fill(WETH);
    await page.getByRole('button', { name: '添加代币' }).click();
    // A resolved custom token replaces the selection and closes the picker.
    await expect(page.getByTestId('transfer-token')).toContainText('TestWETH', { timeout: 20_000 });
    await expect(page.getByTestId('transfer-balance')).toHaveText('TestWETH 余额 0', {
      timeout: 20_000,
    });

    // An EOA has no bytecode: honest failure, never a broken token entry.
    await page.getByTestId('transfer-token').click();
    await page.getByTestId('transfer-custom-address').fill(OUTSIDER);
    await page.getByRole('button', { name: '添加代币' }).click();
    await expect(page.getByTestId('transfer-custom-error')).toContainText(
      '这个地址上没有合约，不能作为代币。',
      { timeout: 20_000 },
    );
  });

  test('CTA 输入门禁：空/0/非法金额与非法地址都不允许提交', async ({ page }) => {
    await openTransfer(page, ERC20_SENDER);
    await selectToken(page, SYMBOL);
    const submit = page.getByTestId('transfer-submit');
    await expect(submit).toBeDisabled();

    await fillTransfer(page, '0', RECIPIENT);
    await expect(page.getByTestId('transfer-amount-error')).toHaveText('金额必须大于 0。');
    await expect(submit).toBeDisabled();

    await fillTransfer(page, '-1', RECIPIENT);
    await expect(page.getByTestId('transfer-amount-error')).toHaveText('请输入有效的金额。');
    await expect(submit).toBeDisabled();

    await fillTransfer(page, '1.5', '0x1234');
    await expect(page.getByText('收款地址格式不对，需要 0x 开头的 40 位地址。')).toBeVisible();
    await expect(submit).toBeDisabled();

    await fillTransfer(page, '1.5', '0x0000000000000000000000000000000000000000');
    await expect(page.getByText('收款地址不能是零地址。')).toBeVisible();
    await expect(submit).toBeDisabled();
  });
});

/**
 * 验收截图：390×844 与 1280×800、浅色与深色，覆盖 填写态 / 资产保护警告 / 成功回执。
 * 主题通过 `love20:theme`（bootstrap 在首帧前读取）切换，每个组合都是一次真实加载。
 */
test.describe('代币转账 验收截图', () => {
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
    await page.goto(`/transfer${QUERY}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await connect(page);
  }

  async function shoot(page: Page, name: string): Promise<void> {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({
      path: resolve(SHOTS, `transfer-${name}.png`),
      animations: 'disabled',
      fullPage: false,
    });
  }

  test('填写态截图', async ({ page }) => {
    await installWallet(page, ERC20_SENDER);
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, theme, viewport.width, viewport.height);
        await selectToken(page, SYMBOL);
        await expect(page.getByTestId('transfer-balance')).toContainText('余额', {
          timeout: 20_000,
        });
        await fillTransfer(page, '1.5', RECIPIENT);
        await expect(page.getByTestId('transfer-submit')).toBeEnabled();
        await shoot(page, `form-${theme}-${viewport.key}`);
      }
    }
  });

  test('资产保护警告截图', async ({ page }) => {
    await installWallet(page, ERC20_SENDER);
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, theme, viewport.width, viewport.height);
        await fillTransfer(page, '0.1', PAIR);
        await expect(page.getByTestId('transfer-protection')).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId('transfer-submit')).toBeDisabled();
        await shoot(page, `protection-${theme}-${viewport.key}`);
      }
    }
  });

  test('成功回执截图', async ({ page }) => {
    await installWallet(page, ERC20_SENDER);
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, theme, viewport.width, viewport.height);
        await selectToken(page, SYMBOL);
        await expect(page.getByTestId('transfer-balance')).toContainText('余额', {
          timeout: 20_000,
        });
        await fillTransfer(page, '0.5', RECIPIENT);
        await page.getByTestId('transfer-submit').click();
        await expect(page.getByTestId('transfer-receipt-amount')).toHaveText(`0.5 ${SYMBOL}`, {
          timeout: 30_000,
        });
        await shoot(page, `receipt-${theme}-${viewport.key}`);
      }
    }
  });
});
