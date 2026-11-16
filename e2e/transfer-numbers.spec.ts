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
  readFileSync(resolve(process.cwd(), 'src/config/network/anvil31337_dev/network.json'), 'utf8'),
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
  permissions: ['clipboard-read', 'clipboard-write'],
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

const MODE_LABELS = {
  address: '按地址',
  member: '按身份 NFT ID',
  name: '按身份 NFT 名字',
} as const;

/** 收款方左侧下拉：owner 2026-11-14 的三模式（地址 / 身份 NFT ID / 身份 NFT 名字）。 */
async function selectRecipientMode(page: Page, mode: keyof typeof MODE_LABELS): Promise<void> {
  const trigger = page.getByTestId('transfer-recipient-mode');
  if ((await trigger.innerText()).includes(MODE_LABELS[mode])) return;
  await trigger.click();
  const option = page.getByTestId(`transfer-mode-${mode}`);
  await expect(option).toBeVisible();
  await option.click();
  await expect(trigger).toContainText(MODE_LABELS[mode]);
}

test.describe('代币转账 前端线（理论线 §1）', () => {
  test('用例 A 原生转账：余额 10,000 → 回执 0.1 ETH', async ({ page }) => {
    await openTransfer(page, NATIVE_SENDER);
    await expect(page.getByTestId('transfer-token')).toContainText(NATIVE, { timeout: 20_000 });
    // owner 2026-11-16 布局：余额在金额下方、小号 muted；金额右侧是代币下拉。
    const balance = page.getByTestId('transfer-balance');
    await expect(balance).toHaveText(`余额 10,000 ${NATIVE}`, { timeout: 20_000 });
    await expect(page.getByTestId('transfer-decimals')).toHaveCount(0);
    await expect(page.getByText('代币', { exact: true })).toHaveCount(0);

    // 区块顺序：收款方 → 金额输入（右侧代币下拉）→ 余额小字。
    const recipientBox = await page.getByTestId('transfer-recipient').boundingBox();
    const balanceBox = await balance.boundingBox();
    const amountBox = await page.getByTestId('transfer-amount').boundingBox();
    const tokenBox = await page.getByTestId('transfer-token').boundingBox();
    expect(recipientBox).not.toBeNull();
    expect(balanceBox).not.toBeNull();
    expect(amountBox).not.toBeNull();
    expect(tokenBox).not.toBeNull();
    expect(recipientBox!.y).toBeLessThan(amountBox!.y);
    expect(amountBox!.y).toBeLessThan(balanceBox!.y);
    // 代币下拉在金额输入框右侧、同一行（不是金额下方）。
    expect(tokenBox!.x).toBeGreaterThan(amountBox!.x + amountBox!.width - 4);
    expect(tokenBox!.y).toBeLessThan(amountBox!.y + amountBox!.height);
    // 余额是小号 muted 文字，不再是醒目大数字。
    const balanceStyle = await balance.evaluate((node) => {
      const computed = window.getComputedStyle(node as HTMLElement);
      return { fontSize: parseFloat(computed.fontSize), color: computed.color };
    });
    expect(balanceStyle.fontSize).toBeLessThanOrEqual(13);

    // 智能资产保护：默认开启（owner 2026-11-16），与另外两个转账页共用同一偏好。
    await expect(page.getByTestId('asset-protection-toggle')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByText('智能资产保护')).toBeVisible();

    await fillTransfer(page, '0.1', NATIVE_RECIPIENT);
    await expect(page.getByTestId('transfer-submit')).toBeEnabled();
    await page.getByTestId('transfer-submit').click();

    await expect(page.getByTestId('transfer-receipt-amount')).toHaveText(`0.1 ${NATIVE}`, {
      timeout: 30_000,
    });
    const receiptRecipient = page.getByTestId('transfer-receipt-recipient');
    await expect(receiptRecipient).toHaveText(NATIVE_RECIPIENT);
    // 回执里的收款地址同样可点击复制。
    await receiptRecipient.click();
    await expect(receiptRecipient).toContainText('已复制');
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(NATIVE_RECIPIENT);
    const hash = (await page.getByTestId('transfer-receipt-hash').innerText()).trim();
    expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // 回执可关闭且留在原页：收成成功条，不跳转。
    await page.getByRole('button', { name: '好的' }).click();
    await expect(page.getByTestId('transfer-success-strip-amount')).toHaveText(
      `已转出 0.1 ${NATIVE}`,
    );
    await expect(page).toHaveURL(new RegExp(`/transfer\\${QUERY}$`));
  });

  test('用例 B 非整数 ERC20 转账：99,799,100 → 99,799,098.5 TestLOVE20', async ({ page }) => {
    await openTransfer(page, ERC20_SENDER);
    await selectToken(page, SYMBOL);
    await expect(page.getByTestId('transfer-balance')).toHaveText(`余额 99,799,100 ${SYMBOL}`, {
      timeout: 20_000,
    });
    // 精度只在 ≠18 时显示；ETH/TestLOVE20 都是 18 位，默认不写。
    await expect(page.getByTestId('transfer-decimals')).toHaveCount(0);
    await expect(page.getByText(/精度/)).toHaveCount(0);

    await fillTransfer(page, '1.5', RECIPIENT);
    await page.getByTestId('transfer-submit').click();
    await expect(page.getByTestId('transfer-receipt-amount')).toHaveText(`1.5 ${SYMBOL}`, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('transfer-receipt-recipient')).toHaveText(RECIPIENT);

    await page.getByRole('button', { name: '好的' }).click();
    // 余额刷新后与理论线 §1 用例 B 的 S_after 逐字相等。
    await expect(page.getByTestId('transfer-balance')).toHaveText(`余额 99,799,098.5 ${SYMBOL}`, {
      timeout: 20_000,
    });
  });

  test('用例 C 余额不足：ERC20 差 1，原生币差 0.001', async ({ page }) => {
    await openTransfer(page, OUTSIDER);
    await selectToken(page, SYMBOL);
    await expect(page.getByTestId('transfer-balance')).toHaveText(`余额 0 ${SYMBOL}`, {
      timeout: 20_000,
    });
    await fillTransfer(page, '1', RECIPIENT);
    await expect(page.getByTestId('transfer-amount-error')).toHaveText(`${SYMBOL} 不够，还差 1`);
    await expect(page.getByTestId('transfer-submit')).toBeDisabled();

    // 原生币：10,000 − 0.001 预留 = 9,999.999 可花，输入 10,000 差 0.001。
    await selectToken(page, NATIVE);
    await expect(page.getByTestId('transfer-balance')).toHaveText(`余额 10,000 ${NATIVE}`, {
      timeout: 20_000,
    });
    await page.getByTestId('transfer-amount').fill('10000');
    await expect(page.getByTestId('transfer-amount-error')).toHaveText(
      `${NATIVE} 不够，还差 0.001`,
    );
    await expect(page.getByText(`需要预留一点 ${NATIVE} 支付网络手续费。`)).toBeVisible();
    await expect(page.getByTestId('transfer-submit')).toBeDisabled();
  });

  test('用例 D 已知合约：智能资产保护拦截，关闭开关后不再检测已知合约（只剩通用合约警告）', async ({
    page,
  }) => {
    await openTransfer(page, ERC20_SENDER);
    await fillTransfer(page, '0.1', PAIR);

    // 开关开启（默认）：硬拦截，页内不出现勾选，唯一出口是关闭开关。
    const protection = page.getByTestId('transfer-protection');
    await expect(protection).toBeVisible({ timeout: 20_000 });
    await expect(protection).toContainText('智能资产保护已拦截：这是「交易对」合约地址');
    await expect(page.getByTestId('transfer-known-ack')).toHaveCount(0);
    await expect(page.getByTestId('transfer-submit')).toBeDisabled();

    // 关闭开关 = 只跳过「是不是地址簿已知合约」这一项检测（owner 2026-11-16）：
    // 已知合约块与勾选都不再出现，同一地址退化为通用「这是一个合约」警告，可提交。
    await page.getByTestId('asset-protection-toggle').click();
    await expect(page.getByTestId('asset-protection-toggle')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(page.getByTestId('transfer-protection')).toHaveCount(0);
    await expect(page.getByTestId('transfer-known-ack')).toHaveCount(0);
    await expect(page.getByTestId('transfer-contract-warning')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('transfer-contract-warning')).toContainText(
      '这个地址是一个合约',
    );
    await expect(page.getByTestId('transfer-submit')).toBeEnabled();

    // 任意有 bytecode 但不是地址簿条目的合约：只警告、不拦截（开关开启时同样）。
    await page.getByTestId('transfer-recipient').fill(TOKEN);
    await expect(page.getByTestId('transfer-contract-warning')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('transfer-protection')).toHaveCount(0);
    await expect(page.getByTestId('transfer-submit')).toBeEnabled();

    // 重新打开开关后，同一已知合约立刻回到拦截（开关与拦截联动）。
    await page.getByTestId('asset-protection-toggle').click();
    await page.getByTestId('transfer-recipient').fill(PAIR);
    await expect(page.getByTestId('transfer-protection')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('transfer-submit')).toBeDisabled();
  });

  test('智能资产保护滑块在胶囊内：开启时左右各留 ≥2px（与流动性智能模式一致）', async ({
    page,
  }) => {
    await openTransfer(page, ERC20_SENDER);
    const pill = page.getByTestId('asset-protection-toggle');
    const thumb = pill.locator('span');
    await expect(thumb).toBeVisible();
    // 滑块基准位置 left-0.5 = 3px（含 1px 边框），行程 18px → 开启时左间隙 21px；
    // 44(w-11) − 3 − 18 − 20(h-5) = 3px 右间隙。旧的 translate-x-[22px] 会把滑块
    // 右沿压出胶囊（右间隙为负），这条断言防回归。
    await expect
      .poll(async () => {
        const pillBox = await pill.boundingBox();
        const thumbBox = await thumb.boundingBox();
        if (pillBox === null || thumbBox === null) return null;
        return {
          leftGap: Math.round(thumbBox.x - pillBox.x),
          rightGap: Math.round(pillBox.x + pillBox.width - (thumbBox.x + thumbBox.width)),
        };
      })
      .toEqual({ leftGap: 21, rightGap: 3 });
    // 关闭时滑块回到 left-0.5（3px），可见位移正好 18px。
    await pill.click();
    await expect
      .poll(async () => {
        const pillBox = await pill.boundingBox();
        const thumbBox = await thumb.boundingBox();
        if (pillBox === null || thumbBox === null) return null;
        return Math.round(thumbBox.x - pillBox.x);
      })
      .toBe(3);
  });

  test('智能资产保护 偏好持久化、跨页共享同一键', async ({ page }) => {
    await openTransfer(page, ERC20_SENDER);
    const toggle = page.getByTestId('asset-protection-toggle');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    // 沿用旧库的同名键与 1/0 编码，刷新后仍是关闭。
    await expect
      .poll(() =>
        page.evaluate(() => window.localStorage.getItem('love20:transfer:assetProtectionEnabled')),
      )
      .toBe('0');
    await page.reload();
    await connect(page);
    await expect(page.getByTestId('asset-protection-toggle')).toHaveAttribute(
      'aria-checked',
      'false',
    );

    // 跨页共享：批量转账页读到同一个偏好。
    await page.goto(`/batch-transfer${QUERY}`);
    await connect(page);
    await expect(page.getByTestId('asset-protection-toggle')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // 在批量转账页打开后，代币转账页同样变为开启。
    await page.getByTestId('asset-protection-toggle').click();
    await page.goto(`/transfer${QUERY}`);
    await connect(page);
    await expect(page.getByTestId('asset-protection-toggle')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('用例 E 按身份 NFT 收款：#2 → Testdev-member-1 的 owner', async ({ page }) => {
    await openTransfer(page, IDENTITY_SENDER);
    await selectToken(page, SYMBOL);
    await expect(page.getByTestId('transfer-balance')).toHaveText(`余额 99,999,099.999639 ${SYMBOL}`, {
      timeout: 20_000,
    });

    await selectRecipientMode(page, 'member');
    await page.getByTestId('transfer-recipient').fill('#2');
    const summary = page.getByTestId('transfer-identity-summary');
    await expect(summary).toBeVisible({ timeout: 20_000 });
    await expect(summary).toContainText('身份 NFT #2 Testdev-member-1');
    const identityRecipient = page.getByTestId('transfer-identity-recipient');
    await expect(identityRecipient).toHaveText(`收款人 0x7099…79C8`);

    // owner 2026-11-14: 身份解析出来的 owner 地址也是地址，点击复制完整地址。
    await identityRecipient.getByRole('button').click();
    await expect(identityRecipient).toContainText('已复制');
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(IDENTITY_2_OWNER);

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

    await page.getByRole('button', { name: '好的' }).click();
    await expect(page.getByTestId('transfer-balance')).toHaveText(`余额 99,999,097.499639 ${SYMBOL}`, {
      timeout: 20_000,
    });
  });

  test('用例 F 收款方模式按模式校验：ID 只收编号，名字模式按名字解析', async ({ page }) => {
    await openTransfer(page, IDENTITY_SENDER);
    await selectToken(page, SYMBOL);

    // ID 模式：名字不是编号，直接给人话错误，不发任何 ownerOf 读。
    await selectRecipientMode(page, 'member');
    const input = page.getByTestId('transfer-recipient');
    await input.fill('Testdev-member-1');
    await expect(page.getByText('请输入身份 NFT 编号，例如 #12。')).toBeVisible();
    await expect(page.getByTestId('transfer-identity-summary')).toHaveCount(0);
    await expect(page.getByTestId('transfer-submit')).toBeDisabled();

    // 名字模式：同一个字符串按名字解析到 #2 的当前持有人（纯数字名字不会被当成 ID）。
    await selectRecipientMode(page, 'name');
    await input.fill('Testdev-member-1');
    const summary = page.getByTestId('transfer-identity-summary');
    await expect(summary).toBeVisible({ timeout: 20_000 });
    await expect(summary).toContainText('身份 NFT #2 Testdev-member-1');
    await expect(page.getByTestId('transfer-identity-recipient')).toHaveText('收款人 0x7099…79C8');
    await expect(page.getByTestId('transfer-submit')).toBeDisabled();
    await page.getByTestId('transfer-identity-ack').check();
    await page.getByTestId('transfer-amount').fill('1');
    await expect(page.getByTestId('transfer-submit')).toBeEnabled();

    // 切回地址模式：输入框换成地址占位符，身份确认不再出现（本用例不发交易）。
    await selectRecipientMode(page, 'address');
    await expect(page.getByTestId('transfer-recipient')).toHaveAttribute(
      'placeholder',
      '0x 开头的 40 位地址',
    );
    await expect(page.getByTestId('transfer-identity-summary')).toHaveCount(0);
  });

  test('自定义 ERC20：读 symbol/decimals 后可选中；非合约地址给人话错误', async ({ page }) => {
    await openTransfer(page, OUTSIDER);

    await page.getByTestId('transfer-token').click();
    await page.getByTestId('transfer-custom-address').fill(WETH);
    await page.getByRole('button', { name: '添加代币' }).click();
    // A resolved custom token replaces the selection and closes the picker.
    await expect(page.getByTestId('transfer-token')).toContainText('TestWETH', { timeout: 20_000 });
    await expect(page.getByTestId('transfer-balance')).toHaveText('余额 0 TestWETH', {
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
      // Every screenshot starts from the shipped default (智能资产保护 开启), so a
      // previous loop iteration that turned it off cannot leak into the next shot.
      window.localStorage.setItem('love20:transfer:assetProtectionEnabled', '1');
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
        await expect(page.getByTestId('transfer-balance')).toHaveText(
          new RegExp(`^余额 [\\d,]+(\\.\\d+)? ${SYMBOL}$`),
          { timeout: 20_000 },
        );
        await fillTransfer(page, '1.5', RECIPIENT);
        await expect(page.getByTestId('transfer-submit')).toBeEnabled();
        await shoot(page, `form-${theme}-${viewport.key}`);
      }
    }
  });

  test('资产保护拦截截图（开关开启）', async ({ page }) => {
    await installWallet(page, ERC20_SENDER);
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, theme, viewport.width, viewport.height);
        await fillTransfer(page, '0.1', PAIR);
        await expect(page.getByTestId('transfer-protection')).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId('asset-protection-toggle')).toHaveAttribute(
          'aria-checked',
          'true',
        );
        await expect(page.getByTestId('transfer-submit')).toBeDisabled();
        await shoot(page, `protection-${theme}-${viewport.key}`);
      }
    }
  });

  test('资产保护关闭截图（关闭后只剩通用合约警告）', async ({ page }) => {
    await installWallet(page, ERC20_SENDER);
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, theme, viewport.width, viewport.height);
        await fillTransfer(page, '0.1', PAIR);
        await page.getByTestId('asset-protection-toggle').click();
        // 关闭后：已知合约块与勾选都不再出现，同一地址按任意合约只警告。
        await expect(page.getByTestId('transfer-contract-warning')).toBeVisible({
          timeout: 20_000,
        });
        await expect(page.getByTestId('transfer-protection')).toHaveCount(0);
        await expect(page.getByTestId('transfer-known-ack')).toHaveCount(0);
        await expect(page.getByTestId('asset-protection-toggle')).toHaveAttribute(
          'aria-checked',
          'false',
        );
        await expect(page.getByTestId('transfer-submit')).toBeEnabled();
        await shoot(page, `protection-off-${theme}-${viewport.key}`);
      }
    }
  });

  test('成功回执截图', async ({ page }) => {
    await installWallet(page, ERC20_SENDER);
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, theme, viewport.width, viewport.height);
        await selectToken(page, SYMBOL);
        await expect(page.getByTestId('transfer-balance')).toHaveText(
          new RegExp(`^余额 [\\d,]+(\\.\\d+)? ${SYMBOL}$`),
          { timeout: 20_000 },
        );
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
