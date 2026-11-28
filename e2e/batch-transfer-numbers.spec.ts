import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { anvilRpc, isolateChain } from './chain';
import { failReadsWithSelector, RPC_URL_PATTERN } from './rpc-read-failure';
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
  readFileSync(resolve(process.cwd(), 'src/config/network/anvil31337_dev/network.json'), 'utf8'),
) as {
  nativeCurrency: { symbol: string; decimals: number };
  addresses: {
    firstTokenAddress: `0x${string}`;
    batchTransfer: `0x${string}`;
    pair: `0x${string}`;
  };
};

const NATIVE = deployment.nativeCurrency.symbol;
const TOKEN = deployment.addresses.firstTokenAddress;
const BATCH = deployment.addresses.batchTransfer;
// 地址簿已知合约（交易对）：智能资产保护 拦截的对象。
const PAIR = deployment.addresses.pair;
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

/**
 * 刷新中的观感（owner 2026-11-17）：把 `nativeBalances` 的读按住不放，让页面停在
 * 「刷新中」这个状态，用来断言按钮 `aria-busy`、旧数字不被抹成「—」、主按钮禁用。
 * `release()` 之后请求照常发出，页面拿到新读数。没命中目标选择器的请求直接放行。
 */
async function holdReadsWithSelector(
  page: Page,
  selector: string,
): Promise<{ release: () => Promise<void> }> {
  const needle = selector.toLowerCase().replace(/^0x/, '');
  let openGate!: () => void;
  const gate = new Promise<void>((resolveGate) => {
    openGate = resolveGate;
  });
  // Held handlers still owe one `route.continue()`. Unrouting while one is parked
  // on the gate makes Playwright abort that route, and the resume then throws
  // 「Route is already handled!」— which fails the test with a misleading error.
  // (2026-11-17: flaked only in the full suite, where the resume/teardown race is
  // easy to lose.) So release() waits for the parked handlers to finish.
  let held = 0;
  let idle!: () => void;
  const whenIdle = new Promise<void>((resolveIdle) => {
    idle = resolveIdle;
  });
  const handler = async (route: Route): Promise<void> => {
    if (!(route.request().postData() ?? '').toLowerCase().includes(needle)) {
      await route.continue();
      return;
    }
    held += 1;
    try {
      await gate;
      await route.continue();
    } finally {
      held -= 1;
      if (held === 0) idle();
    }
  };
  await page.route(RPC_URL_PATTERN, handler);
  return {
    release: async () => {
      openGate();
      if (held > 0) await whenIdle;
      await page.unroute(RPC_URL_PATTERN, handler);
    },
  };
}

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
    await expect(page.getByTestId('batch-transfer-balance')).toHaveText(`${NATIVE} 余额 10,000`, {
      timeout: 20_000,
    });

    await fillBatch(page, [`${R5} 0.1`, R7, `${R8} abc`]);
    await expect(page.getByTestId('batch-transfer-line-error-2')).toHaveText('第 2 行：缺少金额。');
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

  test('用例 C2 智能资产保护：已知合约收款方整批拦截，关闭开关后不再检测已知合约', async ({
    page,
  }) => {
    await openBatch(page, NATIVE_SENDER);
    // 默认开启（owner 2026-11-16）。
    await expect(page.getByTestId('asset-protection-toggle')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await fillBatch(page, [`${PAIR} 0.1`]);
    const known = page.getByTestId('batch-transfer-known-contract');
    await expect(known).toBeVisible({ timeout: 20_000 });
    await expect(known).toContainText('有 1 行是协议合约，智能资产保护已拦截');
    await expect(known).toContainText('第 1 行：这是「交易对」合约地址');
    await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();

    // 关闭开关 = 只跳过「是不是地址簿已知合约」（owner 2026-11-16）：已知合约块与
    // 逐行点名都不再出现，同一地址按任意合约落到通用警告，提交恢复可用（基础校验仍在）。
    await page.getByTestId('asset-protection-toggle').click();
    await expect(known).toHaveCount(0);
    await expect(page.getByTestId('batch-transfer-contract-warning')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();

    // 任意合约（有 bytecode、不在地址簿）：只警告，不点名拦截。
    await fillBatch(page, [`${TOKEN} 0.1`]);
    await expect(page.getByTestId('batch-transfer-contract-warning')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId('batch-transfer-known-contract')).toHaveCount(0);
    await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();
  });

  test('用例 C3 智能资产保护：已知合约与任意合约同时命中时合并成一个提示块', async ({ page }) => {
    await openBatch(page, NATIVE_SENDER);
    await expect(page.getByTestId('asset-protection-toggle')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // 第 1 行地址簿已知合约（交易对），第 2 行任意合约（社区代币合约，有 bytecode）。
    await fillBatch(page, [`${PAIR} 0.1`, `${TOKEN} 0.2`]);
    const merged = page.getByTestId('batch-transfer-known-contract');
    await expect(merged).toBeVisible({ timeout: 20_000 });
    // 只出现一块：通用合约警告不与合并块并存。
    await expect(page.getByTestId('batch-transfer-contract-warning')).toHaveCount(0);
    // 标题点明两种行数。
    await expect(merged).toContainText('有 1 行是协议合约、1 行是其它合约地址，智能资产保护已拦截');
    // 逐行列出：已知合约带地址簿名字，任意合约只点名「是合约」。
    await expect(page.getByTestId('batch-transfer-known-line-1')).toHaveText(
      '第 1 行：这是「交易对」合约地址',
    );
    await expect(page.getByTestId('batch-transfer-contract-line-2')).toHaveText(
      '第 2 行：这是一个合约地址',
    );
    // CTA 禁用原因只写一条。
    await expect(merged).toContainText('要强制转账，请先关闭「智能资产保护」。');
    await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();
  });

  test('用例 D 合计超余额：ERC20 差 1，原生币差 0.501', async ({ page }) => {
    // D1：0 TestLOVE20 的钱包输入 1。
    await openBatch(page, OUTSIDER);
    await useTokenMode(page);
    await expect(page.getByTestId('batch-transfer-balance')).toHaveText(`${SYMBOL} 余额 0`, {
      timeout: 20_000,
    });
    await fillBatch(page, [`${R2} 1`]);
    await expect(page.getByTestId('batch-transfer-insufficient')).toHaveText(
      `${SYMBOL} 不够，还差 1`,
    );
    await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();

    // D2：原生币 10,000 − 0.001 预留，4 行 × 2500.125 = 10,000.5。
    await openBatch(page, NATIVE_SENDER);
    await expect(page.getByTestId('batch-transfer-balance')).toHaveText(`${NATIVE} 余额 10,000`, {
      timeout: 20_000,
    });
    await fillBatch(page, [`${R5} 2500.125`, `${R7} 2500.125`, `${R8} 2500.125`, `${R9} 2500.125`]);
    await expect(page.getByTestId('batch-transfer-total')).toHaveText(`合计 10,000.5 ${NATIVE}`);
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
    await expect(page.getByTestId('batch-transfer-balance')).toHaveText(`${NATIVE} 余额 10,000`, {
      timeout: 20_000,
    });

    // 第 4 行与第 1 行同地址：不再静默合并，标出「与第 1 行重复」并阻止提交。
    await fillBatch(page, [
      `${R5} 0.1`,
      `${R7}, 0.2`,
      `${R8} 0.15`,
      `${R5} 0.05`,
      `${R9} 0.000001`,
    ]);
    await expect(page.getByTestId('batch-transfer-summary')).toHaveText('5 行，4 个收款方');
    await expect(page.getByTestId('batch-transfer-total')).toHaveText(`合计 0.450001 ${NATIVE}`);
    await expect(page.getByTestId('batch-transfer-duplicate-4')).toHaveText(
      '第 4 行：与第 1 行重复，这一行先不计入，请删掉其中一行。',
    );
    await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();

    // 提交前预余额（理论线 §0 快照）：重复行不是收款方，只有 4 行。
    for (const index of [0, 1, 2, 3]) {
      await expect(page.getByTestId(`batch-transfer-row-balance-${index}`)).toHaveText('10,000', {
        timeout: 20_000,
      });
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

    await page.getByRole('button', { name: '好的' }).click();
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

  test('用例 B ERC20 批量 + approve：0 → 授权 2（输入 2.000002）→ 3 行到账', async ({ page }) => {
    await openBatch(page, ERC20_SENDER);
    await useTokenMode(page);
    await expect(page.getByTestId('batch-transfer-balance')).toHaveText(
      `${SYMBOL} 余额 99,799,100`,
      { timeout: 20_000 },
    );

    await fillBatch(page, [`${R5} 1.5`, `${R2} 0.5`, `${R7} 0.000002`]);
    // owner 2026-11-19 数字显示规范：2.000002 属 1–999 量级 → 4 位小数截断后是「2」。
    await expect(page.getByTestId('batch-transfer-total')).toHaveText(`合计 2 ${SYMBOL}`);
    await expect(page.getByTestId('batch-transfer-allowance')).toHaveText(
      `已允许批量转账合约使用 0 / 本次需要 2 ${SYMBOL}`,
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
      `已允许批量转账合约使用 2 / 本次需要 2 ${SYMBOL}`,
      { timeout: 20_000 },
    );
    await submit.click();

    await expect(page.getByTestId('batch-transfer-receipt-total')).toHaveText(`2 ${SYMBOL}`, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('batch-transfer-receipt-delta-0')).toHaveText('+1.5');
    await expect(page.getByTestId('batch-transfer-receipt-delta-1')).toHaveText('+0.5');
    await expect(page.getByTestId('batch-transfer-receipt-delta-2')).toHaveText('+0.000002');
    // 额度恰好用完时回执不提示残留授权。
    await expect(page.getByTestId('batch-transfer-receipt-residual-allowance')).toHaveCount(0);

    await page.getByRole('button', { name: '好的' }).click();
    // 余额 99,799,097.999998 属 ≥1e6 量级 → 显示 0 位小数（owner 2026-11-19 数字规范）。
    await expect(page.getByTestId('batch-transfer-balance')).toHaveText(
      `${SYMBOL} 余额 99,799,097`,
      { timeout: 20_000 },
    );
  });

  // D3：非零但低于 6 位精度的小额，按新显示规则给有效位（owner 2026-11-19：
  // formatTokenAmount 对极小非零金额显示到第一位有效数字 + 2 位，最多 12 位；
  // 只有小到 12 位仍显示不出才退化成 `< 最小可见单位`），不能写成 0。
  test('用例 H 极小金额：合计 / 行金额 / 回执差额按有效位显示（不塌成 0）', async ({ page }) => {
    await openBatch(page, NATIVE_SENDER);
    // 本用例在 A 之后运行，发送方余额已被 A 扣减；只要求余额读到了真实值。
    await expect(page.getByTestId('batch-transfer-balance')).toContainText('余额', {
      timeout: 20_000,
    });

    await fillBatch(page, [
      '0x0000000000000000000000000000000000002001 0.0000001',
      '0x0000000000000000000000000000000000002002 0.0000002',
    ]);
    await expect(page.getByTestId('batch-transfer-total')).toHaveText(`合计 0.0000003 ${NATIVE}`);
    await expect(page.getByTestId('batch-transfer-row-amount-0')).toHaveText(`0.0000001 ${NATIVE}`);
    // 先等预余额读完成，否则回执是「核对不完整」而不是逐行 matched。
    await expect(page.getByTestId('batch-transfer-row-balance-0')).toHaveText('0', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();

    await page.getByTestId('batch-transfer-submit').click();
    await expect(page.getByTestId('batch-transfer-receipt-total')).toHaveText(
      `0.0000003 ${NATIVE}`,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('batch-transfer-receipt-delta-0')).toHaveText('+0.0000001');
    await expect(page.getByTestId('batch-transfer-receipt-delta-1')).toHaveText('+0.0000002');
    await expect(page.getByTestId('batch-transfer-receipt-atomic')).toHaveText(
      '整批一起执行：上表每一行都已到账。',
    );
  });

  // D4：千分位金额不再被逗号切碎成「这一行看不懂」。
  test('用例 I 千分位金额：接受并按数值解析', async ({ page }) => {
    await openBatch(page, NATIVE_SENDER);
    await fillBatch(page, [`${R5} 1,000`, `${R7} 2,500.5`]);

    await expect(page.getByTestId('batch-transfer-line-errors')).toHaveCount(0);
    await expect(page.getByTestId('batch-transfer-total')).toHaveText(`合计 3,500.5 ${NATIVE}`);
    await expect(page.getByTestId('batch-transfer-row-amount-0')).toHaveText(`1,000 ${NATIVE}`);
    await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();
  });

  // D5：19 位小数被截断为 0 时说明原因，不只是「金额必须大于 0」。
  test('用例 J 精度截断为 0：提示按精度截断', async ({ page }) => {
    await openBatch(page, NATIVE_SENDER);
    await fillBatch(page, [`${R5} 0.0000000000000000009`]);

    await expect(page.getByTestId('batch-transfer-line-error-1')).toHaveText(
      '第 1 行：小数位超过精度，按精度截断后为 0。',
    );
    await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();
  });

  // D7：先按合计授权、再改小清单提交，回执必须提示链上残留的授权额度。
  test('用例 K 残留授权：授权 2（输入 2.000002）后改小清单，回执提示剩余授权', async ({ page }) => {
    await openBatch(page, ERC20_SENDER);
    await useTokenMode(page);
    await expect(page.getByTestId('batch-transfer-balance')).toContainText('余额', {
      timeout: 20_000,
    });

    const submit = page.getByTestId('batch-transfer-submit');
    await fillBatch(page, [`${R5} 1.5`, `${R2} 0.5`, `${R7} 0.000002`]);
    await expect(page.getByTestId('batch-transfer-allowance')).toHaveText(
      `已允许批量转账合约使用 0 / 本次需要 2 ${SYMBOL}`,
      { timeout: 20_000 },
    );
    await submit.click();
    await expect(submit).toHaveText('批量转账', { timeout: 30_000 });
    await expect(page.getByTestId('batch-transfer-allowance')).toHaveText(
      `已允许批量转账合约使用 2 / 本次需要 2 ${SYMBOL}`,
      { timeout: 20_000 },
    );

    // 删掉第三行：合计 2，链上仍留着 0.000002 的授权。
    await fillBatch(page, [`${R5} 1.5`, `${R2} 0.5`]);
    await expect(page.getByTestId('batch-transfer-total')).toHaveText(`合计 2 ${SYMBOL}`);
    await submit.click();

    await expect(page.getByTestId('batch-transfer-receipt-total')).toHaveText(`2 ${SYMBOL}`, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('batch-transfer-receipt-residual-allowance')).toHaveText(
      `还留着 0.000002 ${SYMBOL} 的授权，可到「代币授权」页撤销。`,
    );
  });

  // D11：已注入钱包但链不对时，首屏就是「网络不对」，而不是「连接钱包」。
  test('用例 L 错误网络首屏：已注入其它链的钱包不再显示「连接钱包」', async ({ page }) => {
    await installWallet(page, NATIVE_SENDER, '0x1');
    await page.goto(`/batch-transfer${QUERY}`);

    await expect(page.getByTestId('batch-transfer-input')).toHaveCount(0);
    await expect(page.getByText('网络不对。', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText('切换到这个应用使用的网络后再批量转账。', { exact: true }),
    ).toBeVisible();
    // 全局头部同时给切换入口，页面不再出现未连接卡。
    await expect(page.getByRole('button', { name: '网络不对，点此切换' })).toBeVisible();
    // review 2026-11-22（P2-9）：错网络时也要能看出「我在哪个社区」。
    await expect(page.getByTestId('header-community-context')).toHaveText('TestLOVE20');
    await expect(page.getByText('连接钱包后批量转账。', { exact: true })).toHaveCount(0);
  });

  // D1：提交前与到账后余额都读不到时，回执不得断言「上表每一行都已到账」。
  test('用例 M 余额读失败：回执落「到账核对不完整」，— 不当 0（D1）', async ({ page }) => {
    await installWallet(page, NATIVE_SENDER);
    // 只让 nativeBalances(0x93bdc1ab) 的读失败，目录/发送方余额等无关读保持健康。
    await failReadsWithSelector(page, '0x93bdc1ab');
    await page.goto(`/batch-transfer${QUERY}`);
    await connect(page);
    await fillBatch(page, [`${R5} 0.01`, `${R7} 0.02`]);

    // 预余额读失败：行余额是 —（不是 0）+ 表下说明；恢复入口就是表头那个常驻「刷新」
    // （owner 2026-11-17：读失败不再另起一个并列的「重新读取」按钮）。主按钮仍可提交。
    await expect(page.getByTestId('batch-transfer-rows-error')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('batch-transfer-rows-refresh')).toBeEnabled();
    await expect(page.getByTestId('batch-transfer-rows-retry')).toHaveCount(0);
    await expect(page.getByTestId('batch-transfer-row-balance-0')).toHaveText('—');
    await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();

    await page.getByTestId('batch-transfer-submit').click();

    const conclusion = page.getByTestId('batch-transfer-receipt-atomic');
    await expect(conclusion).toHaveAttribute('data-status', 'unverified', { timeout: 30_000 });
    await expect(conclusion).toHaveText(
      '到账核对不完整：有 2 行余额读取失败，未能核对，请到区块浏览器确认交易结果。',
    );
    await expect(conclusion).not.toHaveText('整批一起执行：上表每一行都已到账。');
    await expect(page.getByTestId('batch-transfer-receipt-delta-0')).toHaveText('—');
    await page.getByRole('button', { name: '好的' }).click();
  });

  // D2/D6：额度读失败只给单一「读不到」结论 + 重试；不出现「额度已足够」。
  test('用例 N 额度读失败：单一未知态 + 重新读取自愈（D2/D6）', async ({ page }) => {
    await installWallet(page, ERC20_SENDER);
    // 只让 allowance(0xdd62ed3e) 的读失败。
    const restore = await failReadsWithSelector(page, '0xdd62ed3e');
    await page.goto(`/batch-transfer${QUERY}`);
    await connect(page);
    await useTokenMode(page);
    await fillBatch(page, [`${R5} 0.25`]);

    const allowanceLine = page.getByTestId('batch-transfer-allowance');
    await expect(allowanceLine).toHaveText('批量转账额度暂时读不到', { timeout: 30_000 });
    const state = page.getByTestId('batch-transfer-allowance-state');
    await expect(state).toHaveAttribute('data-state', 'unknown');
    await expect(state).toHaveText('额度暂时读不到，无法判断是否需要授权，请重试读取。');
    await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();
    await expect(page.getByText('额度已足够，不需要再次授权。')).toHaveCount(0);

    // 解除注入后点「重新读取」应自愈，不需要刷新整页。
    // 不断言具体额度（前面用例可能留下残留授权），只要求回到「读到真实额度」的态。
    await restore();
    await page.getByTestId('batch-transfer-allowance-retry').click();
    await expect(allowanceLine).toContainText(`本次需要 0.25 ${SYMBOL}`, {
      timeout: 30_000,
    });
    await expect(allowanceLine).not.toHaveText('批量转账额度暂时读不到');
    await expect(page.getByTestId('batch-transfer-allowance-state')).toHaveAttribute(
      'data-state',
      'need',
    );
    await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();
  });

  // D6（owner 2026-11-17 改版）：预余额读失败的恢复入口就是表头那个常驻「刷新」，
  // 表下只留说明文字 —— 不再并列第二个做同一件事的按钮。
  test('用例 O 预余额读失败：常驻刷新就是恢复入口（D6）', async ({ page }) => {
    await installWallet(page, NATIVE_SENDER);
    // 只让 nativeBalances(0x93bdc1ab) 的读失败。
    const restore = await failReadsWithSelector(page, '0x93bdc1ab');
    await page.goto(`/batch-transfer${QUERY}`);
    await connect(page);
    await fillBatch(page, [`${R9} 0.01`]);

    const refresh = page.getByTestId('batch-transfer-rows-refresh');
    await expect(page.getByTestId('batch-transfer-rows-error')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('batch-transfer-row-balance-0')).toHaveText('—');
    await expect(refresh).toBeEnabled();
    await expect(page.getByTestId('batch-transfer-rows-retry')).toHaveCount(0);

    // 解除注入后点同一个按钮自愈，不需要刷新整页。
    await restore();
    await refresh.click();
    await expect(page.getByTestId('batch-transfer-row-balance-0')).not.toHaveText('—', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('batch-transfer-rows-error')).toHaveCount(0);
  });

  // owner 2026-11-17：刷新后的读数就是提交时的转账前基线 —— 提交前有外部转入时，
  // 刷新后的数字才是回执逐行差额的对比基准（没刷新会用旧基线，差额会被带偏成异常）。
  test('用例 P 基线：刷新后的余额就是回执的「到账前」', async ({ page }) => {
    // 两个全新地址：批处理开始前余额都是 0。
    const RECEIVER = '0x0000000000000000000000000000000000003001';
    const OTHER = '0x0000000000000000000000000000000000003002';
    await openBatch(page, NATIVE_SENDER);
    await fillBatch(page, [`${RECEIVER} 0.5`, `${OTHER} 0.1`]);

    // 预余额读完成：两个地址都是 0，主按钮可提交。
    await expect(page.getByTestId('batch-transfer-row-balance-0')).toHaveText('0', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('batch-transfer-row-balance-1')).toHaveText('0');
    await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();

    // 别的账户在提交前给第 1 个收款方转 1 ETH：页面上的旧读数因此过时。
    await anvilRpc('eth_sendTransaction', [{ from: R2, to: RECEIVER, value: '0xde0b6b3a7640000' }]);
    await anvilRpc('anvil_mine', [1]);
    await expect
      .poll(async () => anvilRpc<string>('eth_getBalance', [RECEIVER, 'latest']))
      .toBe('0xde0b6b3a7640000');

    // 刷新中：按钮 busy、主按钮禁用，旧数字（0）不闪回「—」。
    const refresh = page.getByTestId('batch-transfer-rows-refresh');
    const hold = await holdReadsWithSelector(page, '0x93bdc1ab');
    await refresh.click();
    await expect(refresh).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();
    await expect(page.getByTestId('batch-transfer-row-balance-0')).toHaveText('0');
    await hold.release();

    // 刷新落地：第 1 行 0 → 1，第 2 行仍是 0；主按钮恢复可提交。
    await expect(page.getByTestId('batch-transfer-row-balance-0')).toHaveText('1', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('batch-transfer-row-balance-1')).toHaveText('0');
    await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();

    await page.getByTestId('batch-transfer-submit').click();

    // 回执的「到账前」= 刷新后的 1（不是提交前的旧 0）；差额仍精确等于承诺金额。
    await expect(page.getByTestId('batch-transfer-receipt-total')).toHaveText(`0.6 ${NATIVE}`, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('batch-transfer-receipt-row-0')).toContainText('1 → 1.5');
    await expect(page.getByTestId('batch-transfer-receipt-delta-0')).toHaveText('+0.5');
    await expect(page.getByTestId('batch-transfer-receipt-row-1')).toContainText('0 → 0.1');
    await expect(page.getByTestId('batch-transfer-receipt-delta-1')).toHaveText('+0.1');
    await expect(page.getByTestId('batch-transfer-receipt-atomic')).toHaveText(
      '整批一起执行：上表每一行都已到账。',
    );
    await page.getByRole('button', { name: '好的' }).click();
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
      // Every screenshot starts from the shipped default (智能资产保护 开启), so a
      // previous test that turned it off cannot leak into the next shot.
      window.localStorage.setItem('love20:transfer:assetProtectionEnabled', '1');
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

  test('资产保护合并提示截图（已知合约 + 任意合约，单块）', async ({ page }) => {
    await installWallet(page, NATIVE_SENDER);
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, theme, viewport.width, viewport.height);
        await fillBatch(page, [`${PAIR} 0.1`, `${TOKEN} 0.2`]);
        const merged = page.getByTestId('batch-transfer-known-contract');
        await expect(merged).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId('batch-transfer-contract-warning')).toHaveCount(0);
        await expect(page.getByTestId('batch-transfer-submit')).toBeDisabled();
        await merged.scrollIntoViewIfNeeded();
        await shoot(page, `protection-merged-${theme}-${viewport.key}`);
      }
    }
  });

  test('资产保护关闭截图（不再检测已知合约，只剩通用合约警告）', async ({ page }) => {
    await installWallet(page, NATIVE_SENDER);
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, theme, viewport.width, viewport.height);
        await fillBatch(page, [`${PAIR} 0.1`, `${TOKEN} 0.2`]);
        await page.getByTestId('asset-protection-toggle').click();
        await expect(page.getByTestId('batch-transfer-contract-warning')).toBeVisible({
          timeout: 20_000,
        });
        await expect(page.getByTestId('batch-transfer-known-contract')).toHaveCount(0);
        await expect(page.getByTestId('batch-transfer-submit')).toBeEnabled();
        await page.getByTestId('batch-transfer-contract-warning').scrollIntoViewIfNeeded();
        await shoot(page, `protection-off-${theme}-${viewport.key}`);
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
