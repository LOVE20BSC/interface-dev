import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { isolateChain, restoreMining, revertChain, snapshotChain, suspendMining } from './chain';
import { connect, installWallet, seedIdentity } from './wallet-stub';

/**
 * 治理·质押 前端线（三线校验 §3）:
 * `docs/product/three-line/gov-stake.md` §1 的理论值必须逐字出现在 `/gov` 页面上。
 *
 * 断言只读页面渲染出来的文字（规范 §7.10）：金额/份额/治理权/上限一律
 * `toHaveText` 整串精确相等，不用 `toContainText`/正则；只对非数值文案
 * （「已申请解锁」「正常质押中」这类状态标签）用 `toContainText`。
 *
 * 夹具（与理论线 §0.5 一致）:
 * - 操作账户 = anvil #4 `0x15d3…6A65`，它持有 MemberNFT #5；`seedIdentity` 直接写
 *   选择缓存，不依赖页面点选（身份 NFT 是 onlyMemberOwner 的调用主体）。
 * - C1 需要两侧资产：该账户初始没有 TestWETH，`beforeAll` 用 `deposit()` 包 2 原生币。
 * - C1→C4 共享同一成员仓位，所以按文件取一次快照（`isolateChain`）、用例串行，
 *   状态依赖用同一个文件内的连续用例表达（不逐用例回滚，否则 C2/C3/C4 的前置状态没了）。
 *
 * **链状态口径**：本文件的期望值是 §1 在 **clean bootstrap 种子**上的常量（§0: pair
 * 储备 2e23/1e20、stake 记账 LP 4472135954999579391818）。8555（套件链）与 8566（三线
 * 校验链）**同基线**（2026-11-17 13:12 基线修正，见三线文档 §0.4），所以两条链上 C2
 * 的上限、C4 的撤出总额等数字完全一致；换种子态时必须按 §1 公式重算常量。
 *
 * 本 spec 末尾同时产出 390×844 / 1280×800 × 浅色/深色 的验收截图（视口截图）。
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

/**
 * 理论线 §1 在 clean bootstrap 种子上的常量（`docs/product/three-line/gov-stake.md`
 * §3 的页面字符串就是它们的 6 位截断 + 千分位）。C2 的上限与 C4 的撤出总额都含
 * `token.totalSupply` 因子，换种子态时要按 §1 公式重算，**不在页面里读回来拼答案**
 * （规范 §7.10）。
 */
const EXPECTED = {
  seed: {
    /** 种子里 memberId 1 的票：4,472.135954e18。 */
    communityVotes: '4,472.135954',
    communityShares: '4,472.135954',
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
  },
  c2: {
    /** `boostAmount = floor(memberCap / 2)`，完整 18 位小数走用户输入。 */
    boostInput: '9571.385499991385715425',
    capBefore: '19,142.770999 TestLOVE20',
    capAfter: '9,571.385499 TestLOVE20',
    used: '9,571.385499',
    receipt: '加速质押 9,571.385499 TestLOVE20',
    communityBoost: '9,571.385499',
  },
  c3: {
    preview: '治理权 +335.410196',
    phases: '25 个阶段（约 50 分钟）',
    votes: '559.016994',
    communityVotes: '5,031.152949',
    communityShare: '11.11%',
  },
  c4: {
    /** 可撤出阶段 = Q + 26（合约条件是「当前阶段 > Q + 25」，严格大于）。 */
    // 页面把状态标题与说明放进同一块（两个 <p>），Playwright 归一化空白后是连在一起的。
    unlockNote: '已申请解锁还要再等 26 个阶段（约 52 分钟）才能撤出。',
    communityVotes: '4,472.135954',
    communityShares: '4,494.496634',
    boostAmount: '9,571.385499',
    withdrawReceipt: '已撤出 10,571.385499 TestLOVE20 + 0.499999 TestWETH',
    afterWithdrawCommunityVotes: '4,472.135954',
    afterWithdrawCommunityShares: '4,472.135954',
  },
} as const;

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  actionTimeout: 30_000,
});

test.describe.configure({ mode: 'serial', timeout: 900_000 });
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
 * 断言挖矿模式）：2026-11-17 全量 e2e 里 interval timer 与大批量 `anvil_mine`
 * 叠加，让 8555 的 anvil 在推完 C4 的约 3,100 块后卡死（链还在 LISTEN、HTTP 全超时），
 * 同链后续 spec 集体超时。暂停/恢复把这条路径变成显式、可回读的。
 */
async function mine(blocks: bigint): Promise<void> {
  if (blocks <= 0n) return;
  // 分块推（每块 240 个）：anvil 1.8.1 在一次 `anvil_mine` 里连挖 ~3,100 块会卡死
  // （进程还在 LISTEN、HTTP 全超时；2026-11-17 在 8555 与 8566 上各复现一次）。
  // 同时暂停 interval mining，避免 interval timer 与批量 mine 叠加；`restoreMining`
  // 会回读断言挖矿模式。
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

async function openGovernance(page: Page): Promise<void> {
  await installWallet(page, ACCOUNT);
  await seedIdentity(page, ACCOUNT, MEMBER_ID);
  await page.goto(`/gov${QUERY}`);
  await connect(page);
  await expect(page.getByTestId('gov-tab-stake')).toBeVisible({ timeout: 30_000 });
}

/** 授权阶梯（UX spec §4.1）：额度不够时按钮可点，成交后原地变「已授权 X」。 */
async function approveRow(page: Page, testId: string, approvedText: string): Promise<void> {
  const button = page.getByTestId(testId);
  await expect(button).toBeVisible({ timeout: 20_000 });
  if (await button.isEnabled()) await button.click();
  await expect(button).toHaveText(approvedText, { timeout: 60_000 });
}

async function fillLiquidityForm(page: Page): Promise<void> {
  await page.getByTestId('gov-liquidity-token-input').fill('1000');
  await page.getByTestId('gov-liquidity-parent-input').fill('1');
  await page.getByTestId('gov-liquidity-phases-input').fill('10');
}

test.beforeAll(() => {
  // C1 要存两侧：账户 #4 的 TestWETH 初始为 0，先包 2 原生币（用不完的部分留在钱包）。
  const balance = bigintOf(castCall(weth, 'balanceOf(address)(uint256)', ACCOUNT));
  if (balance === 0n) castSend(weth, 'deposit()', [], ['--value', '2ether']);
});

test.describe('治理·质押 前端线（理论线 §1 / §3）', () => {
  test('用例 C1 之前：加速卡锁定态、表单预估与授权阶梯', async ({ page }) => {
    await openGovernance(page);
    await expect(page.getByTestId('gov-tab-stake')).toHaveAttribute('aria-selected', 'true');

    // 没有流动性质押时加速卡是明确的「先完成流动性质押」，不出半成品表单。
    await expect(page.getByTestId('gov-boost-locked')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('gov-boost-locked')).toContainText('先完成流动性质押');
    await expect(page.getByTestId('gov-boost-card')).toHaveCount(0);

    // 未知不渲染 0（硬规则 4）：还没填金额时治理权是「—」。
    await expect(page.getByTestId('gov-liquidity-preview-votes')).toHaveText('—');
    await expect(page.getByTestId('gov-liquidity-phases-input')).toHaveValue('1');
    await expect(page.getByTestId('gov-liquidity-submit')).toBeDisabled();

    // 「我的质押」空态：不是 0 值表格；社区数据卡在空态也要可见（owner 2026-11-17）。
    await page.getByTestId('gov-tab-mine').click();
    await expect(page.getByTestId('gov-mine-empty')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('gov-mine-empty')).toContainText('这个身份 NFT 还没有质押。');
    await expect(page.getByTestId('gov-my-votes')).toHaveCount(0);
    await expect(page.getByTestId('gov-community-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('gov-community-votes')).toHaveText(EXPECTED.seed.communityVotes);
    await expect(page.getByTestId('gov-community-shares')).toHaveText(
      EXPECTED.seed.communityShares,
    );

    await page.getByTestId('gov-tab-stake').click();
    await fillLiquidityForm(page);
    // §3 C1：预计获得治理权增量 +223.606797；两侧按池子比例实际存入 1,000 + 0.5。
    await expect(page.getByTestId('gov-liquidity-preview-votes')).toHaveText(
      EXPECTED.c1.votesAdded,
      { timeout: 20_000 },
    );
    await expect(page.getByTestId('gov-liquidity-optimal')).toHaveText(EXPECTED.c1.optimal);
    await expect(page.getByTestId('gov-liquidity-submit')).toBeDisabled();
    await expect(page.getByTestId('gov-liquidity-approve-token')).toHaveText('授权 TestLOVE20');
    await expect(page.getByTestId('gov-liquidity-approve-parent')).toHaveText('授权 TestWETH');

    // 授权阶梯：两个授权都就绪之前主按钮必须禁用（一笔质押要同时扣两侧）。
    await approveRow(page, 'gov-liquidity-approve-token', '已授权 TestLOVE20');
    await expect(page.getByTestId('gov-liquidity-submit')).toBeDisabled();
    await approveRow(page, 'gov-liquidity-approve-parent', '已授权 TestWETH');
    await expect(page.getByTestId('gov-liquidity-submit')).toBeEnabled();
  });

  test('用例 C1：流动性质押 1,000 TestLOVE20 + 0.5 TestWETH / 10 阶段 → 治理权 223.606797', async ({
    page,
  }) => {
    await openGovernance(page);
    await fillLiquidityForm(page);
    await expect(page.getByTestId('gov-liquidity-preview-votes')).toHaveText(
      EXPECTED.c1.votesAdded,
      { timeout: 20_000 },
    );

    // 上一用例已授权；这里再走一次阶梯函数，保证单独跑本用例时也能自足。
    await approveRow(page, 'gov-liquidity-approve-token', '已授权 TestLOVE20');
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

    await page.getByTestId('gov-tab-mine').click();
    await expect(page.getByTestId('gov-my-votes')).toHaveText(EXPECTED.c1.myVotes, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('gov-my-shares')).toHaveText(EXPECTED.c1.myShares);
    await expect(page.getByTestId('gov-my-boost')).toHaveText('0');
    // 10 阶段 × 120 s = 约 20 分钟（文案只写「约」）。
    await expect(page.getByTestId('gov-my-phases')).toHaveText(EXPECTED.c1.myPhases);
    // §3 显示规则边界 1/2：只截断不四舍五入，不显示成 1,000 / 0.5。
    await expect(page.getByTestId('gov-my-token-amount')).toHaveText(EXPECTED.c1.myTokenAmount);
    await expect(page.getByTestId('gov-my-parent-amount')).toHaveText(EXPECTED.c1.myParentAmount);
    await expect(page.getByTestId('gov-my-boost-amount')).toHaveCount(0);
    await expect(page.getByTestId('gov-unlock-state')).toContainText('正常质押中');

    await expect(page.getByTestId('gov-community-votes')).toHaveText(EXPECTED.c1.communityVotes);
    await expect(page.getByTestId('gov-community-shares')).toHaveText(EXPECTED.c1.communityShares);
    await expect(page.getByTestId('gov-community-share')).toHaveText(EXPECTED.c1.communityShare);
    await expect(page.getByTestId('gov-community-boost')).toHaveText('0');
  });

  test('用例 C2：加速质押一半上限 → 加速份额 9,571.385499，治理权不变', async ({ page }) => {
    await openGovernance(page);
    // 默认页签要等 member ready 才落定（有质押 → 「我的质押」）；先等它出现，再切「质押」。
    await expect(page.getByTestId('gov-mine-card')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('gov-tab-stake').click();
    await expect(page.getByTestId('gov-tab-stake')).toHaveAttribute('aria-selected', 'true');
    // C1 之后加速卡解锁：本阶段还能加速 = memberCap。
    await expect(page.getByTestId('gov-boost-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('gov-boost-cap')).toHaveText(EXPECTED.c2.capBefore, {
      timeout: 20_000,
    });
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

    // 剩余额度 = memberCap − boostShares；与加速份额 6 位截断后同串（§3 边界 3）。
    await expect(page.getByTestId('gov-boost-cap')).toHaveText(EXPECTED.c2.capAfter, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('gov-boost-used')).toHaveText(EXPECTED.c2.used);

    await page.getByTestId('gov-tab-mine').click();
    await expect(page.getByTestId('gov-my-boost')).toHaveText(EXPECTED.c2.used, {
      timeout: 20_000,
    });
    // 加速质押不产生治理权：我的治理权必须仍是 C1 的 223.606797。
    await expect(page.getByTestId('gov-my-votes')).toHaveText(EXPECTED.c1.myVotes);
    await expect(page.getByTestId('gov-my-boost-amount')).toHaveText(EXPECTED.c2.used);
    await expect(page.getByTestId('gov-community-boost')).toHaveText(EXPECTED.c2.communityBoost);
  });

  test('用例 C3：增加承诺解锁期 10 → 25 → 治理权 559.016994', async ({ page }) => {
    await openGovernance(page);
    await page.getByTestId('gov-tab-mine').click();
    await expect(page.getByTestId('gov-my-phases')).toHaveText(EXPECTED.c1.myPhases, {
      timeout: 20_000,
    });

    await page.getByTestId('gov-increase-phases-button').click();
    await page.getByTestId('gov-increase-phases-input').fill('25');
    // 弹层预览的是「这一笔新增的治理权」= shares × (25 − 10)。
    await expect(page.getByTestId('gov-increase-preview')).toHaveText(EXPECTED.c3.preview, {
      timeout: 20_000,
    });
    await page.getByTestId('gov-increase-phases-submit').click();

    await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('gov-receipt')).toContainText('承诺解锁期已增加');
    const lines = page.getByTestId('gov-receipt-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toHaveText('承诺解锁期现在是 25 个阶段。');
    await expect(lines.nth(1)).toHaveText(EXPECTED.c3.preview);
    await page.getByTestId('gov-receipt-close').click();

    await expect(page.getByTestId('gov-my-phases')).toHaveText(EXPECTED.c3.phases, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('gov-my-votes')).toHaveText(EXPECTED.c3.votes);
    await expect(page.getByTestId('gov-community-votes')).toHaveText(EXPECTED.c3.communityVotes);
    await expect(page.getByTestId('gov-community-share')).toHaveText(EXPECTED.c3.communityShare);
  });

  test('用例 C4：申请解锁 → 到期 → 撤出 10,571.385499 TestLOVE20 + 0.499999 TestWETH', async ({
    page,
  }) => {
    await openGovernance(page);
    await page.getByTestId('gov-tab-mine').click();
    await expect(page.getByTestId('gov-my-votes')).toHaveText(EXPECTED.c3.votes, {
      timeout: 20_000,
    });
    await settleAtPhaseStart();

    await page.getByTestId('gov-unstake-button').click();
    await page.getByTestId('gov-unstake-confirm').click();
    await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('gov-receipt')).toContainText('已申请解锁');
    await expect(page.getByTestId('gov-receipt-line')).toHaveText(
      '治理权已经清零，等承诺解锁期走完就可以撤出。',
    );
    await page.getByTestId('gov-receipt-close').click();

    // 申请解锁后：治理权与加速份额立刻清零，份额/本金不动（§1 ④）。
    await expect(page.getByTestId('gov-my-votes')).toHaveText('0', { timeout: 20_000 });
    await expect(page.getByTestId('gov-my-boost')).toHaveText('0');
    await expect(page.getByTestId('gov-my-shares')).toHaveText(EXPECTED.c1.myShares);
    await expect(page.getByTestId('gov-my-boost-amount')).toHaveText(EXPECTED.c4.boostAmount);
    // 解锁状态：剩余阶段 = Q + 26 − 当前阶段（Q 为申请阶段；页面按「还要再等 N 个
    // 阶段才能撤出」的含端计数）。settleAtPhaseStart() 已保证两者同一阶段。
    await expect(page.getByTestId('gov-unlock-state')).toHaveText(EXPECTED.c4.unlockNote, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('gov-waiting-withdraw')).toBeVisible();
    await expect(page.getByTestId('gov-waiting-withdraw')).toBeDisabled();
    await expect(page.getByTestId('gov-community-votes')).toHaveText(EXPECTED.c4.communityVotes);
    await expect(page.getByTestId('gov-community-shares')).toHaveText(EXPECTED.c4.communityShares);
    await expect(page.getByTestId('gov-community-share')).toHaveText('0%');

    // 到期判定：当前阶段 > unlockRequestPhase + promisedWaitingPhases，即
    // 第一个可撤阶段 = Q + 26（25 个承诺阶段走完后的下一阶段）。推到该阶段起点。
    const unlockRequestPhase = readMemberStake()[3] ?? 0n;
    const withdrawPhase = unlockRequestPhase + 26n;
    const target = phaseStartBlock(withdrawPhase) + 1n;
    await mine(target - currentBlock());

    await page.reload();
    await connect(page);
    await expect(page.getByTestId('gov-mine-card')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-unlock-state')).toContainText('可以撤出了');
    const withdraw = page.getByTestId('gov-withdraw-button');
    await expect(withdraw).toBeVisible({ timeout: 30_000 });
    await expect(withdraw).toBeEnabled();

    await withdraw.click();
    await page.getByTestId('gov-withdraw-confirm').click();
    await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('gov-receipt')).toContainText('已撤出');
    // 实际到账 = LP 折算 999.999999 + 加速质押退还（§1 ⑤ 的 boost 返还）。
    await expect(page.getByTestId('gov-receipt-line')).toHaveText(EXPECTED.c4.withdrawReceipt);
    await page.getByTestId('gov-receipt-close').click();

    // 撤出后 memberStake 整条删除 → 「我的质押」回到空态，不是 0 值表格；
    // 社区数据卡在空态仍可见（owner 2026-11-17），两块同时存在。
    await expect(page.getByTestId('gov-mine-empty')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-mine-empty')).toContainText('这个身份 NFT 还没有质押。');
    await expect(page.getByTestId('gov-my-votes')).toHaveCount(0);
    await expect(page.getByTestId('gov-community-card')).toBeVisible();
    await expect(page.getByTestId('gov-community-votes')).toHaveText(
      EXPECTED.c4.afterWithdrawCommunityVotes,
    );
    await expect(page.getByTestId('gov-community-shares')).toHaveText(
      EXPECTED.c4.afterWithdrawCommunityShares,
    );
    expect(readMemberStake().every((value) => value === 0n)).toBe(true);
  });
});

/**
 * 验收截图：390×844 / 1280×800 × 浅色/深色，三种状态各一张。视口截图（不带 fullPage），
 * 与仓库其它页面一致：固定底栏不会被拼进页面中部，也不会压住主按钮。
 * - `gov-stake-*`：流动性质押的「预计获得治理权 + 授权 + 主按钮」一屏，下方紧接加速质押卡的核心数字
 * - `gov-mine-*`：我的质押（治理权/份额/解锁状态）与社区治理数据
 * - `gov-boost-locked-*`：没有流动性质押时的加速卡锁定态
 *
 * 截图态由链上夹具摆好（approve + stakeLiquidity），再重新加载页面读取；数字口径本身
 * 已由上面的前端线用例逐字断言。每档组合独立快照，拍完回滚，所以四档互不影响。
 */
test.describe('治理·质押 验收截图', () => {
  const VIEWPORTS = [
    { key: 'mobile', width: 390, height: 844 },
    { key: 'desktop', width: 1280, height: 800 },
  ] as const;
  const THEMES = ['light', 'dark'] as const;

  /** C1 的链上夹具：两侧各授权，再按池子比例存入（页面随后重新读取）。 */
  function stakeLiquidityFixture(): void {
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
    // 存入这一笔把两侧额度都用掉了；截图态要展示「已授权 / 已授权 + 主按钮可点」，
    // 所以按页面这一笔需要的额度再授权一次（只为截图态，不参与任何数字断言）。
    castSend(tokenAddress, 'approve(address,uint256)', [stake, '1000000000000000000000']);
    castSend(weth, 'approve(address,uint256)', [stake, '1000000000000000000000']);
  }

  async function prepare(
    page: Page,
    theme: 'light' | 'dark',
    width: number,
    height: number,
  ): Promise<void> {
    await page.setViewportSize({ width, height });
    await page.addInitScript((nextTheme: string) => {
      window.localStorage.setItem('love20:theme', nextTheme);
    }, theme);
    await openGovernance(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  }

  /** 视口截图（不带 fullPage）：图片就是用户看到的一屏。 */
  async function shoot(page: Page, name: string): Promise<void> {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: resolve(SHOTS, `gov-${name}.png`), animations: 'disabled' });
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

  test('三种状态 × 四档视口/主题', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const combo = await snapshotChain();
        try {
          await prepare(page, theme, viewport.width, viewport.height);

          // 状态 1：没有流动性质押 → 加速卡锁定。
          const locked = page.getByTestId('gov-boost-locked');
          await expect(locked).toBeVisible({ timeout: 20_000 });
          await scrollTo(page, 'gov-boost-locked', viewport.key === 'mobile' ? 120 : 200);
          await shoot(page, `boost-locked-${theme}-${viewport.key}`);

          // 状态 2/3：打一笔 C1 进链，重新加载后表单再填一遍。
          stakeLiquidityFixture();
          await page.reload();
          await connect(page);
          await expect(page.getByTestId('gov-mine-card')).toBeVisible({ timeout: 30_000 });
          await page.getByTestId('gov-tab-stake').click();
          await fillLiquidityForm(page);
          await expect(page.getByTestId('gov-liquidity-preview-votes')).toHaveText(
            EXPECTED.c1.votesAdded,
            { timeout: 20_000 },
          );
          await expect(page.getByTestId('gov-boost-cap')).toHaveText(EXPECTED.c2.capBefore, {
            timeout: 20_000,
          });
          // 截图里两个授权都已是「已授权」、主按钮可点（用户视图：数字看过了，可以提交）。
          await expect(page.getByTestId('gov-liquidity-approve-token')).toHaveText(
            '已授权 TestLOVE20',
          );
          await expect(page.getByTestId('gov-liquidity-approve-parent')).toHaveText(
            '已授权 TestWETH',
          );
          await expect(page.getByTestId('gov-liquidity-submit')).toBeEnabled();

          // 移动端一屏装不下两张卡：定格在「预计获得治理权 + 授权 + 主按钮」这一段，
          // 下方紧接加速质押卡的「本阶段还能加速 / 已加速」两行；桌面端一屏够高，
          // 从两侧金额输入一直拍到加速卡的核心数字。
          await scrollTo(
            page,
            viewport.key === 'mobile' ? 'gov-liquidity-preview-votes' : 'gov-liquidity-token-input',
            viewport.key === 'mobile' ? 96 : 68,
          );
          await shoot(page, `stake-${theme}-${viewport.key}`);

          // 状态 3：我的质押（治理权 / 份额 / 解锁状态）与社区治理数据。
          await page.getByTestId('gov-tab-mine').click();
          await expect(page.getByTestId('gov-my-votes')).toHaveText(EXPECTED.c1.myVotes, {
            timeout: 20_000,
          });
          await expect(page.getByTestId('gov-my-shares')).toHaveText(EXPECTED.c1.myShares);
          await expect(page.getByTestId('gov-my-phases')).toHaveText(EXPECTED.c1.myPhases);
          await expect(page.getByTestId('gov-community-shares')).toHaveText(
            EXPECTED.c1.communityShares,
          );
          await scrollTo(page, 'gov-mine-card', viewport.key === 'mobile' ? 40 : 64);
          await shoot(page, `mine-${theme}-${viewport.key}`);
        } finally {
          await revertChain(combo);
        }
      }
    }
  });
});
