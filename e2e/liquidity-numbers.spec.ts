import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { anvilRpc, isolateChain, revertChain, snapshotChain } from './chain';
import { ACCOUNTS, connect, installWallet } from './wallet-stub';

/**
 * 应用·流动性池 前端线（三线校验 §3）:
 * `docs/product/three-line/liquidity.md` §1 的理论值必须逐字出现在页面上。
 *
 * Owner 2026-11-14 的交互重做也在这里验收：
 * - 添加区是「智能模式」开关（默认开）：开 = 只填一侧或两侧都填、Hub 自动配平；
 *   关 = 改一侧按池子比例自动填另一侧（只读联动），走 Router。
 * - 输入后只显示「预计获得 X 流动性凭证」，swap 段 / 实进池 / 至少获得的流动性凭证收在默认
 *   折叠的「详情」里；「已为网络手续费预留」只在点过「全部」原生币后出现。
 * - 撤出按 **LP 数量** 输入，25/50/75/100% 只是快捷填充；只显示「预计收到约 X + Y」。
 * - 社区流动性查询按旧库 TKM 的四块布局：选择交易对（社区代币下拉 + WETH 只读 + LP
 *   代币地址）→ 交易对统计（LP 总量 / 两侧总量 / 价格 + 方向切换）→ 查询地址（默认
 *   当前钱包、三态按钮、重置、未连接提示）→ 查询结果（任意地址的 LP 数量 / 份额 /
 *   可兑换两币数量；纯 view，未连接钱包也能查）。
 *
 * 断言只读页面文字；链上夹具只依赖 clean bootstrap 的固定初始状态。每个用例自己
 * 取一次 anvil 快照、结束时回滚，所以用例之间互不影响（追加流动性会改储备，不能
 * 靠「账户不重叠」隔离）。用例 E 在快照内用 dex 的 WETH9Configurable 部署一个
 * 没有 pair 的测试代币，用来验证「首次建池」与查询页的「未找到流动性池」。
 *
 * 本 spec 末尾同时产出 390×844 / 1280×800 × 浅色/深色 的验收截图。
 */

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');
const SYMBOL = 'TestLOVE20';
const QUERY = `?symbol=${SYMBOL}`;
const TEST_X = 'TestX';

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/network/anvil31337_dev/network.json'), 'utf8'),
) as {
  addresses: {
    tokenAddress: `0x${string}`;
    launch: `0x${string}`;
    mint: `0x${string}`;
    stake: `0x${string}`;
    pair: `0x${string}`;
  };
};

/**
 * 初始状态里唯一持有 LP 的地址（质押合约持 totalSupply − 1000，1000 永久锁在
 * pair 地址）。用它当「任意地址查询」的确定性样本：读数 = 池子初始储备按份额折算。
 */
const STAKE = deployment.addresses.stake;

const RPC_URL = process.env.E2E_ANVIL_RPC ?? 'http://127.0.0.1:8555';
/** launchToken takes a 6-byte uppercase symbol; the dev chain prefixes `Test`. */
const CHILD_INPUT_SYMBOL = 'CMTOK1';
const CHILD_SYMBOL = 'TestCMTOK1';

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

/**
 * QA D5 需要在**不刷新页面**的前提下切到另一个社区：菜单只认 Launch 里存在的
 * symbol，所以照 community-switch.spec 的做法在快照里 launch 一个子社区。
 */
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

function ensureChildCommunity(): void {
  const existing = addressOf(
    deployment.addresses.launch,
    'tokenAddressBySymbol(string)(address)',
    CHILD_SYMBOL,
  );
  if (existing !== '0x0000000000000000000000000000000000000000') return;
  cast(['rpc', 'anvil_impersonateAccount', deployment.addresses.mint]);
  cast(['rpc', 'anvil_setBalance', deployment.addresses.mint, '0xde0b6b3a7640000']);
  castSend(
    deployment.addresses.launch,
    'addLaunchCount(address,uint256,uint256)',
    [deployment.addresses.tokenAddress, '1', '1'],
    deployment.addresses.mint,
  );
  castSend(
    deployment.addresses.launch,
    'launchToken(string,address,uint256,address,uint8,bytes[])',
    [CHILD_INPUT_SYMBOL, deployment.addresses.tokenAddress, '1', ACCOUNTS.withIdentity, '0', '[]'],
  );
  const child = addressOf(
    deployment.addresses.launch,
    'tokenAddressBySymbol(string)(address)',
    CHILD_SYMBOL,
  );
  if (child === '0x0000000000000000000000000000000000000000') {
    throw new Error('launchToken did not register the child community symbol');
  }
}

test.beforeAll(() => {
  ensureChildCommunity();
});

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

/**
 * 兄弟仓产物路径。正常 checkout 里兄弟仓就在仓库上一级；在 git worktree（例如
 * `.agents/worktrees/<name>`）里，兄弟仓仍然挨着**主 checkout**，所以用
 * `git rev-parse --git-common-dir` 回退到主 checkout 再拼。2026-11-17 在 worktree
 * 里跑全量 e2e 时，这里曾把 `../dex/out` 解析成 `.agents/worktrees/dex/out` 而
 * ENOENT（只影响本用例，不影响产品）。
 */
function siblingRepoPath(...segments: readonly string[]): string {
  const direct = resolve(process.cwd(), '..', ...segments);
  if (existsSync(direct)) return direct;
  // commonDir 在 worktree 里是绝对路径（例如 /repo/main-checkout/.git），它的上一级
  // 就是主 checkout；兄弟仓在主 checkout 的上一级。
  const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    encoding: 'utf8',
  }).trim();
  const mainRoot = resolve(process.cwd(), commonDir, '..');
  return resolve(mainRoot, '..', ...segments);
}

async function deployTestToken(): Promise<string> {
  const artifact = JSON.parse(
    readFileSync(
      siblingRepoPath('dex', 'out', 'WETH9Configurable.sol', 'WETH9Configurable.json'),
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

/** 「换个代币地址」→ 输入地址 → 读取；等当前代币行换成该 symbol。 */
async function selectCustomToken(page: Page, address: string, symbol: string): Promise<void> {
  await page.getByTestId('liquidity-custom-toggle').click();
  await page.getByTestId('liquidity-custom-address').fill(address);
  await page.getByTestId('liquidity-custom-add').click();
  await expect(page.getByTestId('liquidity-token')).toContainText(symbol, { timeout: 20_000 });
}

async function addQuote(page: Page, tokenAmount: string): Promise<void> {
  await page.getByTestId('liquidity-token-amount').fill(tokenAmount);
  await expect(page.getByTestId('liquidity-quote-liquidity')).toBeVisible({ timeout: 20_000 });
}

/** 「详情」默认收起（owner 2026-11-14）：过程量只有点开才出现。 */
async function openDetails(page: Page): Promise<void> {
  const toggle = page.getByTestId('liquidity-details-toggle');
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  await toggle.click();
  await expect(page.getByTestId('liquidity-details')).toBeVisible();
}

/**
 * 授权 → 等额度刷新 → 主按钮。
 * Owner 2026-11-14: the 授权 button is always rendered in flow (prerequisite
 * first); it is enabled only while the allowance is short. Click it only in
 * that state, then wait for the primary button to unlock.
 */
async function approveThenSubmit(
  page: Page,
  approveTestId: string,
  submitTestId: string,
): Promise<void> {
  const approveButton = page.getByTestId(approveTestId);
  await expect(approveButton).toBeVisible({ timeout: 20_000 });
  if (await approveButton.isEnabled()) {
    await approveButton.click();
  }
  await expect(page.getByTestId(submitTestId)).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId(submitTestId).click();
}

test.describe('流动性池 前端线（理论线 §1）', () => {
  test(
    '用例 A + C：智能模式单边报价逐字一致，我的份额 18.32%，按 LP 数量撤出 100%',
    withChainSnapshot(async (page) => {
      await openLiquidity(page, TOKEN_HOLDER_4);
      await expect(page.getByTestId('liquidity-token')).toContainText(SYMBOL, { timeout: 20_000 });
      await expect(page.getByTestId('liquidity-balance-token')).toContainText(
        `${SYMBOL} 余额 99,999,099`,
        { timeout: 20_000 },
      );
      // 智能模式默认开。
      await expect(page.getByTestId('liquidity-smart-mode')).toHaveAttribute(
        'aria-checked',
        'true',
      );

      // 旧库 LOVE20TKM 加池抬头：底池总LP / 我的LP（还没有 LP 时是 0）。
      await expect(page.getByTestId('liquidity-pool-total-supply')).toHaveText('4,472.13', {
        timeout: 20_000,
      });
      await expect(page.getByTestId('liquidity-pool-my-lp')).toHaveText('0');
      await expect(page.getByTestId('liquidity-go-withdraw')).toHaveCount(0);
      // 旧库「当前池价格」默认 1 社区代币 = X 原生币，箭头切换方向。
      await expect(page.getByTestId('liquidity-price-current')).toHaveText(
        '1 TestLOVE20 = 0.0005 ETH',
        { timeout: 20_000 },
      );
      await page.getByTestId('liquidity-price-toggle').click();
      await expect(page.getByTestId('liquidity-price-current')).toHaveText(
        '1 ETH = 2,000 TestLOVE20',
      );
      await page.getByTestId('liquidity-price-toggle').click();

      await addQuote(page, '100000');
      // Hub 会先换掉 45,016.508348 TestLOVE20（≥1e6 → 显示 45,016.5）：加池后 1 ETH 从 2,000 涨到 3,000，
      // 所以默认方向（1 社区代币 = X ETH）的涨跌幅是 -33.33%。
      await expect(page.getByTestId('liquidity-price-after')).toHaveText(
        '1 TestLOVE20 = 0.000333 ETH',
        { timeout: 20_000 },
      );
      await expect(page.getByTestId('liquidity-price-change')).toHaveText('（-33.33%）');
      // §1.2 用例 A：过程量默认收起，点开「详情」才出现。
      await expect(page.getByTestId('liquidity-details')).toHaveCount(0);
      await expect(page.getByTestId('liquidity-quote-liquidity')).toHaveText(
        '预计获得 1,003.57 流动性凭证',
        { timeout: 20_000 },
      );
      await openDetails(page);
      await expect(page.getByTestId('liquidity-quote-swap')).toHaveText(
        '其中 45,016.5 TestLOVE20 会先换成 18.3278 ETH。',
      );
      await expect(page.getByTestId('liquidity-quote-prepared')).toHaveText(
        '实际进池 54,983.49 TestLOVE20 + 18.3278 ETH',
      );
      await expect(page.getByTestId('liquidity-quote-min')).toHaveText(
        '至少获得 998.562 流动性凭证',
      );

      await approveThenSubmit(page, 'liquidity-add-approve', 'liquidity-add-submit');
      await expect(page.getByTestId('liquidity-receipt-title')).toHaveText('流动性添加完成', {
        timeout: 30_000,
      });
      const hash = (await page.getByTestId('liquidity-receipt-hash').innerText()).trim();
      expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      await page.getByRole('button', { name: '好的' }).click();

      // 用例 C 的初始状态：我的 LP 与份额。
      await page.getByTestId('liquidity-tab-mine').click();
      await expect(page.getByTestId('liquidity-my-lp')).toHaveText('1,003.57', {
        timeout: 20_000,
      });
      await expect(page.getByTestId('liquidity-my-share')).toHaveText('18.32%');
      // 撤出输入的是 LP 数量：100% 按钮只是把它填满，页面只显示「预计收到约」。
      await expect(page.getByTestId('liquidity-withdraw-receive')).toHaveCount(0);
      await page.getByTestId('liquidity-withdraw-percent-100').click();
      // 输入框只回填 6 位小数（可读），但交易用的是完整 18 位 LP：
      // 下面「预计收到约 54,983.49」就是完整精度算出来的（输入框仍只回填 6 位），截断会少 0.000031。
      await expect(page.getByTestId('liquidity-withdraw-lp')).toHaveValue('1003.579928');
      await expect(page.getByTestId('liquidity-withdraw-receive')).toHaveText(
        '预计收到约 54,983.49 TestLOVE20 + 18.3278 ETH',
      );
      // 用户仍然可以手输更多小数位。
      await page.getByTestId('liquidity-withdraw-lp').fill('1003.579928576458381352');
      await expect(page.getByTestId('liquidity-withdraw-receive')).toHaveText(
        '预计收到约 54,983.49 TestLOVE20 + 18.3278 ETH',
      );
      await page.getByTestId('liquidity-withdraw-percent-100').click();

      // 撤出 100%：先允许，再确认。
      await approveThenSubmit(page, 'liquidity-withdraw-approve', 'liquidity-withdraw-submit');
      await expect(page.getByTestId('liquidity-receipt-detail')).toHaveText(
        '已撤出 54,983.49 TestLOVE20 + 18.3278 ETH',
        { timeout: 30_000 },
      );
      await page.getByRole('button', { name: '好的' }).click();
      await expect(page.getByText('你还没有这个池子的流动性。')).toBeVisible({ timeout: 20_000 });
    }),
  );

  test(
    '用例 B：智能模式单边 10 ETH，报价与我的份额 4.64% 逐字一致',
    withChainSnapshot(async (page) => {
      await openLiquidity(page, NATIVE_ONLY);
      await expect(page.getByTestId('liquidity-token')).toContainText(SYMBOL, { timeout: 20_000 });

      await page.getByTestId('liquidity-native-amount').fill('10');
      await expect(page.getByTestId('liquidity-quote-liquidity')).toHaveText(
        '预计获得 217.9519 流动性凭证',
        { timeout: 20_000 },
      );
      await openDetails(page);
      await expect(page.getByTestId('liquidity-quote-swap')).toHaveText(
        '其中 4.8882 ETH 会先换成 9,294.15 TestLOVE20。',
      );
      await expect(page.getByTestId('liquidity-quote-prepared')).toHaveText(
        '实际进池 9,294.15 TestLOVE20 + 5.1117 ETH',
      );
      await expect(page.getByTestId('liquidity-quote-min')).toHaveText(
        '至少获得 216.8621 流动性凭证',
      );

      // 旧库的 25% / 50% / 最高 快捷按钮：原生币按「余额 − 手续费预留」算。
      await page.getByTestId('liquidity-native-percent-25').click();
      await expect(page.getByTestId('liquidity-native-amount')).toHaveValue('2499.99975');
      await expect(page.getByTestId('liquidity-native-gas-note')).toHaveCount(0);
      await page.getByTestId('liquidity-native-amount').fill('10');
      await expect(page.getByTestId('liquidity-price-after')).toBeVisible({ timeout: 20_000 });

      // 「已为网络手续费预留」只在点过「最高」原生币之后出现。
      await expect(page.getByTestId('liquidity-native-gas-note')).toHaveCount(0);
      await page.getByTestId('liquidity-native-max').click();
      await expect(page.getByTestId('liquidity-native-gas-note')).toHaveText(
        '已为网络手续费预留约 0.001 ETH。',
      );
      await page.getByTestId('liquidity-native-amount').fill('10');
      await expect(page.getByTestId('liquidity-native-gas-note')).toHaveCount(0);

      // 原生币单边不需要授权，直接确认添加。
      await page.getByTestId('liquidity-add-submit').click();
      await expect(page.getByTestId('liquidity-receipt-title')).toHaveText('流动性添加完成', {
        timeout: 30_000,
      });
      await page.getByRole('button', { name: '好的' }).click();

      await page.getByTestId('liquidity-tab-mine').click();
      await expect(page.getByTestId('liquidity-my-lp')).toHaveText('217.9519', {
        timeout: 20_000,
      });
      await expect(page.getByTestId('liquidity-my-share')).toHaveText('4.64%');
    }),
  );

  test(
    '用例 D：关掉智能模式，改一侧自动按池子比例填另一侧（只读）',
    withChainSnapshot(async (page) => {
      await openLiquidity(page, TOKEN_HOLDER);
      await expect(page.getByTestId('liquidity-token')).toContainText(SYMBOL, { timeout: 20_000 });

      const smart = page.getByTestId('liquidity-smart-mode');
      await smart.click();
      await expect(smart).toHaveAttribute('aria-checked', 'false');
      // 等池子储备读回来（有比例可依时才出现这句联动说明），否则页面还停在「空池」
      // 文案上，后面的自动填充也不会发生。
      await expect(
        page.getByText('填哪一侧，另一侧就按池子比例自动填好，不用自己算。'),
      ).toBeVisible({ timeout: 20_000 });

      // 只填社区代币 1000：原生币侧自动填 0.5 并变只读。
      await page.getByTestId('liquidity-token-amount').fill('1000');
      await expect(page.getByTestId('liquidity-native-amount')).toHaveValue('0.5');
      await expect(page.getByTestId('liquidity-native-amount')).toHaveAttribute('readonly', '');

      await openDetails(page);
      await expect(page.getByTestId('liquidity-quote-prepared')).toHaveText(
        '实际进池 1,000 TestLOVE20 + 0.5 ETH',
        { timeout: 20_000 },
      );
      await expect(page.getByTestId('liquidity-quote-liquidity')).toHaveText(
        '预计获得 22.3606 流动性凭证',
      );
      await expect(page.getByTestId('liquidity-quote-min')).toHaveText(
        '最少进池 995 TestLOVE20 + 0.4975 ETH',
      );

      // 反方向也成立：点一下原生币框就把输入侧切过去，改成 0.25 时社区代币侧自动变 500。
      await page.getByTestId('liquidity-native-amount').click();
      const nativeInput = page.getByTestId('liquidity-native-amount');
      const tokenInput = page.getByTestId('liquidity-token-amount');
      await expect(nativeInput).not.toHaveAttribute('readonly', '');
      await nativeInput.fill('0.25');
      await expect(tokenInput).toHaveValue('500');
      await expect(tokenInput).toHaveAttribute('readonly', '');
      // 再切回社区代币侧，恢复到用例 D 的 1000 + 0.5。
      await tokenInput.click();
      await expect(tokenInput).not.toHaveAttribute('readonly', '');
      await tokenInput.fill('1000');
      await expect(nativeInput).toHaveValue('0.5');

      await approveThenSubmit(page, 'liquidity-add-approve', 'liquidity-add-submit');
      await expect(page.getByTestId('liquidity-receipt-title')).toHaveText('流动性添加完成', {
        timeout: 30_000,
      });
      await page.getByRole('button', { name: '好的' }).click();

      await page.getByTestId('liquidity-tab-mine').click();
      await expect(page.getByTestId('liquidity-my-lp')).toHaveText('22.3606', {
        timeout: 20_000,
      });
    }),
  );

  test(
    '用例 E：空池提示 + 首次建池 sqrt(a·b) − 1000',
    withChainSnapshot(async (page) => {
      const testToken = await deployTestToken();
      await openLiquidity(page, FIRST_MINT);
      // 页内不再有社区代币下拉；自定义地址收在「换个代币地址」里。
      await page.getByTestId('liquidity-custom-toggle').click();
      await page.getByTestId('liquidity-custom-address').fill(testToken);
      await page.getByTestId('liquidity-custom-add').click();
      await expect(page.getByTestId('liquidity-token')).toContainText(TEST_X, { timeout: 20_000 });

      // 空池：查询页四块都在，卡 1 没有 LP 地址、卡 2 说交易对不存在、卡 4 说未找到池子。
      await page.getByTestId('liquidity-tab-query').click();
      await expect(page.getByTestId('liquidity-query-target')).toHaveText('TestWETH');
      await expect(page.getByTestId('liquidity-query-pair-missing')).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByTestId('liquidity-query-stats-empty')).toHaveText('交易对不存在');
      await expect(page.getByTestId('liquidity-query-empty')).toContainText('未找到流动性池');
      await expect(page.getByTestId('liquidity-query-empty')).toContainText(
        'TestX-TestWETH 交易对不存在',
      );

      await page.getByTestId('liquidity-tab-add').click();
      // 空池没有比例可依：智能模式开着也只能两侧都填（页面写明原因）。
      await expect(page.getByTestId('liquidity-fallback-note')).toContainText(
        '第一次建池只能两侧都填',
      );
      await page.getByTestId('liquidity-token-amount').fill('100');
      await page.getByTestId('liquidity-native-amount').fill('0.01');
      await expect(page.getByTestId('liquidity-quote-liquidity')).toHaveText(
        '预计获得 0.999999 流动性凭证',
        { timeout: 20_000 },
      );
      await openDetails(page);
      await expect(page.getByTestId('liquidity-quote-first-mint')).toHaveText(
        '第一次建池：1 ETH = 10,000 TestX',
      );

      await approveThenSubmit(page, 'liquidity-add-approve', 'liquidity-add-submit');
      await expect(page.getByTestId('liquidity-receipt-title')).toHaveText('流动性添加完成', {
        timeout: 30_000,
      });
      await page.getByRole('button', { name: '好的' }).click();

      // 建池后：卡 2 的 LP 总量 / 两侧总量 / 价格方向切换。
      await page.getByTestId('liquidity-tab-query').click();
      await expect(page.getByTestId('liquidity-query-supply')).toHaveText('1', {
        timeout: 20_000,
      });
      await expect(page.getByTestId('liquidity-query-total-token')).toHaveText('100');
      await expect(page.getByTestId('liquidity-query-total-target')).toHaveText('0.01');
      await expect(page.getByTestId('liquidity-query-price')).toHaveText(
        '1 TestWETH = 10,000 TestX',
      );
      await page.getByTestId('liquidity-query-price-toggle').click();
      await expect(page.getByTestId('liquidity-query-price')).toHaveText(
        '1 TestX = 0.0001 TestWETH',
      );
      await page.getByTestId('liquidity-query-price-toggle').click();
      // 卡 4：默认地址是当前钱包（#8 刚建池）→ LP 0.999999 / 99.99% / 两币折算。
      await expect(page.getByTestId('liquidity-query-lp')).toHaveText('0.999999');
      await expect(page.getByTestId('liquidity-query-share')).toHaveText('99.99%');
      await expect(page.getByTestId('liquidity-query-convertible-token')).toHaveText('99.9999');
      await expect(page.getByTestId('liquidity-query-convertible-target')).toHaveText('0.009999');
      // 交易对地址可点击复制（完整地址 + title 用于核对）。
      await expect(page.getByTestId('liquidity-query-pair')).toHaveAttribute(
        'title',
        /^0x[0-9a-fA-F]{40}$/,
      );
    }),
  );

  test(
    '边界：余额不足 / 输入 0 / 滑点非法 一律禁用主按钮',
    withChainSnapshot(async (page) => {
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
      // 弹层里和弹层后面的滑点区块会同时渲染同一条错误（QA D2 要求关闭弹层后错误仍在页面上），
      // 这里断言弹层内那一条；关掉弹层后再用 testid 断言页面里保留的那一条。
      await expect(
        page.getByRole('dialog').getByText(/自定义值需要在 0\.01% 到 50% 之间/),
      ).toBeVisible();
      await page.getByRole('button', { name: '完成' }).click();
      // QA D2：关掉设置弹层后错误仍要可见，并且授权与提交两个写操作都被挡住。
      await expect(page.getByTestId('liquidity-slippage-error')).toHaveText(
        '自定义值需要在 0.01% 到 50% 之间。（0.01%–50%）',
      );
      await expect(primary).toBeDisabled();
      await expect(approve).toBeDisabled();
    }),
  );
});

test.describe('流动性池 QA 缺陷回归（D1/D2/D4/D5/D6/D7/D8/D9/D10）', () => {
  test(
    '用例 G/H（P1/D1）：连续两笔加池 / 撤出——第二笔重新授权后可继续提交',
    withChainSnapshot(async (page) => {
      await openLiquidity(page, TOKEN_HOLDER_4);
      await expect(page.getByTestId('liquidity-token')).toContainText(SYMBOL, { timeout: 20_000 });

      // 第一笔加池。
      await addQuote(page, '100000');
      await approveThenSubmit(page, 'liquidity-add-approve', 'liquidity-add-submit');
      await expect(page.getByTestId('liquidity-receipt-title')).toHaveText('流动性添加完成', {
        timeout: 30_000,
      });
      await page.getByRole('button', { name: '好的' }).click();

      // 第二笔：上一笔把额度用光了，授权按钮重新可点；授权后主按钮必须解锁（旧 bug 永久禁用）。
      await expect(page.getByTestId('liquidity-add-approve')).toBeEnabled({ timeout: 20_000 });
      await approveThenSubmit(page, 'liquidity-add-approve', 'liquidity-add-submit');
      await expect(page.getByTestId('liquidity-receipt-title')).toHaveText('流动性添加完成', {
        timeout: 30_000,
      });
      await page.getByRole('button', { name: '好的' }).click();

      await page.getByTestId('liquidity-tab-mine').click();
      await expect(page.getByTestId('liquidity-withdraw-lp')).toBeVisible({ timeout: 20_000 });
      const lpBeforeWithdraw = (await page.getByTestId('liquidity-my-lp').innerText()).trim();

      // QA D2：撤出侧滑点非法时，错误在页面上可见，并挡住授权与提交。
      await page.getByTestId('liquidity-withdraw-percent-25').click();
      await page.getByTestId('liquidity-withdraw-slippage-custom').fill('60');
      await expect(page.getByTestId('liquidity-withdraw-slippage-error')).toHaveText(
        '自定义值需要在 0.01% 到 50% 之间。（0.01%–50%）',
      );
      await expect(page.getByTestId('liquidity-withdraw-approve')).toBeDisabled();
      await expect(page.getByTestId('liquidity-withdraw-submit')).toBeDisabled();
      await page.getByRole('button', { name: '0.5%' }).click();
      await expect(page.getByTestId('liquidity-withdraw-slippage-error')).toHaveCount(0);

      // QA D7：撤出输入 0 要有可见原因。
      await page.getByTestId('liquidity-withdraw-lp').fill('0');
      await expect(page.getByTestId('liquidity-withdraw-error-input')).toHaveText(
        '金额必须大于 0。',
      );

      // 第一笔撤出（50%）。
      await page.getByTestId('liquidity-withdraw-percent-50').click();
      await approveThenSubmit(page, 'liquidity-withdraw-approve', 'liquidity-withdraw-submit');
      await expect(page.getByTestId('liquidity-receipt-detail')).toContainText('已撤出', {
        timeout: 30_000,
      });
      await page.getByRole('button', { name: '好的' }).click();

      // 第二笔撤出：LP 额度同样被用光 → 再授权 → 能继续提交。先等「我的凭证」刷新，
      // 否则预设按钮会按旧余额填出超过持仓的数量。
      await expect(page.getByTestId('liquidity-my-lp')).not.toHaveText(lpBeforeWithdraw, {
        timeout: 20_000,
      });
      await page.getByTestId('liquidity-withdraw-percent-50').click();
      await expect(page.getByTestId('liquidity-withdraw-approve')).toBeEnabled({
        timeout: 20_000,
      });
      await approveThenSubmit(page, 'liquidity-withdraw-approve', 'liquidity-withdraw-submit');
      await expect(page.getByTestId('liquidity-receipt-detail')).toContainText('已撤出', {
        timeout: 30_000,
      });
      await page.getByRole('button', { name: '好的' }).click();
    }),
  );

  test(
    '用例 M（D8）：原生币单边不显示「已授权」',
    withChainSnapshot(async (page) => {
      await openLiquidity(page, NATIVE_ONLY);
      await expect(page.getByTestId('liquidity-token')).toContainText(SYMBOL, { timeout: 20_000 });
      await page.getByTestId('liquidity-native-amount').fill('10');
      await expect(page.getByTestId('liquidity-quote-liquidity')).toBeVisible({ timeout: 20_000 });

      const approve = page.getByTestId('liquidity-add-approve');
      await expect(approve).toBeDisabled();
      await expect(approve).toHaveText('这一笔不需要代币授权');
      await expect(page.getByText('这次要用的额度已经够，不需要再授权。')).toHaveCount(0);
    }),
  );

  test(
    '用例 I（D4）：未知社区 symbol 不顶替成 TestLOVE20',
    withChainSnapshot(async (page) => {
      await installWallet(page, NATIVE_ONLY);
      await page.goto('/liquidity?symbol=NoSuchCommunity99');
      await connect(page);
      await expect(page.getByTestId('liquidity-community-unknown')).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText('读不到这个社区。')).toBeVisible();
      // 不能拿目录第一个代币顶上：抬头行与加池面板都不应出现。
      await expect(page.getByTestId('liquidity-token')).toHaveCount(0);
      await expect(page.getByTestId('liquidity-token-amount')).toHaveCount(0);
    }),
  );

  test(
    '用例 J（D5）：切社区后自定义代币不再覆盖社区代币',
    withChainSnapshot(async (page) => {
      await openLiquidity(page, TOKEN_HOLDER_4);
      await expect(page.getByTestId('liquidity-token')).toContainText(SYMBOL, { timeout: 20_000 });

      // 先选一个自定义代币（用 TestLOVE20 本身即可触发「自定义」标记）。
      await selectCustomToken(page, deployment.addresses.tokenAddress, SYMBOL);
      await expect(page.getByTestId('liquidity-token')).toContainText('自定义');

      // 右上角社区切换 → TestCMTOK1（不刷新页面）。
      await page.getByRole('button', { name: new RegExp(`当前代币社区 ${SYMBOL}`) }).click();
      await page.getByTestId('community-search').fill(CHILD_SYMBOL);
      await page.getByTestId(`community-search-result-${CHILD_SYMBOL}`).click();
      await expect(page).toHaveURL(new RegExp(`[?&]symbol=${CHILD_SYMBOL}(&|$)`), {
        timeout: 15_000,
      });

      // QA D5：抬头必须跟随新社区，且不再挂「自定义」。
      await expect(page.getByTestId('liquidity-token')).toContainText(CHILD_SYMBOL, {
        timeout: 20_000,
      });
      await expect(page.getByTestId('liquidity-token')).not.toContainText('自定义');
      await page.getByTestId('liquidity-tab-query').click();
      await expect(page.getByTestId('liquidity-query-empty')).toContainText('未找到流动性池', {
        timeout: 20_000,
      });
    }),
  );

  test(
    '用例 K（D9）：零地址自定义代币给出可见原因',
    withChainSnapshot(async (page) => {
      await openLiquidity(page, NATIVE_ONLY);
      await expect(page.getByTestId('liquidity-token')).toContainText(SYMBOL, { timeout: 20_000 });
      await page.getByTestId('liquidity-custom-toggle').click();
      await page
        .getByTestId('liquidity-custom-address')
        .fill('0x0000000000000000000000000000000000000000');
      await page.getByTestId('liquidity-custom-add').click();
      await expect(page.getByTestId('liquidity-custom-error')).toHaveText(
        '这个地址上没有合约，不能作为代币。',
        { timeout: 20_000 },
      );
      // 合法地址仍能正常读取（证明不是按钮被禁用）。
      await expect(page.getByTestId('liquidity-custom-address')).toBeEditable();
    }),
  );

  test(
    '用例 L（D10）：页签往返保留已填金额与展开的详情',
    withChainSnapshot(async (page) => {
      await openLiquidity(page, TOKEN_HOLDER_4);
      await expect(page.getByTestId('liquidity-token')).toContainText(SYMBOL, { timeout: 20_000 });
      await addQuote(page, '123');
      await openDetails(page);

      await page.getByTestId('liquidity-tab-query').click();
      await expect(page.getByTestId('liquidity-query-supply')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('liquidity-tab-add').click();

      await expect(page.getByTestId('liquidity-token-amount')).toHaveValue('123');
      await expect(page.getByTestId('liquidity-details')).toBeVisible();
      await expect(page.getByTestId('liquidity-smart-mode')).toHaveAttribute(
        'aria-checked',
        'true',
      );
    }),
  );

  test(
    '边界（D6/D7）：只填一侧、显式 0、1 wei 各有原因',
    withChainSnapshot(async (page) => {
      const testToken = await deployTestToken();
      await openLiquidity(page, FIRST_MINT);
      await selectCustomToken(page, testToken, TEST_X);

      // D6：空池只填一侧 → 说缺另一侧，而不是「金额必须大于 0」。
      await page.getByTestId('liquidity-token-amount').fill('100');
      await expect(page.getByTestId('liquidity-amount-error')).toHaveText(
        '另一侧的数量还需要填写。',
        { timeout: 20_000 },
      );
      // D7：显式 0。
      await page.getByTestId('liquidity-native-amount').fill('0');
      await expect(page.getByTestId('liquidity-amount-error')).toHaveText('金额必须大于 0。');
      // D7：两侧都只有 1 wei → 算不出份额，给原因。
      await page.getByTestId('liquidity-token-amount').fill('0.000000000000000001');
      await page.getByTestId('liquidity-native-amount').fill('0.000000000000000001');
      await expect(page.getByTestId('liquidity-amount-error')).toHaveText(
        '这笔数量太小，池子配平后没有可用的份额。',
        { timeout: 20_000 },
      );
    }),
  );
});

/**
 * 社区流动性查询（owner 2026-11-16）：按旧库 LOVE20TKM 的四块布局重做，并支持
 * 查询任意地址的流动性（纯 view，未连接钱包也能查，不签任何交易）。
 *
 * 样本：#5（NATIVE_ONLY）没有 LP → 「该地址没有 LP」态；质押合约 `STAKE` 持有
 * totalSupply − 1000 → LP 数量 / 份额 / 两币折算的确定性数字（三线 §3 用例 Q）。
 */
test.describe('社区流动性查询（旧库四块布局 + 任意地址）', () => {
  test(
    '用例 N：默认地址、交易对统计、价格方向、无 LP 态、任意地址查询与重置',
    withChainSnapshot(async (page) => {
      await openLiquidity(page, NATIVE_ONLY);
      await page.getByTestId('liquidity-tab-query').click();

      // 卡 1：目标代币只读 WETH；LP 代币地址就是首币池的 pair（可点击复制）。
      await expect(page.getByTestId('liquidity-query-target')).toHaveText('TestWETH', {
        timeout: 20_000,
      });
      await expect(page.getByTestId('liquidity-query-pair')).toHaveAttribute(
        'title',
        deployment.addresses.pair,
      );

      // 卡 3：默认填当前钱包地址并自动查过一次 → 按钮是「重新查询」。
      await expect(page.getByTestId('liquidity-query-address')).toHaveValue(NATIVE_ONLY);
      await expect(page.getByTestId('liquidity-query-submit')).toHaveText('重新查询');

      // 卡 2：初始池统计（LP 总数量 / 两侧总数量）。
      await expect(page.getByTestId('liquidity-query-supply')).toHaveText('4,472.13');
      await expect(page.getByTestId('liquidity-query-total-token')).toHaveText('200,000');
      await expect(page.getByTestId('liquidity-query-total-target')).toHaveText('100');
      await expect(page.getByTestId('liquidity-query-price')).toHaveText(
        '1 TestWETH = 2,000 TestLOVE20',
      );
      // 方向切换。
      await page.getByTestId('liquidity-query-price-toggle').click();
      await expect(page.getByTestId('liquidity-query-price')).toHaveText(
        '1 TestLOVE20 = 0.0005 TestWETH',
      );

      // 卡 4：#5 在这个池子里没有 LP。
      await expect(page.getByTestId('liquidity-query-no-lp')).toHaveText(
        '该地址在此交易对中，没有流动性凭证',
      );

      // 任意地址：质押合约持有 totalSupply − 1000 → 4,472.13 LP（显示截断）/ 99.99%。
      await page.getByTestId('liquidity-query-address').fill(STAKE);
      await expect(page.getByTestId('liquidity-query-submit')).toHaveText('查询');
      await page.getByTestId('liquidity-query-submit').click();
      await expect(page.getByTestId('liquidity-query-lp')).toHaveText('4,472.13');
      await expect(page.getByTestId('liquidity-query-share')).toHaveText('99.99%');
      // 可兑换两币 = LP × reserve / totalSupply（向下取整）。
      await expect(page.getByTestId('liquidity-query-convertible-token')).toHaveText('199,999.99');
      await expect(page.getByTestId('liquidity-query-convertible-target')).toHaveText('99.9999');

      // 重置：清空输入、收起结果卡，按钮回到「查询」。
      await page.getByTestId('liquidity-query-reset').click();
      await expect(page.getByTestId('liquidity-query-address')).toHaveValue('');
      await expect(page.getByTestId('liquidity-query-result')).toHaveCount(0);
      await expect(page.getByTestId('liquidity-query-submit')).toHaveText('查询');
    }),
  );

  test(
    '用例 O：未连接钱包也能查任意地址；非法地址即时给原因并禁用提交',
    withChainSnapshot(async (page) => {
      // 只注入钱包，不点「连接」：查询是纯 view。
      await installWallet(page, NATIVE_ONLY);
      await page.goto(`/liquidity${QUERY}`);
      await page.getByTestId('liquidity-tab-query').click();
      await expect(page.getByTestId('liquidity-query-disconnected')).toHaveText(
        '⚠️ 未连接钱包，请手动输入要查询的地址',
      );
      // 没有钱包地址可填，输入框是空的。
      await expect(page.getByTestId('liquidity-query-address')).toHaveValue('');

      // 非法地址：即时提示 + 提交禁用，不发读链。
      await page.getByTestId('liquidity-query-address').fill('0x1234');
      await expect(page.getByTestId('liquidity-query-address-error')).toHaveText(
        '这不是一个有效的地址，需要 0x 开头的 40 位地址。',
      );
      await expect(page.getByTestId('liquidity-query-submit')).toBeDisabled();

      // 任意地址查询。
      await page.getByTestId('liquidity-query-address').fill(STAKE);
      await page.getByTestId('liquidity-query-submit').click();
      await expect(page.getByTestId('liquidity-query-lp')).toHaveText('4,472.13', {
        timeout: 20_000,
      });
      await expect(page.getByTestId('liquidity-query-share')).toHaveText('99.99%');
    }),
  );
});

/**
 * 验收截图：390×844 与 1280×800、浅色与深色，覆盖
 * 添加态（智能模式 + 报价折叠）/ 我的流动性 / 按 LP 数量撤出 / 社区流动性查询。
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

  async function shoot(page: Page, name: string, fullPage = false): Promise<void> {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({
      path: resolve(SHOTS, `liquidity-${name}.png`),
      animations: 'disabled',
      fullPage,
    });
  }

  test(
    '添加态（含报价）+ 我的流动性 + 按 LP 数量撤出',
    withChainSnapshot(async (page) => {
      for (const viewport of VIEWPORTS) {
        for (const theme of THEMES) {
          const comboSnapshot = await snapshotChain();
          await prepare(page, TOKEN_HOLDER_4, theme, viewport.width, viewport.height);
          await expect(page.getByTestId('liquidity-token')).toContainText(SYMBOL, {
            timeout: 20_000,
          });
          await addQuote(page, '100000');
          await expect(page.getByTestId('liquidity-quote-liquidity')).toHaveText(
            '预计获得 1,003.57 流动性凭证',
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
          await page.getByRole('button', { name: '好的' }).click();
          await page.getByTestId('liquidity-tab-mine').click();
          await expect(page.getByTestId('liquidity-my-lp')).toHaveText('1,003.57', {
            timeout: 20_000,
          });
          await shoot(page, `mine-${theme}-${viewport.key}`);
          await page.getByTestId('liquidity-withdraw-percent-100').click();
          await expect(page.getByTestId('liquidity-withdraw-receive')).toHaveText(
            '预计收到约 54,983.49 TestLOVE20 + 18.3278 ETH',
          );
          await page.getByTestId('liquidity-withdraw-receive').scrollIntoViewIfNeeded();
          await shoot(page, `withdraw-${theme}-${viewport.key}`);
          await revertChain(comboSnapshot);
        }
      }
    }),
  );

  test(
    '社区流动性查询（四块布局 + 任意地址结果）',
    withChainSnapshot(async (page) => {
      for (const viewport of VIEWPORTS) {
        for (const theme of THEMES) {
          await prepare(page, NATIVE_ONLY, theme, viewport.width, viewport.height);
          await page.getByTestId('liquidity-tab-query').click();
          await page.getByTestId('liquidity-query-address').fill(STAKE);
          await page.getByTestId('liquidity-query-submit').click();
          await expect(page.getByTestId('liquidity-query-lp')).toHaveText('4,472.13', {
            timeout: 20_000,
          });
          // 四块一屏放不下（390×844 / 1280×800 都放不下）：这一态用整页截图，
          // 让「选择交易对 / 交易对统计 / 查询地址 / 查询结果」四块落在同一张验收图里。
          await page.evaluate(() => window.scrollTo({ top: 0 }));
          await shoot(page, `query-${theme}-${viewport.key}`, true);
        }
      }
    }),
  );
});
