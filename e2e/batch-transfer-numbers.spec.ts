import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { isolateChain } from './chain';
import { connect, installWallet } from './wallet-stub';

/**
 * 应用·批量转账 前端线（三线校验 §3）:
 * `docs/product/three-line/batch-transfer.md` §1 的理论值必须逐字出现在页面上。
 *
 * 断言只读页面文字（不读合约再拼答案）；链上夹具只依赖 clean bootstrap 的固定
 * 初始状态。文件内用例是 serial：先跑不写链的用例（非法行 / 超余额 / gas 越界），
 * 再跑会改余额的用例（原生成功 → 整批回滚 → ERC20 成功），这样每条用例的「初始
 * 余额」都仍是理论线 §0 的快照值。文件末尾再生成 390×844 / 1280×800 × 浅色/深色
 * 的验收截图（录入态 / 核对结果 / 成功回执）。
 */

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/deployments/anvil31337_dev.json'), 'utf8'),
) as {
  nativeCurrency: { symbol: string; decimals: number };
  addresses: {
    firstTokenAddress: `0x${string}`;
    batchTransfer: `0x${string}`;
  };
};

const NATIVE = deployment.nativeCurrency.symbol;
const TOKEN = deployment.addresses.firstTokenAddress;
const BATCH = deployment.addresses.batchTransfer;
const SYMBOL = 'TestLOVE20';
const QUERY = `?symbol=${SYMBOL}`;
const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');

// anvil 固定账户（mnemonic test … junk）。
const ERC20_SENDER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // #1, 99,799,100 TestLOVE20
const NATIVE_SENDER = '0x976EA74026E726554dB657fA54763abd0C3a0aa9'; // #6, 10,000 ETH
const OUTSIDER = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f'; // #8, 0 TestLOVE20 / 10,000 ETH
const R5 = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
const R7 = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955';
const R8 = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f';
const R9 = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720';
const R2 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 240_000 });

isolateChain();

async function openBatch(page: Page, account: string): Promise<void> {
  await installWallet(page, account);
  await page.goto(`/batch-transfer${QUERY}`);
  await connect(page);
}

async function useTokenMode(page: Page): Promise<void> {
  await page.getByTestId('batch-transfer-mode-token').click();
  await page.getByTestId('batch-transfer-token').click();
  const option = page.getByTestId(`batch-transfer-token-option-${SYMBOL}`);
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
  await expect(page.getByTestId('batch-transfer-token')).toContainText(SYMBOL);
}

async function fillBatch(page: Page, lines: readonly string[]): Promise<void> {
  await page.getByTestId('batch-transfer-input').fill(lines.join('\n'));
}

test.describe('批量转账 前端线（理论线 §1）', () => {
  test('用例 C 一行非法：逐行定位错误并禁止提交', async ({ page }) => {
    await openBatch(page, NATIVE_SENDER);
    await expect(page.getByTestId('batch-transfer-balance')).toHaveText(
      `${NATIVE} 余额 10,000`,
      { timeout: 20_000 },
    );

    await fillBatch(page, [`${R5} 0.1`, R7, `${R8} abc`]);
    await expect(page.getByTestId('batch-transfer-line-error-2')).toHaveText(
      '第 2 行：缺少金额。',
    );
    await expect(page.getByTestId('batch-transfer-line-error-3')).toHaveText(
      '第 3 行：金额格式不对。',
    );
    await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();

    // 资产保护：批量转账合约自身不能作为收款方。
    await fillBatch(page, [`${BATCH} 0.1`]);
    await expect(page.getByTestId('batch-transfer-line-error-1')).toHaveText(
      '第 1 行：不能转给批量转账合约本身。',
    );
    await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();
  });

  test('用例 D 合计超余额：ERC20 差 1，原生币差 0.501', async ({ page }) => {
    // D1：0 TestLOVE20 的钱包输入 1。
    await openBatch(page, OUTSIDER);
    await useTokenMode(page);
    await expect(page.getByTestId('batch-transfer-balance')).toHaveText(
      `${SYMBOL} 余额 0`,
      { timeout: 20_000 },
    );
    await fillBatch(page, [`${R2} 1`]);
    await expect(page.getByTestId('batch-transfer-insufficient')).toHaveText(
      `${SYMBOL} 不够，还差 1`,
    );
    await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();

    // D2：原生币 10,000 − 0.001 预留，4 行 × 2500.125 = 10,000.5。
    await openBatch(page, NATIVE_SENDER);
    await expect(page.getByTestId('batch-transfer-balance')).toHaveText(
      `${NATIVE} 余额 10,000`,
      { timeout: 20_000 },
    );
    await fillBatch(page, [
      `${R5} 2500.125`,
      `${R7} 2500.125`,
      `${R8} 2500.125`,
      `${R9} 2500.125`,
    ]);
    await expect(page.getByTestId('batch-transfer-total')).toHaveText(
      `合计 10,000.5 ${NATIVE}`,
    );
    await expect(page.getByTestId('batch-transfer-insufficient')).toHaveText(
      `${NATIVE} 不够，还差 0.501`,
    );
    await expect(page.getByText(`需要预留一点 ${NATIVE} 支付网络手续费。`)).toBeVisible();
    await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();
  });

  test('高级选项：每行执行预算越界被拦截', async ({ page }) => {
    await openBatch(page, NATIVE_SENDER);
    await fillBatch(page, [`${R5} 0.1`]);
    await page.getByText('高级选项：每行执行预算').click();

    await page.getByTestId('batch-transfer-gas').fill('10000');
    await expect(page.getByTestId('batch-transfer-gas-error')).toHaveText(
      '每行执行预算至少 21,000。',
    );
    await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();

    await page.getByTestId('batch-transfer-gas').fill('2000000');
    await expect(page.getByTestId('batch-transfer-gas-error')).toHaveText(
      '每行执行预算最多 1,000,000。',
    );

    await page.getByTestId('batch-transfer-gas').fill('30000');
    await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();
  });

  test('用例 A 原生：重复地址先标行号并阻止提交，删掉重复行后 4 行逐行到账', async ({ page }) => {
    await openBatch(page, NATIVE_SENDER);
    await expect(page.getByTestId('batch-transfer-balance')).toHaveText(
      `${NATIVE} 余额 10,000`,
      { timeout: 20_000 },
    );

    // 第 4 行与第 1 行同地址：不再静默合并，标出「与第 1 行重复」并阻止提交。
    await fillBatch(page, [
      `${R5} 0.1`,
      `${R7}, 0.2`,
      `${R8} 0.15`,
      `${R5} 0.05`,
      `${R9} 0.000001`,
    ]);
    await expect(page.getByTestId('batch-transfer-summary')).toHaveText('5 行，4 个收款方');
    await expect(page.getByTestId('batch-transfer-total')).toHaveText(
      `合计 0.450001 ${NATIVE}`,
    );
    await expect(page.getByTestId('batch-transfer-duplicate-4')).toHaveText(
      '第 4 行：与第 1 行重复，这一行先不计入，请删掉其中一行。',
    );
    await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();

    // 提交前预余额（理论线 §0 快照）：重复行不是收款方，只有 4 行。
    for (const index of [0, 1, 2, 3]) {
      await expect(page.getByTestId(`batch-transfer-row-balance-${index}`)).toHaveText(
        '10,000',
        { timeout: 20_000 },
      );
    }
    await expect(page.getByTestId('batch-transfer-row-amount-0')).toHaveText(`0.1 ${NATIVE}`);

    // 用户自己处理：删掉第 4 行后，同一批恢复可提交。
    await fillBatch(page, [`${R5} 0.1`, `${R7}, 0.2`, `${R8} 0.15`, `${R9} 0.000001`]);
    await expect(page.getByTestId('batch-transfer-duplicates')).toHaveCount(0);
    await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();

    await page.getByTestId('batch-transfer-submit').click();

    await expect(page.getByTestId('batch-transfer-receipt-total')).toHaveText(
      `0.450001 ${NATIVE}`,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('batch-transfer-receipt-count')).toHaveText('4 个收款方');
    await expect(page.getByTestId('batch-transfer-receipt-delta-0')).toHaveText('+0.1');
    await expect(page.getByTestId('batch-transfer-receipt-delta-1')).toHaveText('+0.2');
    await expect(page.getByTestId('batch-transfer-receipt-delta-2')).toHaveText('+0.15');
    await expect(page.getByTestId('batch-transfer-receipt-delta-3')).toHaveText('+0.000001');

    await page.getByRole('button', { name: '留在此页' }).click();
    await expect(page.getByTestId('batch-transfer-success-strip-amount')).toHaveText(
      `已转出 0.450001 ${NATIVE}`,
    );
    await expect(page).toHaveURL(new RegExp(`/batch-transfer\\${QUERY}$`));
  });

  test('用例 E 整批回滚：合约收款方拒收，整批不到账且资产不变', async ({ page }) => {
    await openBatch(page, NATIVE_SENDER);
    await fillBatch(page, [`${R5} 0.1`, `${TOKEN} 0.1`, `${R7} 0.1`]);

    // 资产保护：合约收款方有可见警告。
    await expect(page.getByTestId('batch-transfer-contract-warning')).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId('batch-transfer-submit').click();

    await expect(page.getByTestId('batch-transfer-error')).toHaveText(
      `第 2 行收款方拒收了这笔转账（对方可能是不接收 ${NATIVE} 的合约）。整批没有转出，你的资产没有变化。`,
      { timeout: 30_000 },
    );
    // 没有回执：整批原子失败，页面仍停在录入态。
    await expect(page.getByTestId('batch-transfer-receipt-total')).toHaveCount(0);
    await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();
  });

  test('用例 B ERC20 批量 + approve：0 → 授权 2.000002 → 3 行到账', async ({ page }) => {
    await openBatch(page, ERC20_SENDER);
    await useTokenMode(page);
    await expect(page.getByTestId('batch-transfer-balance')).toHaveText(
      `${SYMBOL} 余额 99,799,100`,
      { timeout: 20_000 },
    );

    await fillBatch(page, [`${R5} 1.5`, `${R2} 0.5`, `${R7} 0.000002`]);
    await expect(page.getByTestId('batch-transfer-total')).toHaveText(
      `合计 2.000002 ${SYMBOL}`,
    );
    await expect(page.getByTestId('batch-transfer-allowance')).toHaveText(
      `已允许批量转账合约使用 0 / 本次需要 2.000002 ${SYMBOL}`,
      { timeout: 20_000 },
    );

    const submit = page.getByTestId('batch-transfer-submit');
    // Global 授权 copy (owner 2026-11-14): only the token symbol changes.
    await expect(submit).toHaveText(`授权 ${SYMBOL}`);
    await submit.click();

    // 授权确认后页面重读额度，同一个位置变成第二步。
    await expect(submit).toHaveText('批量转账', { timeout: 30_000 });
    await expect(submit).toBeEnabled();
    await expect(page.getByTestId('batch-transfer-allowance')).toHaveText(
      `已允许批量转账合约使用 2.000002 / 本次需要 2.000002 ${SYMBOL}`,
      { timeout: 20_000 },
    );
    await submit.click();

    await expect(page.getByTestId('batch-transfer-receipt-total')).toHaveText(
      `2.000002 ${SYMBOL}`,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('batch-transfer-receipt-delta-0')).toHaveText('+1.5');
    await expect(page.getByTestId('batch-transfer-receipt-delta-1')).toHaveText('+0.5');
    await expect(page.getByTestId('batch-transfer-receipt-delta-2')).toHaveText('+0.000002');

    await page.getByRole('button', { name: '留在此页' }).click();
    await expect(page.getByTestId('batch-transfer-balance')).toHaveText(
      `${SYMBOL} 余额 99,799,097.999998`,
      { timeout: 20_000 },
    );
  });
});

/**
 * 验收截图：390×844 与 1280×800、浅色与深色，覆盖
 * 录入态（含逐行报错）/ 核对结果 / 成功回执。
 */
test.describe('批量转账 验收截图', () => {
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
    await page.goto(`/batch-transfer${QUERY}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await connect(page);
  }

  async function shoot(page: Page, name: string): Promise<void> {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({
      path: resolve(SHOTS, `batch-transfer-${name}.png`),
      animations: 'disabled',
      fullPage: false,
    });
  }

  test('录入态（逐行报错 + 重复地址提示）截图', async ({ page }) => {
    await installWallet(page, ERC20_SENDER);
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, theme, viewport.width, viewport.height);
        await expect(page.getByTestId('batch-transfer-balance')).toContainText('余额', {
          timeout: 20_000,
        });
        // 第 2 行缺金额、第 3 行金额非法、第 4 行重复地址：三种问题都在文本域下方就地标出。
        await fillBatch(page, [`${R5} 0.1`, R7, `${R8} abc`, `${R5} 0.05`]);
        await expect(page.getByTestId('batch-transfer-line-error-2')).toBeVisible();
        await expect(page.getByTestId('batch-transfer-line-error-3')).toBeVisible();
        await expect(page.getByTestId('batch-transfer-duplicate-4')).toBeVisible();
        await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();
        await page.getByTestId('batch-transfer-input').scrollIntoViewIfNeeded();
        await shoot(page, `entry-errors-${theme}-${viewport.key}`);
      }
    }
  });

  test('核对结果截图', async ({ page }) => {
    await installWallet(page, NATIVE_SENDER);
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, theme, viewport.width, viewport.height);
        await fillBatch(page, [`${R5} 0.1`, `${R7}, 0.2`, `${R8} 0.15`, `${R9} 0.000001`]);
        // The pre-submit balance read settles asynchronously; only its presence is
        // asserted here (this screenshot block may run after the functional tests
        // already credited some recipients).
        await expect(page.getByTestId('batch-transfer-row-balance-3')).not.toHaveText('—', {
          timeout: 20_000,
        });
        await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();
        // 主按钮之后是预余额核对表：把两者一起放进画面（区块顺序：… → 主按钮 → 核对表）。
        await page.getByTestId('batch-transfer-submit').scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, -88));
        await shoot(page, `review-${theme}-${viewport.key}`);
      }
    }
  });

  test('成功回执截图', async ({ page }) => {
    await installWallet(page, NATIVE_SENDER);
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, theme, viewport.width, viewport.height);
        await fillBatch(page, [`${R5} 0.01`, `${R7} 0.02`]);
        await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();
        await page.getByTestId('batch-transfer-submit').click();
        await expect(page.getByTestId('batch-transfer-receipt-total')).toHaveText(
          `0.03 ${NATIVE}`,
          { timeout: 30_000 },
        );
        await shoot(page, `receipt-${theme}-${viewport.key}`);
      }
    }
  });
});
