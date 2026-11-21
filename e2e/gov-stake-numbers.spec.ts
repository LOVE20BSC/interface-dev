import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { formatUnits } from 'viem';
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
 * - `/stake/liquidity`      流动性质押（智能模式默认**关闭**，两侧按池子比例联动）
 * - `/stake/staketoken`     质押代币（加速激励质押）
 * - `/stake/unstake`        申请解锁（增加承诺解锁期 / 申请解锁 / 撤出）
 * - `/stake/liquid`         流动性质押数据（只读）
 * 以及 `/vote` 等旧版页面的占位。「我的流动性质押」明细卡在 2026-11-18 23:20 从
 * `/gov` 移到 `/me` 的「质押资产」tab（`me-tab-stake`），`/gov` 只留摘要卡与入口。
 *
 * owner 2026-11-19 的这一轮改版（本文件相应重写）：
 * - **路由改名** `/stake/stakelp` → `/stake/liquidity`（owner 2026-11-19）；
 *   `gov-section` 对旧路径做 `<Navigate replace>` 并保留 `?symbol=`（本文件有兼容断言）。
 * - **父币是 WETH → 直接用原生币**（`stake-liquidity-panel`）：不再渲染「父币」输入框
 *   （`gov-liquidity-parent-input` count 0），改渲染原生币输入（testid 仍是
 *   `gov-liquidity-native-input`，label/aria-label 只是「原生币」——symbol 只出现在右侧
 *   小字，余额行也只写「余额 X」）；两种模式都走 Hub（`stakeLiquidityWithNative`），
 *   只有一笔社区代币授权（`…-approve-parent` count 0）。输入框顺序改为
 *   「原生币（父币）在上、社区代币在下」，用 DOM 顺序断言。
 * - **智能模式默认关闭**：初始 `aria-checked=false`（两侧都填、按池子比例联动）；
 *   要测单币（Hub 兑换）必须先点开关打开。C1 因此不再「先关开关」。
 * - **交易回执改成自下而上的 Sheet**（`gov-gate`）：`gov-receipt` 与
 *   `gov-receipt-close` 的 testid 不变，但现在落在 `role="dialog"` 里。
 * - **流动性质押页删卡/并卡**：删 `gov-page-my-stake`（`gov-my-*` 在该页不再出现），
 *   「提示」+「治理权的作用」合并为 `gov-rules-card`（`gov-tips`/`gov-intro` 不再出现），
 *   顺序是 承诺解锁期卡 → 质押卡 → 规则卡。
 * - **加速激励质押页**：新增 `gov-boost-about`（标题 + 两段说明）。顺序随仓位变化：
 *   还没有加速质押时在摘要卡**之前**；`boostShares > 0` 时挪到页面**最后**（表单之后）。
 *   删 `gov-tips`，`gov-accelerated-summary` 不再有 capNote 说明行；回执同样走底部 Sheet。
 * - **`/me` 质押资产卡**：标题不再是「我的流动性质押」，第一行是身份 `NFT #5` + 名字；
 *   信息按钮 `me-stake-info` 改成弹**底部 Sheet**（`role="dialog"`），面板与行 testid 不变。
 * - **申请解锁页**（`/stake/unstake`）：页面标题改为「申请解锁」；未申请解锁时不再渲染
 *   `gov-unstake-unlock-state`（只有「已申请解锁 / 可撤出」才出现）。
 * - **极小数字**： *   `formatTinyPercent` 不设位数上限（多小都显示）；`formatTokenAmount` 对极小非零金额
 *   会显示全部有效位（如 `0.0000001`，1 wei → `0.000000000000000001`）。
 *   本种子数据下占比/金额仍是 4.76% / 100% / 0% / 999.9999 这类常规值，断言不变。
 * - **P2 读失败**：承诺解锁期参数读失败时渲染 `gov-liquidity-phases-error` + 重试按钮
 *   （不再是永久「读取中…」）——正常态本文件断言它 count 0。
 *
 * 断言只读页面渲染出来的文字（规范 §7.10）：金额/份额/治理权/上限一律 `toHaveText`
 * 整串精确相等，不用 `toContainText`/正则；只对非数值文案（状态标签、说明句）用
 * `toContainText`。智能模式是新增交互，没有理论线数值（Hub 报价不在 §1 的手算范围），
 * 所以那一条只断言结构性文案与「不是未知」，不写数字。
 *
 * 数字显示规范（owner 2026-11-19，`formatTokenAmount`）：小数位按数量级自适应——
 * |值| < 1 → 6 位、1–999 → 4 位、1e3–1e6 → 2 位、≥1e6 → 0 位，一律截断不四舍五入。
 * 所以本文件的期望值按此规则从理论线常量派生：223.606797 → 223.6067、
 * 4,472.135954 → 4,472.13、9,571.385499 → 9,571.38、999.999999 → 999.9999。
 *
 * 夹具（与理论线 §0.5 一致）:
 * - 操作账户 = anvil #4 `0x15d3…6A65`，它持有 MemberNFT #5；`seedIdentity` 直接写
 *   选择缓存，不依赖页面点选（身份 NFT 是 onlyMemberOwner 的调用主体）。
 * - C1 走原生币（父币 = WETH）入口，不需要 WETH 余额；`beforeAll` 把 2 原生币包成
 *   WETH 只为「验收截图」里用直接质押夹具摆仓位（`stakeFixture` 走 `Stake.stakeLiquidity`）。
 * - C1→C4 共享同一成员仓位：按文件取一次快照（`isolateChain`）、用例串行；智能模式
 *   用例排在 C4 撤出之后（仓位回到空），所以不需要额外回滚。
 * - 期望值 = §1 在 clean bootstrap 种子上的常量；8555 与 8566 同基线（2026-11-17
 *   13:12 基线修正，见三线文档 §0.4），所以两条链上数字一致。
 *
 * 截图：7 个状态 × 390×844 / 1280×800 × 浅色/深色 = 28 张视口图（`page.screenshot`
 * 不带 fullPage，固定底栏不会被拼进页面中部）。
 */

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');
const RPC_URL = process.env.E2E_ANVIL_RPC ?? 'http://127.0.0.1:8555';
const SYMBOL = 'TestLOVE20';
const PARENT_SYMBOL = 'TestWETH';
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
    /** 种子里 memberId 1 的票：4,472.135954e18（§0.3）；量级 1e3–1e6 → 2 位小数。 */
    communityVotes: '4,472.13',
    communityShares: '4,472.13',
    communityTotalLp: '4,472.13',
    communityWithdrawableLp: '4,472.13',
    communityPrincipal: '200,000',
    communityBurned: '0',
    communityFeeRatio: '0.25%',
    /** 按 memberId 1 查询（种子仓位）：治理权与占比（它是种子里唯一的质押者）。 */
    queryVotes: '4,472.13',
    queryShare: '100%',
  },
  c1: {
    /**
     * owner 2026-11-18 12:58 修正：**首次质押可以自选任意承诺解锁期**（MIN..MAX）。
     * 所以 C1 恢复单步：表单里选 10 个阶段 → shares 22360679774997896964、
     * 治理权 +223.6067（4 位小数截断）；提交后选择器消失（保持当前值），由顶部卡单独调整。
     *
     * owner 2026-11-19：父币是 WETH 时没有父币输入框，改填原生币；关掉智能模式后两侧
     * 仍按池子比例联动（1000 社区代币 ↔ 0.5 原生币），但走 Hub → 不再有
     * `gov-liquidity-optimal`，文案换成 Hub 报价（quoteNoSwap + quotePrepared），
     * 授权只有社区代币一笔。回执数值不变（链上事件口径）。
     */
    votesAdded: '+223.6067',
    quoteNoSwap: '两侧正好配平，不需要兑换。',
    /**
     * Hub 报价的第二行「实际进池 A + B」用的是父代币（WETH 包装合约）的符号，不是
     * 输入框上的「原生币 ETH」——这是当前实现的文案口径，断言按页面实际文本。
     */
    quotePrepared: '实际进池 1,000 TestLOVE20 + 0.5 TestWETH',
    /** 关智能模式后填 1000 社区代币，原生币侧按池子比例联动的值。 */
    nativeSynced: '0.5',
    receiptVotes: '治理权 +223.6067',
    receiptShares: '流动性质押份额 +22.3606',
    myVotes: '223.6067',
    myShares: '22.3606',
    myPhases: '10 个阶段',
    /** 首页「我的」摘要里的两个占比（fixture 没有加速份额 → 0%）。 */
    mySharePercent: '4.76%',
    myBoostPercent: '0%',
    myTokenAmount: '999.9999',
    myParentAmount: '0.499999',
    /** /me 质押资产卡第一行是身份 NFT 编号（owner 2026-11-19 换掉「我的流动性质押」标题）。 */
    memberLabel: 'NFT #5',
    communityVotes: '4,695.74',
    communityShares: '4,494.49',
    communityShare: '4.76%',
    communityPrincipal: '201,000',
  },
  c2: {
    /** `boostAmount = floor(memberCap / 2)`，完整 18 位小数走用户输入。 */
    boostInput: '9571.385499991385715425',
    capBefore: '19,142.77 TestLOVE20',
    capAfter: '9,571.38 TestLOVE20',
    used: '9,571.38',
    /** 加速前剩余额度 = memberCap（已用 0）。 */
    remaining: '19,142.77',
    receipt: '加速质押 9,571.38 TestLOVE20',
    phasesCard: '10 个阶段',
    /** owner 2026-11-19：加速质押页顶部新增的作用说明卡（删掉了原来的提示卡）。 */
    boostAboutTitle: '加速激励质押的作用',
    boostAboutBody:
      '治理激励分两部分：投票激励和加速激励。加速激励质押不产生治理权，但会提高你在加速激励里的份额，让治理激励发得更快、更多。',
    /** `gov-accelerated-summary` 的 capNote 已不再渲染（owner 2026-11-19）。 */
    capNoteRemoved: '加速份额在本阶段投票时被链上记入这一轮；上限随治理权占比变化。',
  },
  c3: {
    preview: '治理权 +335.4101',
    phases: '25 个阶段',
    receiptNote: '承诺解锁期现在是 25 个阶段。',
    votes: '559.0169',
  },
  c4: {
    /**
     * 可撤出阶段 = Q + 26（合约条件是「当前阶段 > Q + 25」，严格大于）。
     * 等待状态只在 `gov-unstake-unlock-state` 摘要卡里（owner 2026-11-19）：
     * 标题「已申请解锁」+ 下面这句剩余阶段说明。
     */
    unlockNote: '还要再等 26 个阶段（约 52 分钟）才能撤出。',
    withdrawReceipt: '已撤出 10,571.38 TestLOVE20 + 0.499999 TestWETH',
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
 * 池子当前储备（`Stake.pairAddress` → `pair.getReserves` + `pair.token0`）。
 *
 * 两侧联动的期望值不能写死：C1 之前的池子是 2000:1（1000 代币 ↔ 0.5），但「智能模式
 * 单币」用例提交过一笔后储备已经变了，联动值要按当时的储备算。
 */
function readPoolReserves(): { readonly reserveToken: bigint; readonly reserveParent: bigint } {
  const pair = castCall(stake, 'pairAddress(address)(address)', tokenAddress).trim();
  const reserves = castCall(pair, 'getReserves()(uint112,uint112,uint32)');
  const token0 = castCall(pair, 'token0()(address)').trim();
  const reserve0 = tupleLine(reserves, 0);
  const reserve1 = tupleLine(reserves, 1);
  return token0.toLowerCase() === tokenAddress.toLowerCase()
    ? { reserveToken: reserve0, reserveParent: reserve1 }
    : { reserveToken: reserve1, reserveParent: reserve0 };
}

/**
 * 与 `stake-liquidity-panel` 的联动同一套整数算法（向下取整）：
 * `amount × 目标侧储备 / 本侧储备`，再按 18 位小数展开（两侧都是 18 位）。
 */
function linkedAmount(amountWei: bigint, fromReserve: bigint, toReserve: bigint): string {
  return formatUnits((amountWei * toReserve) / fromReserve, 18);
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
 * 卡片从上到下的顺序（owner 2026-11-19 流动性质押页重排）。用 viewport 坐标比较，
 * 不依赖像素高度：同一次滚动状态下取各自 boundingBox 的 y 即可。
 */
async function expectTopOrder(page: Page, testIds: readonly string[]): Promise<void> {
  const tops: number[] = [];
  for (const testId of testIds) {
    const box = await page.getByTestId(testId).boundingBox();
    if (box === null) throw new Error(`${testId} has no bounding box`);
    tops.push(box.y);
  }
  for (let index = 1; index < tops.length; index += 1) {
    expect(tops[index]!).toBeGreaterThan(tops[index - 1]!);
  }
}

/**
 * 两个输入框的 DOM 先后（owner 2026-11-19：原生币/父币在上、社区代币在下）。
 *
 * 用 `compareDocumentPosition` 而不是坐标：坐标会随滚动/键盘弹起漂移，DOM 顺序是
 * 布局契约本身。返回 `true` 表示 `first` 在 `second` 前面。
 */
async function domOrder(page: Page, first: string, second: string): Promise<boolean | null> {
  return page.evaluate(
    (ids: readonly string[]) => {
      const [firstId, secondId] = ids;
      const firstElement =
        firstId === undefined ? null : document.querySelector(`[data-testid="${firstId}"]`);
      const secondElement =
        secondId === undefined ? null : document.querySelector(`[data-testid="${secondId}"]`);
      if (firstElement === null || secondElement === null) return null;
      const position = firstElement.compareDocumentPosition(secondElement);
      return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    },
    [first, second],
  );
}

/**
 * 智能模式开关旁边那句模式说明。父币是 WETH 时两种模式各有专属文案
 * （`onHintNative` / `offHintNative`），所以切模式时文案必须跟着变。
 */
async function smartHint(page: Page): Promise<string> {
  return page
    .getByTestId('gov-liquidity-smart-mode')
    .evaluate((element) => element.parentElement?.innerText ?? '');
}

/**
 * 两侧联动依赖「池子储备」这次链上读：读得慢时，先填的那一侧不会立刻联动
 * （联动只在 onChange 里算一次）。这里「清空 + 重填」直到另一侧确实跟着变。
 *
 * 注意必须先 `fill('')` 再 `fill(value)`：Playwright 对「值没变」的输入不会派发
 * input 事件，同值重填不会让 React 重算联动（2026-11-19 实测：同值重试 30s 仍为空）。
 */
async function fillAndExpectLinked(
  page: Page,
  fromTestId: string,
  fromValue: string,
  toTestId: string,
  toValue: string,
): Promise<void> {
  await expect(async () => {
    const input = page.getByTestId(fromTestId);
    await input.fill('');
    await input.fill(fromValue);
    await expect(page.getByTestId(toTestId)).toHaveValue(toValue, { timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
}

/**
 * 关掉智能模式时用当前代币输入同步原生币；储备未就绪时这一下会同步不出值。
 * 保险做法：先确保开关在「开」，再点一次「关」，直到原生币侧拿到期望值。
 */
async function turnSmartModeOffAndExpectNative(page: Page, expectedNative: string): Promise<void> {
  const toggle = page.getByTestId('gov-liquidity-smart-mode');
  await expect(async () => {
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
    await toggle.click();
    await expect(page.getByTestId('gov-liquidity-native-input')).toHaveValue(expectedNative, {
      timeout: 1_500,
    });
  }).toPass({ timeout: 30_000 });
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
 * 验收截图：7 个状态 × 390×844 / 1280×800 × 浅色/深色 = 28 张视口图。
 * - `gov-home-mine-*`        治理首页「我的」：我的治理资产摘要（有仓位）
 * - `gov-home-community-*`   治理首页「社区」：社区总治理权 + 「投票中的行动」入口 + 2×2 统计
 * - `me-stake-*`             我的 → 质押资产：流动性质押份额 + 加速激励质押量（有仓位）
 * - `stake-lp-*`             流动性质押：智能模式单币（原生币输入在上 + Hub 报价；页尾规则卡）
 * - `stake-token-*`          质押代币：加速激励质押作用卡 + 我的加速质押 + 加速表单
 * - `unstake-*`              取消质押：我的治理资产 + 两个动作（未申请解锁 → 无解锁状态卡）
 * - `gov-verify-placeholder-*` 旧版占位页（/verify；2026-11-21 起 /vote 与 /submit 已是真实页面）
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

  test('七态 × 四档视口/主题', async ({ page }) => {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const suffix = `${theme}-${viewport.key}`;

        // A. 有仓位：首页「我的」/ 首页「社区」/ 我的「质押资产」/ 质押代币 / 取消质押。
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

          // 「我的流动性质押」明细已从治理首页挪到「我的」→ 质押资产（owner 2026-11-18 23:20）。
          await page.goto(`/me${QUERY}`);
          await connect(page);
          await page.getByTestId('me-tab-stake').click();
          await expect(page.getByTestId('me-stake-shares')).toBeVisible({ timeout: 30_000 });
          await scrollTo(page, 'me-stake-card', 64);
          await shoot(page, `me-stake-${suffix}`);

          await page.goto(`/stake/staketoken${QUERY}`);
          await connect(page);
          await expect(page.getByTestId('gov-boost-cap')).toHaveText(EXPECTED.c2.capBefore, {
            timeout: 30_000,
          });
          // 页面最上面是「调整承诺解锁期」卡（staketoken 页也有），下一屏是我的加速质押。
          await expect(page.getByTestId('gov-phases-card-value')).toHaveText(
            EXPECTED.c2.phasesCard,
          );
          await scrollTo(page, 'gov-phases-card', 64);
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

        // B. 首次质押（无仓位）：默认关闭智能模式（两侧联动），表单含承诺解锁期选择器 +
        // Hub 报价；owner 2026-11-19 智能模式默认关闭，截图拍的就是这个默认态。
        const clean = await snapshotChain();
        try {
          await prepare(page, theme, viewport.width, viewport.height, '/stake/liquidity');
          await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
            'aria-checked',
            'false',
            { timeout: 30_000 },
          );
          // owner 2026-11-18 20:05：承诺解锁期改为下拉列表（阶段数 + 预估时间）。
          await expect(page.getByTestId('gov-liquidity-phases')).toBeVisible();
          await expect(page.getByTestId('gov-liquidity-phases-select')).toHaveValue('1');
          await expect(page.getByTestId('gov-liquidity-phases-note')).toHaveCount(0);
          // 默认关闭：填社区代币后原生币侧自动联动（储备读得慢时重填一次，同真实用户）。
          await fillAndExpectLinked(
            page,
            'gov-liquidity-token-input',
            '1000',
            'gov-liquidity-native-input',
            EXPECTED.c1.nativeSynced,
          );
          await expect(page.getByTestId('gov-liquidity-hub-quote')).toContainText('实际进池', {
            timeout: 30_000,
          });
          await expect(page.getByTestId('gov-liquidity-preview-votes')).not.toHaveText('—');
          // owner 2026-11-19：原生币（父币）输入在最上面 → 截图从它取一屏。取景用 100px
          // 而不是 64px：把输入框顶边压在固定头部（约 64px）下面，「原生币 ETH」标签才
          // 不会被头部盖住；这一屏能看到原生币 + 社区代币 + 承诺解锁期 + Hub 报价 + 预计治理权。
          await scrollTo(page, 'gov-liquidity-native-input', 100);
          await shoot(page, `stake-lp-${suffix}`);
        } finally {
          await revertChain(clean);
        }

        // C. 旧版占位页（2026-11-21：/vote 与 /submit 已接入真实页面，占位样例改用 /verify）。
        const placeholder = await snapshotChain();
        try {
          await prepare(page, theme, viewport.width, viewport.height, '/verify');
          await expect(page.getByTestId('gov-placeholder')).toBeVisible({ timeout: 30_000 });
          await scrollTo(page, 'gov-placeholder', 96);
          await shoot(page, `gov-verify-placeholder-${suffix}`);
        } finally {
          await revertChain(placeholder);
        }
      }
    }
  });
});

test.describe('治理域 前端线（理论线 §1 / §3）', () => {
  test('C1 之前：首页空态 / 社区数据 / 治理权查询 / 智能模式开关 / 占位页', async ({ page }) => {
    // 首页「我的」：没有仓位 → 我的治理资产空态 + 成为治理者引导；行动入口只在「社区」tab。
    await openPage(page, '/gov');
    await expect(page.getByTestId('gov-my-assets')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-become-governor')).toBeVisible();
    await expect(page.getByTestId('gov-my-votes')).toHaveCount(0);
    await expect(page.getByTestId('gov-entry-vote')).toHaveCount(0);

    // 首页「社区」：社区总治理权头条 + 单个「投票中的行动」按钮 + 2×2 统计（§0.3：全部 LP 记在 memberId 1）。
    await page.getByTestId('gov-home-tab-community').click();
    await expect(page.getByTestId('gov-community-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('gov-community-votes')).toHaveText(EXPECTED.seed.communityVotes);
    await expect(page.getByTestId('gov-community-shares')).toHaveText(
      EXPECTED.seed.communityShares,
    );
    await expect(page.getByTestId('gov-community-total-lp')).not.toHaveText('—');
    await expect(page.getByTestId('gov-community-burned')).toHaveText(
      EXPECTED.seed.communityBurned,
    );
    await expect(page.getByTestId('gov-entry-vote')).toBeVisible();
    // owner 2026-11-19：社区总治理权下方不再有「本阶段」说明行。
    await expect(page.getByText('本阶段', { exact: true })).toHaveCount(0);

    // 治理权查询：按身份 NFT 编号查种子仓位 memberId 1（纯 view，不发交易）。
    // owner 2026-11-19：输入即查询，查询按钮不再禁用、也不需要先点它。
    const queryInput = page.getByTestId('gov-query-input');
    await queryInput.fill('1');
    await expect(page.getByTestId('gov-query-votes')).toHaveText(EXPECTED.seed.queryVotes, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('gov-query-share')).toHaveText(EXPECTED.seed.queryShare);
    // 结果卡带 NFT ID / 名称 / 当前持有人地址与备注（旧版截图的结构）。
    await expect(page.getByTestId('gov-query-nft-id')).toHaveText('#1');
    await expect(page.getByTestId('gov-query-nft-name')).not.toHaveText('读不到名称');
    await expect(page.getByTestId('gov-query-holder')).toBeVisible();
    await expect(page.getByTestId('gov-query-target-address')).toBeVisible();
    await expect(page.getByTestId('gov-query-note')).toContainText('治理权按本阶段有效值统计');
    // 名称模式（owner 2026-11-18 23:20：去掉地址查询，改成 ID / 名称两种）：从结果卡读出
    // 链上名称，切到名称模式后输入名称（300 ms 防抖后自动解析），治理权 / 占比 / NFT ID
    // 必须与按 ID 查询逐字一致。
    const chainName = (await page.getByTestId('gov-query-nft-name').innerText()).trim();
    expect(chainName.length).toBeGreaterThan(0);
    expect(chainName).not.toBe('读不到名称');
    await page.getByTestId('gov-query-mode-name').click();
    await expect(queryInput).toHaveAttribute('placeholder', '输入身份 NFT 名称');
    await queryInput.fill(chainName);
    await expect(page.getByTestId('gov-query-votes')).toHaveText(EXPECTED.seed.queryVotes, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('gov-query-share')).toHaveText(EXPECTED.seed.queryShare);
    await expect(page.getByTestId('gov-query-nft-id')).toHaveText('#1');
    // 名称模式空输入：没有查询目标 → 结果区整个不出现，查询按钮仍可点。
    await queryInput.fill('');
    await expect(page.getByTestId('gov-query-result')).toHaveCount(0);
    await expect(page.getByTestId('gov-query-empty')).toHaveCount(0);
    await expect(page.getByTestId('gov-query-submit')).toBeEnabled();
    // 非法输入即时给原因；查询按钮不再禁用，只是没有目标 → 不渲染结果区与空态。
    await page.getByTestId('gov-query-mode-id').click();
    await queryInput.fill('abc');
    await expect(page.getByTestId('gov-query-invalid')).toContainText('整数编号');
    await expect(page.getByTestId('gov-query-result')).toHaveCount(0);
    await expect(page.getByTestId('gov-query-empty')).toHaveCount(0);
    await expect(page.getByTestId('gov-query-submit')).toBeEnabled();

    // 完整社区口径（可撤出 LP / 累计本金 / 手续费比例）在 /stake/liquid，首页只放四个数。
    await page.goto(`/stake/liquid${QUERY}`);
    await expect(page.getByTestId('gov-community-withdrawable-lp')).toHaveText(
      EXPECTED.seed.communityWithdrawableLp,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('gov-community-principal')).toHaveText(
      EXPECTED.seed.communityPrincipal,
    );
    await expect(page.getByTestId('gov-community-fee-ratio')).toHaveText(
      EXPECTED.seed.communityFeeRatio,
    );

    // 流动性质押（owner 2026-11-19 路由改名 /stake/stakelp → /stake/liquidity；
    // 开发阶段不做旧路径兼容，旧路径直接 404）。
    await page.goto(`/stake/liquidity${QUERY}`);
    await expect(page.getByTestId('gov-liquidity-card')).toBeVisible({ timeout: 30_000 });
    // 智能模式默认关闭；父币是 WETH → 输入框直接用原生币（label/aria-label 去重成「原生币」，
    // symbol 只在右侧小字出现一次，余额行只写「余额 X」）。
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    const nativeInput = page.getByTestId('gov-liquidity-native-input');
    await expect(nativeInput).toBeVisible();
    await expect(nativeInput).toHaveAttribute('aria-label', '原生币');
    await expect(page.getByTestId('gov-liquidity-token-input')).toHaveAttribute(
      'aria-label',
      '社区代币',
    );
    await expect(page.getByTestId('gov-liquidity-parent-input')).toHaveCount(0);
    // owner 2026-11-19：原生币（父币）在上、社区代币在下（DOM 顺序契约）。
    expect(await domOrder(page, 'gov-liquidity-native-input', 'gov-liquidity-token-input')).toBe(
      true,
    );
    await expect(page.getByTestId('gov-liquidity-preview-votes')).toHaveText('—');
    // 默认关闭：说明是「两侧自动按池子比例联动」。
    expect(await smartHint(page)).toContain('两侧自动按池子比例联动');
    // owner 2026-11-18 12:58：首次质押可以自选承诺解锁期——表单里有选择器（默认最小值）。
    await expect(page.getByTestId('gov-liquidity-phases')).toBeVisible();
    // P2（owner 2026-11-19）：承诺解锁期参数正常读到时不渲染读失败卡。
    await expect(page.getByTestId('gov-liquidity-phases-error')).toHaveCount(0);
    const phaseSelect = page.getByTestId('gov-liquidity-phases-select');
    await expect(phaseSelect).toHaveValue('1');
    // 每个选项都带预估时长：10 阶段 ≈ 20 分钟，100 阶段 ≈ 3.3 小时（120 s/阶段）。
    await expect(phaseSelect).toContainText('10 个阶段 · 约 20 分钟');
    await expect(phaseSelect).toContainText('100 个阶段 · 约 3.3 小时');
    // 首次质押没有「保持当前值」说明行；空仓位也没有「调整承诺解锁期」卡。
    await expect(page.getByTestId('gov-liquidity-phases-note')).toHaveCount(0);
    await expect(page.getByTestId('gov-phases-card')).toHaveCount(0);
    // 默认两侧都填：改一侧，另一侧立刻按池子比例联动（原生币这侧自动算好）。
    await fillAndExpectLinked(
      page,
      'gov-liquidity-token-input',
      '1000',
      'gov-liquidity-native-input',
      EXPECTED.c1.nativeSynced,
    );
    // 走 Hub → 没有「按池子比例实际存入…」行，改成 Hub 报价两行（不兑换 + 实际进池）。
    await expect(page.getByTestId('gov-liquidity-optimal')).toHaveCount(0);
    const quote = page.getByTestId('gov-liquidity-hub-quote');
    await expect(quote).toContainText(EXPECTED.c1.quoteNoSwap, { timeout: 20_000 });
    await expect(quote).toContainText(EXPECTED.c1.quotePrepared);
    await fillAndExpectLinked(
      page,
      'gov-liquidity-native-input',
      '1',
      'gov-liquidity-token-input',
      '2000',
    );
    await expect(quote).toContainText('实际进池 2,000 TestLOVE20 + 1 TestWETH');
    // 打开智能模式 = 单币：说明切到「只填一侧也行」，清掉原生币后只填社区代币走兑换。
    await page.getByTestId('gov-liquidity-smart-mode').click();
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(await smartHint(page)).toContain('只填一侧也行');
    await expect(nativeInput).toBeVisible();
    await expect(page.getByTestId('gov-liquidity-parent-input')).toHaveCount(0);
    await nativeInput.fill('');
    await page.getByTestId('gov-liquidity-token-input').fill('1000');
    await expect(quote).toContainText('会先换成', { timeout: 20_000 });
    await page.getByTestId('gov-liquidity-token-input').fill('');
    await nativeInput.fill('');
    // owner 2026-11-19：本页「提示」与「治理权的作用」合并成一张规则卡，两张旧卡都不再渲染。
    await expect(page.getByTestId('gov-rules-card')).toBeVisible();
    await expect(page.getByTestId('gov-tips')).toHaveCount(0);
    await expect(page.getByTestId('gov-intro')).toHaveCount(0);
    await expect(page.getByTestId('gov-page-my-stake')).toHaveCount(0);

    // 质押代币：没有流动性质押时是明确的「先完成流动性质押」卡。
    await page.goto(`/stake/staketoken${QUERY}`);
    await expect(page.getByTestId('gov-stake-token-gate')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-stake-token-gate')).toContainText('先完成流动性质押');
    await expect(page.getByTestId('gov-boost-card')).toHaveCount(0);
    // 没有流动性质押时也不渲染作用说明卡；旧「提示」卡已删。
    await expect(page.getByTestId('gov-boost-about')).toHaveCount(0);
    await expect(page.getByTestId('gov-tips')).toHaveCount(0);

    // 申请解锁（原「取消质押」）：页面标题改名（owner 2026-11-19）；空态是「我的治理资产」卡。
    await page.goto(`/stake/unstake${QUERY}`);
    await expect(page.getByRole('heading', { level: 1, name: '申请解锁' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('gov-unstake-empty')).toBeVisible();
    await expect(page.getByTestId('gov-unstake-assets')).toHaveCount(0);

    // 流动性质押数据（只读）：空态文案 + 社区数据面板。
    await page.goto(`/stake/liquid${QUERY}`);
    await expect(page.getByTestId('gov-liquid-mine')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-liquid-mine')).toContainText('这个社区还没有流动性质押。');
    await expect(page.getByTestId('gov-community-votes')).toHaveText(EXPECTED.seed.communityVotes);

    // 旧版占位页：标题 + 一句说明 + 两个下一步（不编造数据）。
    // 2026-11-21：/vote 与 /submit 已接入真实页面，占位样例改用仍是占位的 /verify。
    await page.goto(`/verify${QUERY}`);
    await expect(page.getByTestId('gov-placeholder')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-placeholder')).toContainText('验证');
    await expect(page.getByTestId('gov-placeholder')).toContainText('即将上线');
  });

  test('用例 C1：流动性质押（默认两侧联动，填 1,000 TestLOVE20 自动联动 0.5 原生币 / 10 阶段）→ 治理权 223.6067', async ({
    page,
  }) => {
    await openPage(page, '/stake/liquidity');
    await expect(page.getByTestId('gov-liquidity-card')).toBeVisible({ timeout: 30_000 });
    // 父币是 WETH（owner 2026-11-19）：没有父币输入框，原生币输入框在上、社区代币在下。
    const nativeInput = page.getByTestId('gov-liquidity-native-input');
    await expect(nativeInput).toBeVisible();
    await expect(nativeInput).toHaveAttribute('aria-label', '原生币');
    await expect(page.getByTestId('gov-liquidity-token-input')).toHaveAttribute(
      'aria-label',
      '社区代币',
    );
    await expect(page.getByTestId('gov-liquidity-parent-input')).toHaveCount(0);
    expect(await domOrder(page, 'gov-liquidity-native-input', 'gov-liquidity-token-input')).toBe(
      true,
    );
    // owner 2026-11-19：智能模式默认关闭（两侧都填），不用再点开关。
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(await smartHint(page)).toContain('两侧自动按池子比例联动');
    // P2：承诺解锁期参数正常读到 → 没有读失败卡。
    await expect(page.getByTestId('gov-liquidity-phases-error')).toHaveCount(0);
    // owner 2026-11-19：填社区代币 → 原生币侧按池子比例联动成 0.5（父币没有输入框了）。
    await fillAndExpectLinked(
      page,
      'gov-liquidity-token-input',
      '1000',
      'gov-liquidity-native-input',
      EXPECTED.c1.nativeSynced,
    );
    // 首次质押可以自选承诺解锁期（本链 1–100），这里从下拉里选 10。
    await expect(page.getByTestId('gov-liquidity-phases')).toBeVisible();
    await expect(page.getByTestId('gov-liquidity-phases-select')).toHaveValue('1');
    await page.getByTestId('gov-liquidity-phases-select').selectOption('10');

    // 走 Hub：没有「按池子比例实际存入…」行，改由报价两行给「不兑换 + 实际进池」，
    // 进池数量与旧的直接质押一致（1,000 社区代币 + 0.5 原生币 → 0.5 WETH 记账）。
    await expect(page.getByTestId('gov-liquidity-optimal')).toHaveCount(0);
    const quote = page.getByTestId('gov-liquidity-hub-quote');
    await expect(quote).toContainText(EXPECTED.c1.quoteNoSwap, { timeout: 20_000 });
    await expect(quote).toContainText(EXPECTED.c1.quotePrepared);
    await expect(page.getByTestId('gov-liquidity-preview-votes')).toHaveText(
      EXPECTED.c1.votesAdded,
    );
    await expect(page.getByTestId('gov-liquidity-submit')).toBeDisabled();

    // 只有一笔授权（社区代币 → Hub）；原生币不需要授权，父币授权行不渲染。
    await expect(page.getByTestId('gov-liquidity-approve-token')).toHaveCount(1);
    await expect(page.getByTestId('gov-liquidity-approve-parent')).toHaveCount(0);
    await approveRow(page, 'gov-liquidity-approve-token', '已授权 TestLOVE20');
    await expect(page.getByTestId('gov-liquidity-submit')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('gov-liquidity-submit').click();

    // 回执改成自下而上的 Sheet（owner 2026-11-19）：testid 不变，但落在 role="dialog" 里。
    await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('dialog').getByTestId('gov-receipt')).toBeVisible();
    // 标题在 Sheet 头上（卡片内 showTitle=false），标题断言落在 dialog 上。
    await expect(page.getByRole('dialog')).toContainText('流动性质押已提交');
    const lines = page.getByTestId('gov-receipt-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toHaveText(EXPECTED.c1.receiptVotes);
    await expect(lines.nth(1)).toHaveText(EXPECTED.c1.receiptShares);
    await page.getByTestId('gov-receipt-close').click();
    await expect(page.getByTestId('gov-receipt')).toHaveCount(0);

    // 提交后已有仓位：表单里的选择器消失（承诺解锁期保持当前值），改成说明行 + 顶部调整卡。
    await expect(page.getByTestId('gov-liquidity-phases')).toHaveCount(0);
    await expect(page.getByTestId('gov-liquidity-phases-note')).toContainText(
      '已有质押：承诺解锁期保持 10 个阶段',
    );
    await expect(page.getByTestId('gov-phases-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('gov-phases-card-value')).toHaveText(EXPECTED.c1.myPhases);

    // owner 2026-11-19：本页删掉「我的流动性质押」卡（明细只在 /me 的质押资产 tab），
    // 「提示」与「治理权的作用」合并成一张规则卡；这些旧 testid 在本页都不再渲染。
    await expect(page.getByTestId('gov-page-my-stake')).toHaveCount(0);
    await expect(page.getByTestId('gov-my-votes')).toHaveCount(0);
    await expect(page.getByTestId('gov-my-shares')).toHaveCount(0);
    await expect(page.getByTestId('gov-my-phases')).toHaveCount(0);
    await expect(page.getByTestId('gov-my-token-amount')).toHaveCount(0);
    await expect(page.getByTestId('gov-my-parent-amount')).toHaveCount(0);
    await expect(page.getByTestId('gov-my-unlock-state')).toHaveCount(0);
    await expect(page.getByTestId('gov-tips')).toHaveCount(0);
    await expect(page.getByTestId('gov-intro')).toHaveCount(0);
    await expect(page.getByTestId('gov-rules-card')).toBeVisible();
    await expect(page.getByTestId('gov-rules-card')).toContainText('治理权的作用与提示');
    // owner 2026-11-19 卡片顺序：承诺解锁期 → 质押表单 → 规则卡（本页只有这三张）。
    await expectTopOrder(page, ['gov-phases-card', 'gov-liquidity-card', 'gov-rules-card']);

    // 首页「我的」：2×2 摘要 + 两个质押入口 + 铸造治理激励（owner 2026-11-18 20:05 截图版）。
    await page.goto(`/gov${QUERY}`);
    await expect(page.getByTestId('gov-my-votes')).toHaveText(EXPECTED.c1.myVotes, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('gov-my-phases-summary')).toHaveText(EXPECTED.c1.myPhases);
    await expect(page.getByTestId('gov-my-share')).toHaveText(EXPECTED.c1.mySharePercent);
    await expect(page.getByTestId('gov-my-boost-share')).toHaveText(EXPECTED.c1.myBoostPercent);
    await expect(page.getByTestId('gov-my-rewards-link')).toBeVisible();
    await page.getByTestId('gov-home-tab-community').click();
    await expect(page.getByTestId('gov-community-votes')).toHaveText(EXPECTED.c1.communityVotes, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('gov-community-shares')).toHaveText(EXPECTED.c1.communityShares);
    await expect(page.getByTestId('gov-entry-vote')).toBeVisible();
    // 「我的流动性质押」明细卡已从治理首页移到「我的」→「质押资产」tab（owner 2026-11-18 23:20）。
    await page.goto(`/me${QUERY}`);
    await connect(page);
    await page.getByTestId('me-tab-stake').click();
    await expect(page.getByTestId('me-stake-card')).toBeVisible({ timeout: 30_000 });
    // owner 2026-11-19：卡标题不再是「我的流动性质押」，第一行是身份 NFT 编号 + 名字。
    await expect(page.getByTestId('me-stake-card')).toContainText(EXPECTED.c1.memberLabel);
    await expect(page.getByTestId('me-stake-card')).toContainText(/Testdev-member-\d+/);
    await expect(page.getByTestId('me-stake-card')).not.toContainText('我的流动性质押');
    await expect(page.getByTestId('me-stake-shares')).toHaveText(EXPECTED.c1.myShares);
    await expect(page.getByTestId('me-stake-boost')).toHaveText('0');
    // 信息面板改成底部 Sheet（owner 2026-11-19）：面板与行 testid 不变，落在 role="dialog" 里。
    await page.getByTestId('me-stake-info').click();
    await expect(page.getByRole('dialog').getByTestId('me-stake-info-panel')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId('me-stake-info-shares')).toHaveText(EXPECTED.c1.myShares);
    await expect(page.getByTestId('me-stake-info-token')).toHaveText(
      `${EXPECTED.c1.myTokenAmount} ${SYMBOL}`,
    );
    await expect(page.getByTestId('me-stake-info-parent')).toHaveText(
      `${EXPECTED.c1.myParentAmount} ${PARENT_SYMBOL}`,
    );
    await expect(page.getByTestId('me-stake-info-boost')).toHaveCount(0);
    // Sheet 的关闭按钮（aria-label「关闭」）收起面板。
    await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click();
    await expect(page.getByTestId('me-stake-info-panel')).toHaveCount(0);
    // 右上角是解锁动作链接（未申请解锁 → 「申请解锁」），不是按钮。
    const stakeAction = page.getByTestId('me-stake-action-link');
    await expect(stakeAction).toHaveText('申请解锁');
    await expect(stakeAction).toHaveAttribute('href', /\/stake\/unstake\?symbol=TestLOVE20$/);
    // 完整社区口径（含我的占比 / 累计本金）在 /stake/liquid。
    await page.goto(`/stake/liquid${QUERY}`);
    await expect(page.getByTestId('gov-community-share')).toHaveText(EXPECTED.c1.communityShare, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('gov-community-principal')).toHaveText(
      EXPECTED.c1.communityPrincipal,
    );
  });

  test('用例 C2：质押代币（加速质押一半上限）→ 加速份额 9,571.38，治理权不变', async ({ page }) => {
    await openPage(page, '/stake/staketoken');
    // owner 2026-11-19：加速质押页顶部新增「加速激励质押的作用」卡（标题 + 两段说明）。
    await expect(page.getByTestId('gov-boost-about')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-boost-about')).toContainText(EXPECTED.c2.boostAboutTitle);
    await expect(page.getByTestId('gov-boost-about')).toContainText(EXPECTED.c2.boostAboutBody);
    await expect(page.getByTestId('gov-accelerated-summary')).toBeVisible({ timeout: 30_000 });
    // owner 2026-11-19：旧「提示」卡在本页已删；加速摘要里的 capNote 也不再渲染。
    await expect(page.getByTestId('gov-tips')).toHaveCount(0);
    await expect(page.getByTestId('gov-accelerated-summary')).not.toContainText(
      EXPECTED.c2.capNoteRemoved,
    );
    // 页面顺序：承诺解锁期卡 → 作用说明 → 加速摘要（说明在摘要上面）。
    await expectTopOrder(page, ['gov-phases-card', 'gov-boost-about', 'gov-accelerated-summary']);
    // 已有流动性质押 → 页面最上面也有「调整承诺解锁期」卡（值 = 当前 10 个阶段）。
    await expect(page.getByTestId('gov-phases-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('gov-phases-card-value')).toHaveText(EXPECTED.c2.phasesCard);
    await expect(page.getByTestId('gov-accelerated-valid')).toHaveText('0');
    await expect(page.getByTestId('gov-accelerated-used')).toHaveText('0');
    await expect(page.getByTestId('gov-accelerated-remaining')).toHaveText(EXPECTED.c2.remaining);
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
    await expect(page.getByRole('dialog').getByTestId('gov-receipt')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('加速质押已提交');
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

    // owner 2026-11-19：已有加速质押（boostShares > 0）时作用说明卡挪到页面最后。
    // 重新进页（从链上读仓位），确认顺序：摘要 → 加速表单 → 作用说明。
    await page.goto(`/stake/staketoken${QUERY}`);
    await connect(page);
    await expect(page.getByTestId('gov-boost-about')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-accelerated-summary')).toBeVisible();
    await expectTopOrder(page, ['gov-accelerated-summary', 'gov-boost-card', 'gov-boost-about']);

    // 加速质押不产生治理权：首页「我的」的治理权仍是 C1 的 223.6067。
    await page.goto(`/gov${QUERY}`);
    await expect(page.getByTestId('gov-my-votes')).toHaveText(EXPECTED.c1.myVotes, {
      timeout: 30_000,
    });
    // 加速份额现在占社区有效加速份额的 100%（社区只有这一个仓位）。
    await expect(page.getByTestId('gov-my-boost-share')).toHaveText('100%');
    // 加速激励质押量已随「我的流动性质押」明细移到「我的」→「质押资产」（owner 2026-11-18 23:20）。
    await page.goto(`/me${QUERY}`);
    await connect(page);
    await page.getByTestId('me-tab-stake').click();
    await expect(page.getByTestId('me-stake-card')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('me-stake-boost')).toHaveText(EXPECTED.c2.used);
  });

  test('用例 C3：流动性质押页顶部「承诺解锁期」卡 10 → 25 → 治理权 559.0169', async ({ page }) => {
    await openPage(page, '/stake/liquidity');
    await expect(page.getByTestId('gov-phases-card')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-phases-card-value')).toHaveText(EXPECTED.c1.myPhases);
    // owner 2026-11-19：本页的「我的流动性质押」明细卡已删（`gov-my-votes` 不再出现），
    // 所以「治理权 223.6067」这个前置值改到 /gov 的 2×2 摘要上复核（见下面收尾处）。
    await page.getByTestId('gov-phases-card-adjust').click();
    await page.getByTestId('gov-phases-input').fill('25');
    // 弹层预览的是「这一笔新增的治理权」= shares × (25 − 10)。
    await expect(page.getByTestId('gov-phases-preview')).toHaveText(EXPECTED.c3.preview, {
      timeout: 20_000,
    });
    await page.getByTestId('gov-phases-submit').click();

    // owner 2026-11-19：回执改成自下而上的 Sheet（先关「调整承诺解锁期」弹层，再弹回执）。
    await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('dialog').getByTestId('gov-receipt')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('承诺解锁期已提高');
    const lines = page.getByTestId('gov-receipt-line');
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toHaveText(EXPECTED.c3.receiptNote);
    await expect(lines.nth(1)).toHaveText(EXPECTED.c3.preview);
    await page.getByTestId('gov-receipt-close').click();

    // 顶部卡同步到 25 个阶段（时间估算另起一行：约 50 分钟）。
    await expect(page.getByTestId('gov-phases-card-value')).toHaveText(EXPECTED.c3.phases);
    // 治理权与承诺解锁期在 /gov「我的」2×2 摘要上复核（本页已无明细卡）。
    await page.goto(`/gov${QUERY}`);
    await connect(page);
    await expect(page.getByTestId('gov-my-votes')).toHaveText(EXPECTED.c3.votes, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('gov-my-phases-summary')).toHaveText(EXPECTED.c3.phases);
  });

  test('用例 C4：申请解锁 → 到期 → 撤出 10,571.38 TestLOVE20 + 0.499999 TestWETH', async ({
    page,
  }) => {
    await openPage(page, '/stake/unstake');
    await expect(page.getByTestId('gov-unstake-votes')).toHaveText(EXPECTED.c3.votes, {
      timeout: 30_000,
    });
    // owner 2026-11-19：取消质押页不再提供「提高承诺解锁期」（改在各质押页顶部卡片），
    // 只保留申请解锁 / 撤出两个动作。
    await expect(page.getByTestId('gov-unstake-increase-phases-button')).toHaveCount(0);
    // owner 2026-11-19：还没申请解锁时不渲染解锁状态卡（只有「已申请解锁 / 可撤出」才出现）。
    await expect(page.getByTestId('gov-unstake-unlock-state')).toHaveCount(0);
    await settleAtPhaseStart();

    await page.getByTestId('gov-unstake-unstake-button').click();
    await page.getByTestId('gov-unstake-unstake-confirm').click();
    // 回执走底部 Sheet（owner 2026-11-19）。
    await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('dialog').getByTestId('gov-receipt')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('已申请解锁');
    await expect(page.getByTestId('gov-receipt-line')).toHaveText(
      '治理权已经清零，等承诺解锁期走完就可以撤出。',
    );
    await page.getByTestId('gov-receipt-close').click();

    // 申请解锁后：治理权与加速份额立刻清零，份额/本金不动（§1 ④）。
    await expect(page.getByTestId('gov-unstake-votes')).toHaveText('0', { timeout: 20_000 });
    await expect(page.getByTestId('gov-unstake-boost')).toHaveText('0');
    await expect(page.getByTestId('gov-unstake-shares')).toHaveText(EXPECTED.c1.myShares);
    await expect(page.getByTestId('gov-unstake-boost-amount')).toHaveText(EXPECTED.c2.used);
    // owner 2026-11-19：等待状态只在 `gov-unstake-unlock-state` 摘要卡里（不再有单独的
    // 等待按钮 / 说明行），标题「已申请解锁」+ 剩余阶段说明各出现一次。
    await expect(page.getByTestId('gov-unstake-unlock-state')).toContainText('已申请解锁');
    await expect(page.getByTestId('gov-unstake-waiting-withdraw')).toHaveCount(0);
    await expect(page.getByTestId('gov-unstake-unlock-note')).toHaveCount(0);
    // 剩余阶段 = Q + 26 − 当前阶段（Q 为申请阶段，含端计数）；settle 已保证同一阶段。
    await expect(page.getByTestId('gov-unstake-unlock-state')).toContainText(
      EXPECTED.c4.unlockNote,
      {
        timeout: 20_000,
      },
    );

    // 已申请解锁时治理页「我的」不再渲染四项统计，只给状态与「查看解锁进度」。
    await page.goto(`/gov${QUERY}`);
    await connect(page);
    await expect(page.getByTestId('gov-my-unlocking')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-my-unlocking')).toContainText('已申请解锁');
    await expect(page.getByTestId('gov-my-unlocking-link')).toHaveText('查看解锁进度');
    await expect(page.getByTestId('gov-my-unlocking-link')).toHaveAttribute(
      'href',
      /\/stake\/unstake\?symbol=TestLOVE20$/,
    );
    await expect(page.getByTestId('gov-my-votes')).toHaveCount(0);
    await expect(page.getByTestId('gov-my-shares')).toHaveCount(0);
    await expect(page.getByTestId('gov-my-phases-summary')).toHaveCount(0);
    await expect(page.getByTestId('gov-my-share')).toHaveCount(0);
    await expect(page.getByTestId('gov-my-boost-share')).toHaveCount(0);

    // 「我的」→「质押资产」：解锁中分支（右上角变「查看解锁进度」+ 剩余阶段提示）；
    // 加速激励质押量读的是已质押的加速量（boostShares），申请解锁不清零（撤出才清）。
    await page.goto(`/me${QUERY}`);
    await connect(page);
    await page.getByTestId('me-tab-stake').click();
    await expect(page.getByTestId('me-stake-unlock-note')).toContainText('已申请解锁', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('me-stake-action-link')).toHaveText('查看解锁进度');
    await expect(page.getByTestId('me-stake-shares')).toHaveText(EXPECTED.c1.myShares);
    await expect(page.getByTestId('me-stake-boost')).toHaveText(EXPECTED.c2.used);
    await page.goto(`/stake/unstake${QUERY}`);
    await connect(page);

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
    await expect(page.getByRole('dialog').getByTestId('gov-receipt')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('已撤出');
    // 实际到账 = LP 折算 999.9999（显示截断）+ 加速质押退还（§1 ⑤ 的 boost 返还）。
    await expect(page.getByTestId('gov-receipt-line')).toHaveText(EXPECTED.c4.withdrawReceipt);
    await page.getByTestId('gov-receipt-close').click();

    // 撤出后 memberStake 整条删除 → 「我的治理资产」回到空态，不是 0 值表格。
    await expect(page.getByTestId('gov-unstake-empty')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-unstake-empty')).toContainText('这个身份 NFT 还没有质押。');
    await expect(page.getByTestId('gov-unstake-votes')).toHaveCount(0);
    expect(readMemberStake().every((value) => value === 0n)).toBe(true);

    // 撤出后「我的」→「质押资产」回到空态（不是 0 值表格），并给出去质押入口。
    await page.goto(`/me${QUERY}`);
    await connect(page);
    await page.getByTestId('me-tab-stake').click();
    await expect(page.getByTestId('me-stake-empty')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('me-stake-empty')).toContainText('这个身份 NFT 还没有质押。');
  });

  test('新增：智能模式单币质押（只填社区代币，Hub 报价 → 授权 → 提交）', async ({ page }) => {
    await openPage(page, '/stake/liquidity');
    await expect(page.getByTestId('gov-liquidity-card')).toBeVisible({ timeout: 30_000 });
    // owner 2026-11-19：智能模式默认关闭，单币用例先点开关打开。
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.getByTestId('gov-liquidity-smart-mode').click();
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(await smartHint(page)).toContain('只填一侧也行');
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
    await expect(page.getByRole('dialog').getByTestId('gov-receipt')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('流动性质押已提交');
    await expect(page.getByTestId('gov-receipt-line')).toHaveCount(2);
    // 修复前只填社区代币会 revert（ZeroNativeTokenAmount）；这条保证不再出现失败提示。
    await expect(page.getByTestId('gov-tx-error')).toHaveCount(0);
    await page.getByTestId('gov-receipt-close').click();
    // 提交后已有仓位：本页顶部出现承诺解锁期卡；旧的「我的流动性质押」卡已删（owner
    // 2026-11-19），明细只在 /me 的质押资产 tab 里。
    await expect(page.getByTestId('gov-phases-card')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-page-my-stake')).toHaveCount(0);
    await expect(page.getByTestId('gov-rules-card')).toBeVisible();

    // 再切一次开关：父币是 WETH → 输入框始终是原生币（父币输入框永不出现），开关的实际
    // 效果是「两侧联动」：关掉后社区代币 → 原生币自动按池子比例补齐。
    // 上面这笔经 Hub 兑换+质押后池子储备已经变了（不再是 C1 前的 2000:1），所以期望值按
    // 「当前链上储备」推，而不是写死 0.5。
    const reserves = readPoolReserves();
    const linkedNative = linkedAmount(
      1000n * 10n ** 18n,
      reserves.reserveToken,
      reserves.reserveParent,
    );
    const linkedToken = linkedAmount(
      25n * 10n ** 16n,
      reserves.reserveParent,
      reserves.reserveToken,
    );
    // 提交后表单保留 1000；关掉智能模式会用当前代币输入同步出原生币侧。
    await turnSmartModeOffAndExpectNative(page, linkedNative);
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(await smartHint(page)).toContain('两侧自动按池子比例联动');
    const nativeInput = page.getByTestId('gov-liquidity-native-input');
    await expect(nativeInput).toBeVisible();
    await expect(page.getByTestId('gov-liquidity-parent-input')).toHaveCount(0);
    // 改原生币侧 → 社区代币侧按当前储备联动。
    await fillAndExpectLinked(
      page,
      'gov-liquidity-native-input',
      '0.25',
      'gov-liquidity-token-input',
      linkedToken,
    );
    // 再切回智能模式：改社区代币不再联动原生币（单币走 Hub 报价）。
    await page.getByTestId('gov-liquidity-smart-mode').click();
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByTestId('gov-liquidity-token-input').fill('800');
    await expect(nativeInput).toHaveValue('0.25');
    await expect(page.getByTestId('gov-liquidity-parent-input')).toHaveCount(0);
  });

  test('新增：智能模式单币质押（只填原生币，Hub 报价 → 提交）', async ({ page }) => {
    await openPage(page, '/stake/liquidity');
    await expect(page.getByTestId('gov-liquidity-card')).toBeVisible({ timeout: 30_000 });
    // owner 2026-11-19：智能模式默认关闭，单币用例先点开关打开。
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'false',
      { timeout: 20_000 },
    );
    await page.getByTestId('gov-liquidity-smart-mode').click();
    await expect(page.getByTestId('gov-liquidity-smart-mode')).toHaveAttribute(
      'aria-checked',
      'true',
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
    await expect(page.getByRole('dialog').getByTestId('gov-receipt')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('流动性质押已提交');
    await expect(page.getByTestId('gov-receipt-line')).toHaveCount(2);
    await expect(page.getByTestId('gov-tx-error')).toHaveCount(0);
    await page.getByTestId('gov-receipt-close').click();
    // 提交后已有仓位：本页顶部出现承诺解锁期卡（旧的「我的流动性质押」卡已删）。
    await expect(page.getByTestId('gov-phases-card')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-page-my-stake')).toHaveCount(0);
  });
});
