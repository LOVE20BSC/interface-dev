import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { anvilRpc, isolateChain, revertChain, snapshotChain } from './chain';
import { ACCOUNTS, connect, installWallet } from './wallet-stub';

/**
 * 应用·流动性池 前端线（三线校验 §3）:
 * `docs/product/three-line/liquidity.md` §1 的理论值必须逐字出现在页面上。
 *
 * 断言只读页面文字；链上夹具只依赖 clean bootstrap 的固定初始状态。每个用例自己
 * 取一次 anvil 快照、结束时回滚，所以用例之间互不影响（追加流动性会改储备，不能
 * 靠「账户不重叠」隔离）。用例 E 在快照内用 dex 的 WETH9Configurable 部署一个
 * 没有 pair 的测试代币，用来验证「首次建池」与「这个代币还没有流动性池」。
 *
 * 本 spec 末尾同时产出 390×844 / 1280×800 × 浅色/深色 的验收截图。
 */

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');
const SYMBOL = 'TestLOVE20';
const QUERY = `?symbol=${SYMBOL}`;
const TEST_X = 'TestX';

// anvil 固定账户：#4 / #1 有 TestLOVE20，#5 只有原生币，#8 用于首次建池。
const TOKEN_HOLDER = ACCOUNTS.withIdentity; // #1 0xf39F…2266
const TOKEN_HOLDER_4 = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'; // #4
const NATIVE_ONLY = ACCOUNTS.eligible; // #5 0x9965…A4dc
const FIRST_MINT = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f'; // #8

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  actionTimeout: 20_000,
});

test.describe.configure({ mode: 'serial', timeout: 240_000 });
isolateChain();

async function openLiquidity(page: Page, account: string): Promise<void> {
  await installWallet(page, account);
  await page.goto(`/liquidity${QUERY}`);
  await connect(page);
}

/** 每个用例独立快照：加池会改储备，用例之间必须回到同一初始状态。 */
function withChainSnapshot(fn: (page: Page) => Promise<void>) {
  return async ({ page }: { page: Page }): Promise<void> => {
    const id = await snapshotChain();
    try {
      await fn(page);
    } finally {
      await revertChain(id);
    }
  };
}

async function deployTestToken(): Promise<string> {
  const artifact = JSON.parse(
    readFileSync(
      resolve(process.cwd(), '../dex/out/WETH9Configurable.sol/WETH9Configurable.json'),
      'utf8',
    ),
  ) as { abi: unknown[]; bytecode: { object: string } };
  const args = encodeAbiParameters(parseAbiParameters('string, string'), [TEST_X, TEST_X]).slice(2);
  const hash = await anvilRpc<string>('eth_sendTransaction', [
    { from: FIRST_MINT, data: `${artifact.bytecode.object}${args}`, gas: '0x5b8d80' },
  ]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const receipt = await anvilRpc<{ contractAddress?: string } | null>(
      'eth_getTransactionReceipt',
      [hash],
    );
    if (receipt?.contractAddress !== undefined) {
          // WETH9Configurable.deposit()：用 100 ETH 铸出 100 TestX。
      // 必须等这笔交易上链：页面读余额时如果交易还没进块，会读到 0（缓存后
      // 整轮都是 0，余额校验就会挡住提交）。
      const depositHash = await anvilRpc<string>('eth_sendTransaction', [
        {
          from: FIRST_MINT,
          to: receipt.contractAddress,
          value: '0x56bc75e2d63100000',
          data: '0xd0e30db0',
        },
      ]);
      for (let wait = 0; wait < 40; wait += 1) {
        const depositReceipt = await anvilRpc<{ status?: string } | null>(
          'eth_getTransactionReceipt',
          [depositHash],
        );
        if (depositReceipt?.status === '0x1') return receipt.contractAddress;
        await new Promise((done) => setTimeout(done, 250));
      }
      throw new Error('deployTestToken: deposit 交易没有确认');
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error('deployTestToken: 部署没有返回合约地址');
}

async function addQuote(page: Page, tokenAmount: string): Promise<void> {
  await page.getByTestId('liquidity-token-amount').fill(tokenAmount);
  await expect(page.getByTestId('liquidity-quote-liquidity')).toBeVisible({ timeout: 20_000 });
}

/**
 * 授权 → 等额度刷新 → 主按钮。
 * Owner 2026-11-14: the 授权 button is always rendered in flow (prerequisite
 * first); it is enabled only while the allowance is short. Click it only in
 * that state, then wait for the primary button to unlock.
 */
async function approveThenSubmit(page: Page, approveTestId: string, submitTestId: string): Promise<void> {
  const approveButton = page.getByTestId(approveTestId);
  await expect(approveButton).toBeVisible({ timeout: 20_000 });
  if (await approveButton.isEnabled()) {
    await approveButton.click();
  }
  await expect(page.getByTestId(submitTestId)).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId(submitTestId).click();
}

test.describe('流动性池 前端线（理论线 §1）', () => {
  test('用例 A + C：单边加池报价逐字一致，我的份额 18.32%，撤出 100%', withChainSnapshot(async (page) => {
    await openLiquidity(page, TOKEN_HOLDER_4);
    await expect(page.getByTestId('liquidity-token')).toContainText(SYMBOL, { timeout: 20_000 });
    await expect(page.getByTestId('liquidity-balance-token')).toContainText(
      `${SYMBOL} 余额 99,999,099.999639`,
      { timeout: 20_000 },
    );

    await addQuote(page, '100000');
    // §1.2 用例 A：swap 段、prepared、LP、最少进池，逐字相等。
    await expect(page.getByTestId('liquidity-quote-swap')).toHaveText(
      '其中 45,016.508348 TestLOVE20 会先换成 18.32783 ETH。',
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('liquidity-quote-prepared')).toHaveText(
      '实际进池 54,983.491651 TestLOVE20 + 18.32783 ETH',
    );
    await expect(page.getByTestId('liquidity-quote-liquidity')).toHaveText(
      '预计获得 1,003.579928 流动性凭证',
    );
    await expect(page.getByTestId('liquidity-quote-min')).toHaveText(
      '最少进池 54,708.574193 TestLOVE20 + 18.236191 ETH',
    );

    await approveThenSubmit(page, 'liquidity-add-approve', 'liquidity-add-submit');
    await expect(page.getByTestId('liquidity-receipt-title')).toHaveText('流动性添加完成', {
      timeout: 30_000,
    });
    const hash = (await page.getByTestId('liquidity-receipt-hash').innerText()).trim();
    expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    await page.getByRole('button', { name: '留在此页' }).click();

    // 用例 C 的初始状态：我的 LP 与份额。
    await page.getByTestId('liquidity-tab-mine').click();
    await expect(page.getByTestId('liquidity-my-lp')).toHaveText('1,003.579928', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('liquidity-my-share')).toHaveText('18.32%');
    await expect(page.getByTestId('liquidity-withdraw-amount')).toHaveText(
      '54,983.491651 TestLOVE20 + 18.32783 ETH',
    );
    await expect(page.getByTestId('liquidity-withdraw-min')).toHaveText(
      '54,708.574193 TestLOVE20 + 18.236191 ETH',
    );

    // 撤出 100%：先允许，再确认。
    await approveThenSubmit(page, 'liquidity-withdraw-approve', 'liquidity-withdraw-submit');
    await expect(page.getByTestId('liquidity-receipt-detail')).toHaveText(
      '已撤出 54,983.491651 TestLOVE20 + 18.32783 ETH',
      { timeout: 30_000 },
    );
    await page.getByRole('button', { name: '留在此页' }).click();
    await expect(page.getByText('你还没有这个池子的流动性。')).toBeVisible({ timeout: 20_000 });
  }));

  test('用例 B：单边 10 ETH，报价与我的份额 4.64% 逐字一致', withChainSnapshot(async (page) => {
    await openLiquidity(page, NATIVE_ONLY);
    await expect(page.getByTestId('liquidity-token')).toContainText(SYMBOL, { timeout: 20_000 });

    await page.getByTestId('liquidity-native-amount').fill('10');
    await expect(page.getByTestId('liquidity-quote-swap')).toHaveText(
      '其中 4.888217 ETH 会先换成 9,294.150182 TestLOVE20。',
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('liquidity-quote-prepared')).toHaveText(
      '实际进池 9,294.150182 TestLOVE20 + 5.111782 ETH',
    );
    await expect(page.getByTestId('liquidity-quote-liquidity')).toHaveText(
      '预计获得 217.951904 流动性凭证',
    );
    await expect(page.getByTestId('liquidity-quote-min')).toHaveText(
      '最少进池 9,247.679431 TestLOVE20 + 5.086223 ETH',
    );

    // 原生币单边不需要授权，直接确认添加。
    await page.getByTestId('liquidity-add-submit').click();
    await expect(page.getByTestId('liquidity-receipt-title')).toHaveText('流动性添加完成', {
      timeout: 30_000,
    });
    await page.getByRole('button', { name: '留在此页' }).click();

    await page.getByTestId('liquidity-tab-mine').click();
    await expect(page.getByTestId('liquidity-my-lp')).toHaveText('217.951904', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('liquidity-my-share')).toHaveText('4.64%');
  }));

  test('用例 D：两侧都填 1000 + 0.5，按比例进场', withChainSnapshot(async (page) => {
    await openLiquidity(page, TOKEN_HOLDER);
    await expect(page.getByTestId('liquidity-token')).toContainText(SYMBOL, { timeout: 20_000 });

    await page.getByTestId('liquidity-mode-dual').click();
    await page.getByTestId('liquidity-token-amount').fill('1000');
    await page.getByTestId('liquidity-native-amount').fill('0.5');
    await expect(page.getByTestId('liquidity-quote-prepared')).toHaveText(
      '实际进池 1,000 TestLOVE20 + 0.5 ETH',
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('liquidity-quote-liquidity')).toHaveText(
      '预计获得 22.360679 流动性凭证',
    );
    await expect(page.getByTestId('liquidity-quote-min')).toHaveText(
      '最少进池 995 TestLOVE20 + 0.4975 ETH',
    );

    await approveThenSubmit(page, 'liquidity-add-approve', 'liquidity-add-submit');
    await expect(page.getByTestId('liquidity-receipt-title')).toHaveText('流动性添加完成', {
      timeout: 30_000,
    });
    await page.getByRole('button', { name: '留在此页' }).click();

    await page.getByTestId('liquidity-tab-mine').click();
    await expect(page.getByTestId('liquidity-my-lp')).toHaveText('22.360679', {
      timeout: 20_000,
    });
  }));

  test('用例 E：空池提示 + 首次建池 sqrt(a·b) − 1000', withChainSnapshot(async (page) => {
    const testToken = await deployTestToken();
      await openLiquidity(page, FIRST_MINT);
      await page.getByTestId('liquidity-custom-address').fill(testToken);
    await page.getByTestId('liquidity-custom-add').click();
    await expect(page.getByTestId('liquidity-token')).toContainText(TEST_X, { timeout: 20_000 });

    // 空池：查询页先明确说「还没有流动性池」。
      await page.getByTestId('liquidity-tab-query').click();
    await expect(page.getByTestId('liquidity-query-empty')).toContainText(
      '这个代币还没有流动性池。',
    );

      await page.getByTestId('liquidity-tab-add').click();
    await page.getByTestId('liquidity-token-amount').fill('100');
    await page.getByTestId('liquidity-native-amount').fill('0.01');
    await expect(page.getByTestId('liquidity-quote-first-mint')).toHaveText(
      '第一次建池：1 ETH = 10,000 TestX',
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('liquidity-quote-liquidity')).toHaveText(
      '预计获得 0.999999 流动性凭证',
    );

      await approveThenSubmit(page, 'liquidity-add-approve', 'liquidity-add-submit');
    await expect(page.getByTestId('liquidity-receipt-title')).toHaveText('流动性添加完成', {
      timeout: 30_000,
    });
      await page.getByRole('button', { name: '留在此页' }).click();

    // 建池后查询页显示两侧储备与价格。
    await page.getByTestId('liquidity-tab-query').click();
    await expect(page.getByTestId('liquidity-query-reserve-token')).toHaveText('100 TestX', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('liquidity-query-reserve-native')).toHaveText('0.01 ETH');
    await expect(page.getByTestId('liquidity-query-price')).toHaveText('1 ETH ≈ 10,000 TestX');
  }));

  test('边界：余额不足 / 输入 0 / 滑点非法 一律禁用主按钮', withChainSnapshot(async (page) => {
    // 主按钮和授权按钮都在流内常驻；门禁必须同时挡住这两个写操作。
    const primary = page.getByTestId('liquidity-add-submit');
    const approve = page.getByTestId('liquidity-add-approve');
    await openLiquidity(page, NATIVE_ONLY);
    await expect(primary).toBeVisible({ timeout: 20_000 });
    await expect(primary).toBeDisabled();
    await expect(approve).toBeDisabled();

    await page.getByTestId('liquidity-token-amount').fill('1');
    await expect(page.getByTestId('liquidity-amount-error')).toHaveText(
      'TestLOVE20 不够，还差 1',
    );
    await expect(primary).toBeDisabled();

    await page.getByTestId('liquidity-token-amount').fill('-1');
    await expect(page.getByTestId('liquidity-amount-error')).toHaveText('请输入有效的金额。');
    await expect(primary).toBeDisabled();

    // 滑点非法：60% 超出 0.01%–50%，仍不允许提交。
    await page.getByTestId('liquidity-token-amount').fill('1000');
    await page.getByTestId('liquidity-settings-open').click();
    await page.getByTestId('liquidity-slippage-custom').fill('60');
    await expect(page.getByText(/自定义值需要在 0\.01% 到 50% 之间/)).toBeVisible();
    await page.getByRole('button', { name: '完成' }).click();
    await expect(primary).toBeDisabled();
  }));
});

/**
 * 验收截图：390×844 与 1280×800、浅色与深色，覆盖
 * 添加态（含报价）/ 我的流动性 / 撤出确认 / 空池提示。
 */
test.describe('流动性池 验收截图', () => {
  const VIEWPORTS = [
    { key: 'mobile', width: 390, height: 844 },
    { key: 'desktop', width: 1280, height: 800 },
  ] as const;
  const THEMES = ['light', 'dark'] as const;

  async function prepare(
    page: Page,
    account: string,
    theme: 'light' | 'dark',
    width: number,
    height: number,
  ): Promise<void> {
    await page.setViewportSize({ width, height });
    await page.addInitScript((nextTheme: string) => {
      window.localStorage.setItem('love20:theme', nextTheme);
    }, theme);
    await installWallet(page, account);
    await page.goto(`/liquidity${QUERY}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await connect(page);
  }

  async function shoot(page: Page, name: string): Promise<void> {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({
      path: resolve(SHOTS, `liquidity-${name}.png`),
      animations: 'disabled',
      fullPage: false,
    });
  }

  test('添加态（含报价）+ 我的流动性 + 撤出确认', withChainSnapshot(async (page) => {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const comboSnapshot = await snapshotChain();
        await prepare(page, TOKEN_HOLDER_4, theme, viewport.width, viewport.height);
        await expect(page.getByTestId('liquidity-token')).toContainText(SYMBOL, {
          timeout: 20_000,
        });
        await addQuote(page, '100000');
        // 等「单边」报价真正就绪（池子读取完成前会短暂显示两侧都填的兜底态），
        // 再把报价卡滚进视口，截图必须包含 swap 段 / prepared / LP / 最少进池。
        await expect(page.getByTestId('liquidity-quote-liquidity')).toHaveText(
          '预计获得 1,003.579928 流动性凭证',
          { timeout: 20_000 },
        );
        await page
          .getByTestId('liquidity-quote')
          .evaluate((element) => element.scrollIntoView({ block: 'center' }));
        await shoot(page, `add-${theme}-${viewport.key}`);

        await approveThenSubmit(page, 'liquidity-add-approve', 'liquidity-add-submit');
        await expect(page.getByTestId('liquidity-receipt-title')).toHaveText('流动性添加完成', {
          timeout: 30_000,
        });
        await page.getByRole('button', { name: '留在此页' }).click();
        await page.getByTestId('liquidity-tab-mine').click();
        await expect(page.getByTestId('liquidity-my-lp')).toHaveText('1,003.579928', {
          timeout: 20_000,
        });
        await shoot(page, `mine-${theme}-${viewport.key}`);
        await expect(page.getByTestId('liquidity-withdraw-min')).toHaveText(
          '54,708.574193 TestLOVE20 + 18.236191 ETH',
        );
        await page.getByTestId('liquidity-withdraw-min').scrollIntoViewIfNeeded();
        await shoot(page, `withdraw-${theme}-${viewport.key}`);
        await revertChain(comboSnapshot);
      }
    }
  }));

  test('空池提示', withChainSnapshot(async (page) => {
    const testToken = await deployTestToken();
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, FIRST_MINT, theme, viewport.width, viewport.height);
        await page.getByTestId('liquidity-custom-address').fill(testToken);
        await page.getByTestId('liquidity-custom-add').click();
        await expect(page.getByTestId('liquidity-token')).toContainText(TEST_X, {
          timeout: 20_000,
        });
        await page.getByTestId('liquidity-tab-query').click();
        await expect(page.getByTestId('liquidity-query-empty')).toBeVisible({ timeout: 20_000 });
        await shoot(page, `empty-${theme}-${viewport.key}`);
      }
    }
  }));
});
