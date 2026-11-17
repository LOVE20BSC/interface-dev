import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { isolateChain, restoreMining, revertChain, snapshotChain, suspendMining } from './chain';
import { connect, installWallet, seedIdentity } from './wallet-stub';

/**
 * 治理·质押 前端线（三线校验 §3）:
 * `docs/product/three-line/gov-stake.md` §1 的理论值必须逐字出现在治理域的页面上。
 *
 * 2026-11-17 晚 owner 要求复刻 LOVE20TKM 旧版治理域 IA（同样的页面/功能/布局，只换
 * 视觉），并把流动性质押改成支持「智能模式」（单币即可，或关掉后两侧都填）。本轮
 * 页面拆成 5 条路由：
 * - `/gov`                  治理首页（我的 / 社区 两个 tab）
 * - `/stake/stakelp`        质押LP（流动性质押表单，默认智能模式）
 * - `/stake/staketoken`     质押代币（加速质押）
 * - `/stake/unstake`        取消质押（增加承诺解锁期 / 申请解锁 / 撤出）
 * - `/stake/liquid`         流动性质押数据（只读）
 * 以及 `/vote` 等旧版页面的占位。
 *
 * 断言只读页面渲染出来的文字（规范 §7.10）：金额/份额/治理权/上限一律 `toHaveText`
 * 整串精确相等，不用 `toContainText`/正则；只对非数值文案（状态标签、说明句）用
 * `toContainText`。智能模式是新增交互，没有理论线数值（Hub 报价不在 §1 的手算范围），
 * 所以那一条只断言结构性文案与「不是未知」，不写数字。
 *
 * 夹具（与理论线 §0.5 一致）:
 * - 操作账户 = anvil #4 `0x15d3…6A65`，它持有 MemberNFT #5；`seedIdentity` 直接写
 *   选择缓存，不依赖页面点选（身份 NFT 是 onlyMemberOwner 的调用主体）。
 * - C1 需要两侧资产：该账户初始没有 TestWETH，`beforeAll` 用 `deposit()` 包 2 原生币。
 * - C1→C4 共享同一成员仓位：按文件取一次快照（`isolateChain`）、用例串行；智能模式
 *   用例排在 C4 撤出之后（仓位回到空），所以不需要额外回滚。
 * - 期望值 = §1 在 clean bootstrap 种子上的常量；8555 与 8566 同基线（2026-11-17
 *   13:12 基线修正，见三线文档 §0.4），所以两条链上数字一致。
 *
 * 截图：6 个状态 × 390×844 / 1280×800 × 浅色/深色 = 24 张视口图（`page.screenshot`
 * 不带 fullPage，固定底栏不会被拼进页面中部）。
 */

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');
const RPC_URL = process.env.E2E_ANVIL_RPC ?? 'http://127.0.0.1:8555';
const SYMBOL = 'TestLOVE20';
const QUERY = `?symbol=${SYMBOL}`;

/** anvil 固定账户 #4：memberId 5 的 owner（§0.5），也是 C1–C4 的唯一调用者。 */
const ACCOUNT = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const MEMBER_ID = '5';

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/network/anvil31337_dev/network.json'), 'utf8'),
) as {
  addresses: {
    tokenAddress: `0x${string}`;
    stake: `0x${string}`;
    weth: `0x${string}`;
    phase: `0x${string}`;
  };
};

const { stake, weth, phase, tokenAddress } = deployment.addresses;

const MEMBER_STAKE_SIGNATURE =
  'memberStake(address,uint256)(uint256,uint256,uint256,uint256,uint256,uint256,uint256)';

/** 理论线 §1 / §0 在 clean bootstrap 种子上的常量（§3 的页面字符串就是它们）。 */
const EXPECTED = {
  seed: {
    /** 种子里 memberId 1 的票：4,472.135954e18（§0.3）。 */
    communityVotes: '4,472.135954',
    communityShares: '4,472.135954',
    communityTotalLp: '4,472.135954',
    communityWithdrawableLp: '4,472.135954',
    communityPrincipal: '200,000',
    communityBurned: '0',
    communityFeeRatio: '0.25%',
    /** 按 memberId 1 查询（种子仓位）：治理权 / 解锁期 / 份额 / 加速份额。 */
    queryVotes: '4,472.135954',
    queryPhases: '1 个阶段',
    queryShares: '4,472.135954',
    queryBoost: '0',
  },
  c1: {
    votesAdded: '+223.606797',
    optimal: '按池子比例实际存入 1,000 TestLOVE20 + 0.5 TestWETH。',
    receiptVotes: '治理权 +223.606797',
    receiptShares: '流动性质押份额 +22.360679',
    myVotes: '223.606797',
    myShares: '22.360679',
    myPhases: '10 个阶段（约 20 分钟）',
    myTokenAmount: '999.999999',
    myParentAmount: '0.499999',
    communityVotes: '4,695.742752',
    communityShares: '4,494.496634',
    communityShare: '4.76%',
    communityPrincipal: '201,000',
  },
  c2: {
    /** `boostAmount = floor(memberCap / 2)`，完整 18 位小数走用户输入。 */
    boostInput: '9571.385499991385715425',
    capBefore: '19,142.770999 TestLOVE20',
    capAfter: '9,571.385499 TestLOVE20',
    used: '9,571.385499',
    receipt: '加速质押 9,571.385499 TestLOVE20',
  },
  c3: {
    preview: '治理权 +335.410196',
    phases: '25 个阶段（约 50 分钟）',
    votes: '559.016994',
  },
  c4: {
    /** 可撤出阶段 = Q + 26（合约条件是「当前阶段 > Q + 25」，严格大于）。 */
    unlockNote: '已申请解锁：还要再等 26 个阶段（约 52 分钟）才能撤出。',
    withdrawReceipt: '已撤出 10,571.385499 TestLOVE20 + 0.499999 TestWETH',
  },
} as const;

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  actionTimeout: 30_000,
});

test.describe.configure({ mode: 'serial', timeout: 1_200_000 });
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
  extra: readonly string[] = [],
): void {
  execFileSync(
    'cast',
    [
      'send',
      address,
      signature,
      ...args,
      ...extra,
      '--from',
      ACCOUNT,
      '--unlocked',
      '--rpc-url',
      RPC_URL,
    ],
    { encoding: 'utf8' },
  );
}

/** `cast call` 把每个 tuple 元素打印成一行，大数后面还跟 ` [2.47e18]` 的人类可读注释。 */
function tupleLine(raw: string, index: number): bigint {
  const line = raw.split('\n')[index]?.trim();
  const match = line === undefined ? null : /^(\d+)/.exec(line);
  if (match === null || match[1] === undefined) {
    throw new Error(`cast tuple index ${index} is not numeric: ${JSON.stringify(line ?? raw)}`);
  }
  return BigInt(match[1]);
}

function bigintOf(raw: string): bigint {
  return tupleLine(raw, 0);
}

function currentPhase(): bigint {
  return bigintOf(castCall(phase, 'currentPhase()(uint256)'));
}

function currentBlock(): bigint {
  return bigintOf(cast(['block-number']));
}

/** `phaseInfo(phase)` 的起始块；契约按 120 块/阶段切分（§0.1）。 */
function phaseStartBlock(target: bigint): bigint {
  return tupleLine(castCall(phase, 'phaseInfo(uint256)(uint256,uint256)', target.toString()), 0);
}

/**
 * 推块。一次推几千块时先暂停 interval mining、推完再恢复（`restoreMining` 会回读
 * 断言挖矿模式），并按 240 块分块：anvil 1.8.1 在一次 `anvil_mine` 里连挖 ~3,100 块
 * 会卡死（进程还在 LISTEN、HTTP 全超时；2026-11-17 在 8555 与 8566 上各复现一次）。
 */
async function mine(blocks: bigint): Promise<void> {
  if (blocks <= 0n) return;
  const CHUNK = 240n;
  await suspendMining();
  try {
    let remaining = blocks;
    while (remaining > 0n) {
      const step = remaining > CHUNK ? CHUNK : remaining;
      cast(['rpc', 'anvil_mine', `0x${step.toString(16)}`]);
      remaining -= step;
    }
  } finally {
    await restoreMining();
  }
}

function readMemberStake(): readonly bigint[] {
  const raw = castCall(stake, MEMBER_STAKE_SIGNATURE, tokenAddress, MEMBER_ID);
  return [0, 1, 2, 3, 4, 5, 6].map((index) => tupleLine(raw, index));
}

/**
 * 把链推到「刚进入某个新阶段」的位置：解锁剩余阶段是「当前阶段 → 可撤阶段」的
 * 差，靠近阶段末尾执行申请解锁会让页面上的剩余阶段数随区间漂移，断言就不确定了。
 * 先落到新阶段起点，两次读取之间（< 10 s，1 块/s）就不会跨阶段。
 */
async function settleAtPhaseStart(): Promise<void> {
  const current = currentPhase();
  const start = phaseStartBlock(current);
  const offset = currentBlock() - start;
  if (offset > 60n) await mine(120n - offset);
}

/** C1 的链上夹具：两侧各授权，再按池子比例存入（截图态/前置态用）。 */
function stakeFixture(): void {
  castSend(tokenAddress, 'approve(address,uint256)', [stake, '1000000000000000000000']);
  castSend(weth, 'approve(address,uint256)', [stake, '1000000000000000000000']);
  castSend(stake, 'stakeLiquidity(address,uint256,uint256,uint256,uint256,uint256)', [
    tokenAddress,
    '1000000000000000000000',
    '1000000000000000000000',
    '10',
    MEMBER_ID,
    '4000000000',
  ]);
}

async function openPage(page: Page, path: string): Promise<void> {
  await installWallet(page, ACCOUNT);
  await seedIdentity(page, ACCOUNT, MEMBER_ID);
  await page.goto(`${path}${QUERY}`);
  await connect(page);
}

/**
 * 授权阶梯（UX spec §4.1）：额度不够时按钮可点，成交后原地变「已授权 X」。
 *
 * 授权行有四种稳定/过渡态：读取授权额度中…（禁用）→ 授权 X（可点）/ 已授权 X（禁用）
 * / 这一笔不需要代币授权（禁用），点击后还有 授权中… / 确认中…。必须先等它离开过渡态
 * 再决定点不点：额度读得慢时（8566 上实测过）直接 `isEnabled()` 会读到「读取授权额度
 * 中…」而跳过点击，之后永远等不到「已授权」。
 */
async function approveRow(page: Page, testId: string, approvedText: string): Promise<void> {
  const button = page.getByTestId(testId);
  await expect(button).toBeVisible({ timeout: 20_000 });
  const transient = new Set(['读取授权额度中…', '授权中…', '确认中…']);
  await expect
    .poll(
      async () => {
        const text = (await button.innerText()).trim();
        return transient.has(text) ? 'transient' : 'settled';
      },
      { timeout: 30_000 },
    )
    .toBe('settled');
  const text = (await button.innerText()).trim();
  if (text !== approvedText && (await button.isEnabled())) await button.click();
  await expect(button).toHaveText(approvedText, { timeout: 60_000 });
}

test.beforeAll(() => {
  // C1 要存两侧：账户 #4 的 TestWETH 初始为 0，先包 2 原生币（用不完的部分留在钱包）。
  const balance = bigintOf(castCall(weth, 'balanceOf(address)(uint256)', ACCOUNT));
  if (balance === 0n) castSend(weth, 'deposit()', [], ['--value', '2ether']);
});

/**
 * 验收截图：6 个状态 × 390×844 / 1280×800 × 浅色/深色 = 24 张视口图。
 * - `gov-home-mine-*`        治理首页「我的」：我的治理资产（有仓位）
 * - `gov-home-community-*`   治理首页「社区」：社区治理数据 + 治理权查询
 * - `stake-lp-*`             质押LP：智能模式单币（含 Hub 报价与预计治理权）
 * - `stake-token-*`          质押代币：我的加速质押 + 加速表单（有流动性质押）
 * - `unstake-*`              取消质押：我的治理资产 + 三个动作
 * - `gov-vote-placeholder-*` 旧版占位页（/vote）
 *
 * 有仓位的状态由链上夹具摆好（approve + stakeLiquidity），每档组合独立快照、拍完
 * 回滚；数字口径本身已由前端线用例逐字断言。
 */
test.describe('治理域 验收截图', () => {
  const VIEWPORTS = [
    { key: 'mobile', width: 390, height: 844 },
    { key: 'desktop', width: 1280, height: 800 },
  ] as const;
  const THEMES = ['light', 'dark'] as const;

  async function prepare(
    page: Page,
    theme: 'light' | 'dark',
    width: number,
    height: number,
    path: string,
  ): Promise<void> {
    await page.setViewportSize({ width, height });
    await page.addInitScript((nextTheme: string) => {
      window.localStorage.setItem('love20:theme', nextTheme);
    }, theme);
    await openPage(page, path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  }

  /** 视口截图（不带 fullPage）：图片就是用户看到的一屏。 */
  async function shoot(page: Page, name: string): Promise<void> {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: resolve(SHOTS, `${name}.png`), animations: 'disabled' });
  }

  /**
   * 把某个 testid 的元素顶边滚到视口 `topOffset` 处，保证一屏落在关键区块上；
   * 不依赖具体像素高度，布局变化后仍然取同一块的顶边。
   */
  async function scrollTo(page: Page, testId: string, topOffset: number): Promise<void> {
    await page.getByTestId(testId).evaluate((element, offset) => {
      const rect = element.getBoundingClientRect();
      window.scrollTo(0, rect.top + window.scrollY - offset);
    }, topOffset);
  }

  test('六态 × 四档视口/主题', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const suffix = `${theme}-${viewport.key}`;

        // A. 有仓位：首页「我的」/ 首页「社区」/ 质押代币 / 取消质押。
        const staked = await snapshotChain();
        try {
          await prepare(page, theme, viewport.width, viewport.height, '/gov');
          stakeFixture();
          await page.reload();
          await connect(page);
          await expect(page.getByTestId('gov-my-votes')).toHaveText(EXPECTED.c1.myVotes, {
            timeout: 30_000,
          });
          await scrollTo(page, 'gov-my-assets', 64);
          await shoot(page, `gov-home-mine-${suffix}`);

          await page.getByTestId('gov-home-tab-community').click();
          await expect(page.getByTestId('gov-community-votes')).toHaveText(
            EXPECTED.c1.communityVotes,
            { timeout: 20_000 },
          );
          await scrollTo(page, 'gov-community-panel', 64);
          await shoot(page, `gov-home-community-${suffix}`);

          await page.goto(`/stake/staketoken${QUERY}`);
          await connect(page);
          await expect(page.getByTestId('gov-boost-cap')).toHaveText(EXPECTED.c2.capBefore, {
            timeout: 30_000,
          });
          await scrollTo(page, 'gov-accelerated-summary', 64);
          await shoot(page, `stake-token-${suffix}`);

          await page.goto(`/stake/unstake${QUERY}`);
          await connect(page);
          await expect(page.getByTestId('gov-unstake-votes')).toHaveText(EXPECTED.c1.myVotes, {
            timeout: 30_000,
          });
          await scrollTo(page, 'gov-unstake-assets', 64);
          await shoot(page, `unstake-${suffix}`);
        } finally {
          await revertChain(staked);
        }

        // B. 空仓位：质押LP 智能模式（Hub 报价）。
        const clean = await snapshotChain();
        try {
          await prepare(page, theme, viewport.width, viewport.height, '/stake/stakelp');
          await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
            'aria-checked',
            'true',
            { timeout: 30_000 },
          );
          await page.getByTestId('gov-liquidity-token-input').fill('1000');
          await expect(page.getByTestId('gov-liquidity-hub-quote')).toContainText('实际进池', {
            timeout: 30_000,
          });
          await expect(page.getByTestId('gov-liquidity-preview-votes')).not.toHaveText('—');
          await scrollTo(page, 'gov-liquidity-smart-mode', 64);
          await shoot(page, `stake-lp-${suffix}`);
        } finally {
          await revertChain(clean);
        }

        // C. 旧版占位页。
        const placeholder = await snapshotChain();
        try {
          await prepare(page, theme, viewport.width, viewport.height, '/vote');
          await expect(page.getByTestId('gov-placeholder')).toBeVisible({ timeout: 30_000 });
          await scrollTo(page, 'gov-placeholder', 96);
          await shoot(page, `gov-vote-placeholder-${suffix}`);
        } finally {
          await revertChain(placeholder);
        }
      }
    }
  });
});

test.describe('治理域 前端线（理论线 §1 / §3）', () => {
  test('C1 之前：首页空态 / 社区数据 / 治理权查询 / 智能模式开关 / 占位页', async ({ page }) => {
    // 首页「我的」：没有仓位 → 我的治理资产空态 + 成为治理者引导 + 四张入口卡不出现。
    await openPage(page, '/gov');
    await expect(page.getByTestId('gov-my-assets')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-become-governor')).toBeVisible();
    await expect(page.getByTestId('gov-my-votes')).toHaveCount(0);
    await expect(page.getByTestId('gov-entry-vote')).toHaveCount(0);

    // 首页「社区」：种子态社区数据（§0.3：全部 LP 记在 memberId 1）。
    await page.getByTestId('gov-home-tab-community').click();
    await expect(page.getByTestId('gov-community-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('gov-community-votes')).toHaveText(EXPECTED.seed.communityVotes);
    await expect(page.getByTestId('gov-community-shares')).toHaveText(
      EXPECTED.seed.communityShares,
    );
    await expect(page.getByTestId('gov-community-total-lp')).toHaveText(
      EXPECTED.seed.communityTotalLp,
    );
    await expect(page.getByTestId('gov-community-withdrawable-lp')).toHaveText(
      EXPECTED.seed.communityWithdrawableLp,
    );
    await expect(page.getByTestId('gov-community-principal')).toHaveText(
      EXPECTED.seed.communityPrincipal,
    );
    await expect(page.getByTestId('gov-community-burned')).toHaveText(
      EXPECTED.seed.communityBurned,
    );
    await expect(page.getByTestId('gov-community-fee-ratio')).toHaveText(
      EXPECTED.seed.communityFeeRatio,
    );

    // 治理权查询：按身份 NFT 编号查种子仓位 memberId 1（纯 view，不发交易）。
    await page.getByTestId('gov-query-input').fill('1');
    await page.getByTestId('gov-query-submit').click();
    await expect(page.getByTestId('gov-query-votes')).toHaveText(EXPECTED.seed.queryVotes, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('gov-query-phases')).toHaveText(EXPECTED.seed.queryPhases);
    await expect(page.getByTestId('gov-query-shares')).toHaveText(EXPECTED.seed.queryShares);
    await expect(page.getByTestId('gov-query-boost')).toHaveText(EXPECTED.seed.queryBoost);
    // 非法输入即时给原因并禁用查询。
    await page.getByTestId('gov-query-reset').click();
    await page.getByTestId('gov-query-input').fill('abc');
    await expect(page.getByTestId('gov-query-invalid')).toContainText('整数编号');
    await expect(page.getByTestId('gov-query-submit')).toBeDisabled();

    // 质押LP：默认智能模式（单币），关掉后切到两侧都填。
    await page.goto(`/stake/stakelp${QUERY}`);
    await expect(page.getByTestId('gov-liquidity-card')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('gov-liquidity-native-input')).toBeVisible();
    await expect(page.getByTestId('gov-liquidity-parent-input')).toHaveCount(0);
    await expect(page.getByTestId('gov-liquidity-preview-votes')).toHaveText('—');
    await page.getByTestId('gov-liquidity-smart-mode').click();
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(page.getByTestId('gov-liquidity-parent-input')).toBeVisible();
    await expect(page.getByTestId('gov-liquidity-native-input')).toHaveCount(0);
    await expect(page.getByTestId('gov-tips')).toBeVisible();

    // 质押代币：没有流动性质押时是明确的「先完成流动性质押」卡。
    await page.goto(`/stake/staketoken${QUERY}`);
    await expect(page.getByTestId('gov-stake-token-gate')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-stake-token-gate')).toContainText('先完成流动性质押');
    await expect(page.getByTestId('gov-boost-card')).toHaveCount(0);

    // 取消质押：空态是「我的治理资产」卡（不是 0 值表格）。
    await page.goto(`/stake/unstake${QUERY}`);
    await expect(page.getByTestId('gov-unstake-empty')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-unstake-assets')).toHaveCount(0);

    // 流动性质押数据（只读）：空态文案 + 社区数据面板。
    await page.goto(`/stake/liquid${QUERY}`);
    await expect(page.getByTestId('gov-liquid-mine')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-liquid-mine')).toContainText('这个社区还没有流动性质押。');
    await expect(page.getByTestId('gov-community-votes')).toHaveText(EXPECTED.seed.communityVotes);

    // 旧版占位页：标题 + 一句说明 + 两个下一步（不编造数据）。
    await page.goto(`/vote${QUERY}`);
    await expect(page.getByTestId('gov-placeholder')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-placeholder')).toContainText('投票');
    await expect(page.getByTestId('gov-placeholder')).toContainText('即将上线');
  });

  test('用例 C1：质押LP（关掉智能模式，1,000 TestLOVE20 + 1 TestWETH / 10 阶段）→ 治理权 223.606797', async ({
    page,
  }) => {
    await openPage(page, '/stake/stakelp');
    await expect(page.getByTestId('gov-liquidity-card')).toBeVisible({ timeout: 30_000 });
    // 关掉智能模式：变成两侧都填（社区代币 + 父币），直接质押不经过兑换。
    await page.getByTestId('gov-liquidity-smart-mode').click();
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.getByTestId('gov-liquidity-token-input').fill('1000');
    await page.getByTestId('gov-liquidity-parent-input').fill('1');
    await page.getByTestId('gov-liquidity-phases-input').fill('10');

    await expect(page.getByTestId('gov-liquidity-optimal')).toHaveText(EXPECTED.c1.optimal, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('gov-liquidity-preview-votes')).toHaveText(
      EXPECTED.c1.votesAdded,
    );
    await expect(page.getByTestId('gov-liquidity-submit')).toBeDisabled();

    await approveRow(page, 'gov-liquidity-approve-token', '已授权 TestLOVE20');
    await expect(page.getByTestId('gov-liquidity-submit')).toBeDisabled();
    await approveRow(page, 'gov-liquidity-approve-parent', '已授权 TestWETH');
    await expect(page.getByTestId('gov-liquidity-submit')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('gov-liquidity-submit').click();

    await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('gov-receipt')).toContainText('流动性质押已提交');
    const lines = page.getByTestId('gov-receipt-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toHaveText(EXPECTED.c1.receiptVotes);
    await expect(lines.nth(1)).toHaveText(EXPECTED.c1.receiptShares);
    await page.getByTestId('gov-receipt-close').click();
    await expect(page.getByTestId('gov-receipt')).toHaveCount(0);

    // 同一页的「我的流动性质押」摘要（stakelp 页在已有仓位时出现）。
    await expect(page.getByTestId('gov-page-my-stake')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-my-votes')).toHaveText(EXPECTED.c1.myVotes);
    await expect(page.getByTestId('gov-my-shares')).toHaveText(EXPECTED.c1.myShares);
    await expect(page.getByTestId('gov-my-boost')).toHaveText('0');
    await expect(page.getByTestId('gov-my-phases')).toHaveText(EXPECTED.c1.myPhases);
    // §3 显示规则边界 1/2：只截断不四舍五入，不显示成 1,000 / 0.5。
    await expect(page.getByTestId('gov-my-token-amount')).toHaveText(EXPECTED.c1.myTokenAmount);
    await expect(page.getByTestId('gov-my-parent-amount')).toHaveText(EXPECTED.c1.myParentAmount);
    await expect(page.getByTestId('gov-my-unlock-state')).toContainText('正常质押中');
    await expect(page.getByTestId('gov-my-boost-amount')).toHaveCount(0);

    // 首页「我的」「社区」同步到 C1 之后的社区盘子。
    await page.goto(`/gov${QUERY}`);
    await expect(page.getByTestId('gov-my-votes')).toHaveText(EXPECTED.c1.myVotes, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('gov-entry-vote')).toBeVisible();
    await page.getByTestId('gov-home-tab-community').click();
    await expect(page.getByTestId('gov-community-votes')).toHaveText(EXPECTED.c1.communityVotes, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('gov-community-shares')).toHaveText(EXPECTED.c1.communityShares);
    await expect(page.getByTestId('gov-community-share')).toHaveText(EXPECTED.c1.communityShare);
    await expect(page.getByTestId('gov-community-principal')).toHaveText(
      EXPECTED.c1.communityPrincipal,
    );
  });

  test('用例 C2：质押代币（加速质押一半上限）→ 加速份额 9,571.385499，治理权不变', async ({
    page,
  }) => {
    await openPage(page, '/stake/staketoken');
    await expect(page.getByTestId('gov-accelerated-summary')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-accelerated-valid')).toHaveText('0');
    await expect(page.getByTestId('gov-accelerated-used')).toHaveText('0');
    await expect(page.getByTestId('gov-accelerated-remaining')).toHaveText('19,142.770999');
    await expect(page.getByTestId('gov-boost-cap')).toHaveText(EXPECTED.c2.capBefore);
    await expect(page.getByTestId('gov-boost-used')).toHaveText('0');

    // boostAmount = floor(memberCap / 2)：完整 18 位小数，走用户输入路径。
    await page.getByTestId('gov-boost-input').fill(EXPECTED.c2.boostInput);
    await expect(page.getByTestId('gov-boost-submit')).toBeDisabled();
    // C1 的授权正好用完，加速这一笔必须重新授权（§1 授权口径）。
    await approveRow(page, 'gov-boost-approve', '已授权 TestLOVE20');
    await expect(page.getByTestId('gov-boost-submit')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('gov-boost-submit').click();

    await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('gov-receipt')).toContainText('加速质押已提交');
    await expect(page.getByTestId('gov-receipt-line')).toHaveText(EXPECTED.c2.receipt);
    await page.getByTestId('gov-receipt-close').click();

    // 剩余额度 = memberCap − boostShares；本基线 memberCap 是偶数，余量与已用同串（§3 边界 3）。
    await expect(page.getByTestId('gov-boost-cap')).toHaveText(EXPECTED.c2.capAfter, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('gov-boost-used')).toHaveText(EXPECTED.c2.used);
    await expect(page.getByTestId('gov-accelerated-valid')).toHaveText(EXPECTED.c2.used);
    await expect(page.getByTestId('gov-accelerated-used')).toHaveText(EXPECTED.c2.used);
    await expect(page.getByTestId('gov-accelerated-remaining')).toHaveText(EXPECTED.c2.used);

    // 加速质押不产生治理权：首页「我的」的治理权仍是 C1 的 223.606797。
    await page.goto(`/gov${QUERY}`);
    await expect(page.getByTestId('gov-my-votes')).toHaveText(EXPECTED.c1.myVotes, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('gov-my-boost')).toHaveText(EXPECTED.c2.used);
    await expect(page.getByTestId('gov-my-boost-amount')).toHaveText(EXPECTED.c2.used);
  });

  test('用例 C3：取消质押页「增加承诺解锁期」10 → 25 → 治理权 559.016994', async ({ page }) => {
    await openPage(page, '/stake/unstake');
    await expect(page.getByTestId('gov-unstake-assets')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-unstake-votes')).toHaveText(EXPECTED.c1.myVotes);
    await expect(page.getByTestId('gov-unstake-shares')).toHaveText(EXPECTED.c1.myShares);
    await expect(page.getByTestId('gov-unstake-phases')).toHaveText(EXPECTED.c1.myPhases);
    await expect(page.getByTestId('gov-unstake-boost')).toHaveText(EXPECTED.c2.used);
    await expect(page.getByTestId('gov-unstake-boost-amount')).toHaveText(EXPECTED.c2.used);

    await page.getByTestId('gov-unstake-increase-phases-button').click();
    await page.getByTestId('gov-unstake-increase-phases-input').fill('25');
    // 弹层预览的是「这一笔新增的治理权」= shares × (25 − 10)。
    await expect(page.getByTestId('gov-unstake-increase-preview')).toHaveText(EXPECTED.c3.preview, {
      timeout: 20_000,
    });
    await page.getByTestId('gov-unstake-increase-phases-submit').click();

    await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('gov-receipt')).toContainText('承诺解锁期已增加');
    const lines = page.getByTestId('gov-receipt-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toHaveText('承诺解锁期现在是 25 个阶段。');
    await expect(lines.nth(1)).toHaveText(EXPECTED.c3.preview);
    await page.getByTestId('gov-receipt-close').click();

    await expect(page.getByTestId('gov-unstake-phases')).toHaveText(EXPECTED.c3.phases, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('gov-unstake-votes')).toHaveText(EXPECTED.c3.votes);
  });

  test('用例 C4：申请解锁 → 到期 → 撤出 10,571.385499 TestLOVE20 + 0.499999 TestWETH', async ({
    page,
  }) => {
    await openPage(page, '/stake/unstake');
    await expect(page.getByTestId('gov-unstake-votes')).toHaveText(EXPECTED.c3.votes, {
      timeout: 30_000,
    });
    await settleAtPhaseStart();

    await page.getByTestId('gov-unstake-unstake-button').click();
    await page.getByTestId('gov-unstake-unstake-confirm').click();
    await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('gov-receipt')).toContainText('已申请解锁');
    await expect(page.getByTestId('gov-receipt-line')).toHaveText(
      '治理权已经清零，等承诺解锁期走完就可以撤出。',
    );
    await page.getByTestId('gov-receipt-close').click();

    // 申请解锁后：治理权与加速份额立刻清零，份额/本金不动（§1 ④）。
    await expect(page.getByTestId('gov-unstake-votes')).toHaveText('0', { timeout: 20_000 });
    await expect(page.getByTestId('gov-unstake-boost')).toHaveText('0');
    await expect(page.getByTestId('gov-unstake-shares')).toHaveText(EXPECTED.c1.myShares);
    await expect(page.getByTestId('gov-unstake-boost-amount')).toHaveText(EXPECTED.c2.used);
    await expect(page.getByTestId('gov-unstake-unlock-state')).toContainText('已申请解锁');
    await expect(page.getByTestId('gov-unstake-waiting-withdraw')).toBeVisible();
    await expect(page.getByTestId('gov-unstake-waiting-withdraw')).toBeDisabled();
    // 剩余阶段 = Q + 26 − 当前阶段（Q 为申请阶段，含端计数）；settle 已保证同一阶段。
    await expect(page.getByTestId('gov-unstake-unlock-note')).toHaveText(EXPECTED.c4.unlockNote, {
      timeout: 20_000,
    });

    // 到期判定：当前阶段 > unlockRequestPhase + promisedWaitingPhases，即第一个可撤
    // 阶段 = Q + 26。推到该阶段起点后刷新页面（页面不会自己感知外部推块）。
    const unlockRequestPhase = readMemberStake()[3] ?? 0n;
    const withdrawPhase = unlockRequestPhase + 26n;
    const target = phaseStartBlock(withdrawPhase) + 1n;
    await mine(target - currentBlock());

    await page.reload();
    await connect(page);
    await expect(page.getByTestId('gov-unstake-assets')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-unstake-unlock-state')).toContainText('可以撤出了');
    const withdraw = page.getByTestId('gov-unstake-withdraw-button');
    await expect(withdraw).toBeVisible({ timeout: 30_000 });
    await expect(withdraw).toBeEnabled();

    await withdraw.click();
    await page.getByTestId('gov-unstake-withdraw-confirm').click();
    await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('gov-receipt')).toContainText('已撤出');
    // 实际到账 = LP 折算 999.999999 + 加速质押退还（§1 ⑤ 的 boost 返还）。
    await expect(page.getByTestId('gov-receipt-line')).toHaveText(EXPECTED.c4.withdrawReceipt);
    await page.getByTestId('gov-receipt-close').click();

    // 撤出后 memberStake 整条删除 → 「我的治理资产」回到空态，不是 0 值表格。
    await expect(page.getByTestId('gov-unstake-empty')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-unstake-empty')).toContainText('这个身份 NFT 还没有质押。');
    await expect(page.getByTestId('gov-unstake-votes')).toHaveCount(0);
    expect(readMemberStake().every((value) => value === 0n)).toBe(true);
  });

  test('新增：智能模式单币质押（只填社区代币，Hub 报价 → 授权 → 提交）', async ({ page }) => {
    await openPage(page, '/stake/stakelp');
    await expect(page.getByTestId('gov-liquidity-card')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('gov-liquidity-native-input')).toBeVisible();
    await expect(page.getByTestId('gov-liquidity-parent-input')).toHaveCount(0);
    await expect(page.getByTestId('gov-liquidity-preview-votes')).toHaveText('—');

    // 只填社区代币：Hub 报价给出「会先换成多少原生币」+「实际进池两侧」+ 预计治理权。
    await page.getByTestId('gov-liquidity-token-input').fill('1000');
    const quote = page.getByTestId('gov-liquidity-hub-quote');
    // 兑换方向：只填社区代币时是「社区代币 → 原生币」。
    await expect(quote).toContainText('TestLOVE20 会先换成', { timeout: 30_000 });
    await expect(quote).toContainText('实际进池');
    await expect(page.getByTestId('gov-liquidity-preview-votes')).not.toHaveText('—');
    // 智能模式的授权对象是 Hub（只授权社区代币；原生币不需要授权）。
    await approveRow(page, 'gov-liquidity-approve-token', '已授权 TestLOVE20');
    await expect(page.getByTestId('gov-liquidity-approve-parent')).toHaveCount(0);
    await expect(page.getByTestId('gov-liquidity-submit')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('gov-liquidity-submit').click();

    await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('gov-receipt')).toContainText('流动性质押已提交');
    await expect(page.getByTestId('gov-receipt-line')).toHaveCount(2);
    // 修复前只填社区代币会 revert（ZeroNativeTokenAmount）；这条保证不再出现失败提示。
    await expect(page.getByTestId('gov-tx-error')).toHaveCount(0);
    await page.getByTestId('gov-receipt-close').click();
    await expect(page.getByTestId('gov-page-my-stake')).toBeVisible({ timeout: 30_000 });

    // 再切一次开关：原生币输入框 ↔ 父币输入框。
    await page.getByTestId('gov-liquidity-smart-mode').click();
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(page.getByTestId('gov-liquidity-parent-input')).toBeVisible();
    await expect(page.getByTestId('gov-liquidity-native-input')).toHaveCount(0);
    await page.getByTestId('gov-liquidity-smart-mode').click();
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId('gov-liquidity-native-input')).toBeVisible();
    await expect(page.getByTestId('gov-liquidity-parent-input')).toHaveCount(0);
  });

  test('新增：智能模式单币质押（只填原生币，Hub 报价 → 提交）', async ({ page }) => {
    await openPage(page, '/stake/stakelp');
    await expect(page.getByTestId('gov-liquidity-card')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'true',
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('gov-liquidity-native-input')).toBeVisible();
    await expect(page.getByTestId('gov-liquidity-parent-input')).toHaveCount(0);

    // 只填原生币：走 Hub 的 `stakeLiquidityWithNative`（msg.value > 0 的入口），
    // 合约先把一部分原生币换成社区代币，再两侧一起质押。
    await page.getByTestId('gov-liquidity-native-input').fill('0.25');
    const quote = page.getByTestId('gov-liquidity-hub-quote');
    // 兑换方向：只填原生币时是「原生币 → 社区代币」。
    await expect(quote).toContainText('ETH 会先换成', { timeout: 30_000 });
    await expect(quote).toContainText('实际进池');
    await expect(page.getByTestId('gov-liquidity-preview-votes')).not.toHaveText('—');
    // 原生币这一侧不需要社区代币授权。
    await expect(page.getByTestId('gov-liquidity-approve-token')).toHaveText(
      '这一笔不需要代币授权',
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('gov-liquidity-submit')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('gov-liquidity-submit').click();

    await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('gov-receipt')).toContainText('流动性质押已提交');
    await expect(page.getByTestId('gov-receipt-line')).toHaveCount(2);
    await expect(page.getByTestId('gov-tx-error')).toHaveCount(0);
    await page.getByTestId('gov-receipt-close').click();
    await expect(page.getByTestId('gov-page-my-stake')).toBeVisible({ timeout: 30_000 });
  });
});
