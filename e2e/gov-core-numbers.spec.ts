import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createPublicClient, http, parseAbi } from 'viem';
import { ANVIL_RPC, anvilRpc, isolateChain, restoreMining, suspendMining } from './chain';
import { ACCOUNTS, connect, installWallet, seedIdentity } from './wallet-stub';

/**
 * 治理域（core：推举 / 投票 / 治理激励 / 提案激励）前端线。
 *
 * 这一轮的四组页面（路由表在 `src/pages/gov/gov-section.tsx`）不再是占位页：
 * - `/submit`                提案（core `Submit`）
 * - `/vote`                  投票（core `Vote`）
 * - `/gov/rewards`           治理激励铸造（core `Mint.mintGovReward*`）
 * - `/gov/proposal-rewards`  提案激励结算（core `Mint.proposalRewardSettlement` / `burnProposalReward`）
 *
 * 本文件跑的是**真实写链**回归：钱包是注入的 EIP-1193 stub（`e2e/wallet-stub.ts`），
 * 交易真的打进 8555 自动化链，页面上的数字全部来自链上读数——没有 mock、没有夹具数字。
 *
 * ## 链的硬边界（e2e/README.md 顶部事故记录）
 *
 * 全部读写只发生在套件自有的 8555 链上（`ANVIL_RPC` 已经过 `e2e/chain.ts` 的 8545 硬拒绝）。
 * 文件级 `isolateChain()` 取快照 / 结束回滚；本文件额外用 `anvil_mine` 推进阶段——这只允许
 * 发生在自动化链上，人工链 8545 永不触碰。
 *
 * ## 阶段时钟：为什么必须自己控制出块
 *
 * 8555 是 `intervalMining: 1`（1 块/秒），`Phase.phaseBlocks` 当前 120——**约 2 分钟就换一轮**。
 * 而 `Vote._vote` 只允许投「本轮被推举的提案」（`Submit.isSubmitted(token, round, proposalId)`，
 * `round = Phase.currentPhase()`），推举也记在当前轮。所以：
 *
 * 1. `settleFreshPhase()`：进页面之前先看本阶段还剩多少块，剩得少就 `anvil_mine` 到**下一个
 *    阶段的第 1 个块**，让推举 + 投票有完整的一轮可用（~120 s）；
 * 2. 截图段用 `suspendMining()` 冻住出块（读页面不需要出块），拍完 `restoreMining()` 回读断言，
 *    否则连拍 4 档视口/主题的时间里阶段就翻篇了，「本轮已经推举」「本轮提案」这些**当轮**状态
 *    会消失；
 * 3. 治理激励只能在**已结束**的轮次铸造（`Mint._checkSettlementRound`：`round < currentPhase`），
 *    所以投票之后必须 `mineToNextPhase()` 再打开 `/gov/rewards`。
 *
 * ## 断言纪律（规范 §7.10）
 *
 * 数值一律 `toHaveText` 整串精确相等，禁用 `toContainText` 断数字；`toContainText` 只用在
 * 状态标签 / 说明句这类非数值文案上。期望值**不手抄常量**：
 *
 * - 票数 / 治理权 / 激励金额一律用 `publicClient.readContract` 从同一条链读回，
 *   再按页面的显示规则渲染成期望字符串；
 * - 显示规则（owner 2026-11-19，`src/shared/lib/format.ts#formatTokenAmount`）：18 位小数，
 *   小数位按数量级自适应——|值| < 1 → 6 位、1–999 → 4 位、1e3–1e6 → 2 位、≥1e6 → 0 位，
 *   一律**截断不四舍五入**，整数部分千分位分组。`expectedAmount()` 是本文件里对这条规则的
 *   独立实现（故意不复用 `src/` 的格式化函数：页面格式化写错了，测试才会红）。
 * - `ceil` 口径一样从合约抄：推举门槛 `ceil(totalGovVotes * SUBMIT_MIN_RATIO / 1e18)`、
 *   提案激励门槛 `ceil(totalVoteAmount * PROPOSAL_REWARD_MIN_VOTE_RATIO / 1e18)`。
 *
 * ## 夹具
 *
 * - 操作账户 = `ACCOUNTS.withIdentity`（anvil #1 `0xf39F…2266`），它持有身份 NFT #1；
 *   种子里流动性质押记在 memberId 1 上（`SEED_LIQUIDITY_MEMBER_INDEX=0`），所以这个身份
 *   一开始就有 4,472.1359 治理权，够推举门槛（社区总治理权的 0.5%）。
 * - `seedIdentity` 直接写身份选择缓存（不依赖页面点选），`connect` 走真实的钱包连接。
 * - 提案目标地址用部署地址簿里的 `weth`（非零地址；不回调的提案不要求它有代码）。
 *
 * ## 截图（`docs/product/screenshots/`）
 *
 * 5 个状态 × 390×844 / 1280×800 × 浅色/深色 = 20 张视口图（`page.screenshot` 不带 fullPage）：
 * `gov-core-submit-submitted-*`、`gov-core-vote-voted-*`、`gov-core-rewards-mintable-*`、
 * `gov-core-rewards-minted-*`、`gov-core-proposal-rewards-eligible-*`。
 *
 * ## 没覆盖到的部分（写在这里而不是留一个假断言）
 *
 * - `gov-proposal-rewards-burn-<id>` / `gov-proposal-rewards-receipt-close`：销毁只对
 *   「未结算 + 票数 > 0 + 票数 < 门槛」的提案开放（`Mint.burnProposalReward`，票数 0 或达标时
 *   合约静默返回）。本轮只有一个提案、且它是唯一被投票的提案，票数占比 100% 必然达标，
 *   所以这一页在我们的链上状态下**结构性地**没有销毁按钮。要覆盖它需要同一轮里第二个
 *   提案 + 第二个有治理权的身份（另做质押夹具），超出本 spec 的夹具范围。
 * - `gov-rewards-load-more`：分页按钮只在「已加载轮次 > 20」时出现，要连推 20 个阶段才能触发；
 *   这里的链只推进一轮，footer 是 `gov-rewards-exhausted`（已断言）。
 * - `gov-rewards-empty`：`useGovRewards` 从 `currentPhase - 1` 往回扫，只要当前阶段 > 1 就至少
 *   有一行，所以空态在这条链上不可达（round 0 不存在）。
 */
const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');
const SYMBOL = 'TestLOVE20';
const QUERY = `?symbol=${SYMBOL}`;
/** 治理票 18 位小数（`Stake.govVotes`）。 */
const VOTE_DECIMALS = 18;
/** 合约里的 `PRECISION`（`Submit.sol:17`、`Mint.sol:14`）。 */
const PRECISION = 10n ** 18n;
/** anvil 固定账户 #1：memberId 1 的 owner。 */
const ACCOUNT = ACCOUNTS.withIdentity;
const MEMBER_ID = '1';
/** 本用例投出的票数（页面输入「票」，18 位小数展开）。 */
const VOTE_AMOUNT = 100n * 10n ** BigInt(VOTE_DECIMALS);
/** 推举的提案正文（标题的 UTF-8 字节数由 `utf8Bytes` 现算，断言计数器）。 */
const TITLE = '治理核心回归提案';
const DETAILS = '推举与投票的真实写链回归，用来核对提案 / 投票 / 激励三页的链上口径。';

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/network/anvil31337_dev/network.json'), 'utf8'),
) as {
  addresses: {
    tokenAddress: `0x${string}`;
    stake: `0x${string}`;
    vote: `0x${string}`;
    submit: `0x${string}`;
    mint: `0x${string}`;
    phase: `0x${string}`;
    weth: `0x${string}`;
  };
};

const { tokenAddress, stake, vote, submit, mint, phase, weth } = deployment.addresses;

/**
 * 只读客户端直连同一条链（`ANVIL_RPC` 与页面里烘焙的 `VITE_ANVIL_RPC` 是同一个端点，
 * 由 `playwright.config.ts` 保证）。期望值全部从这里读回来派生。
 */
const client = createPublicClient({ transport: http(ANVIL_RPC) });

const PHASE_ABI = parseAbi([
  'function currentPhase() view returns (uint256)',
  'function phaseInfo(uint256 phaseNumber) view returns (uint256 startBlock, uint256 phaseBlocks)',
]);
const STAKE_ABI = parseAbi([
  'function govVotes(address tokenAddress, uint256 round, uint256 memberId) view returns (uint256)',
  'function totalGovVotes(address tokenAddress, uint256 round) view returns (uint256)',
]);
const VOTE_ABI = parseAbi([
  'function maxVoteAmount(address tokenAddress, uint256 memberId) view returns (uint256)',
  'function voteAmountByMemberId(address tokenAddress, uint256 round, uint256 memberId) view returns (uint256)',
  'function voteAmountByProposalId(address tokenAddress, uint256 round, uint256 proposalId) view returns (uint256)',
  'function totalVoteAmount(address tokenAddress, uint256 round) view returns (uint256)',
]);
const SUBMIT_ABI = parseAbi([
  'function canSubmit(address tokenAddress, uint256 memberId) view returns (bool)',
  'function MAX_TITLE_LENGTH() view returns (uint256)',
  'function SUBMIT_MIN_RATIO() view returns (uint256)',
  'function proposalIdBySubmitterId(address tokenAddress, uint256 round, uint256 memberId) view returns (uint256)',
  'function submitInfos(address tokenAddress, uint256 round, uint256 offset, uint256 limit, bool reverse) view returns ((uint256 proposalId, uint256 submitterId)[] infos, uint256 totalCount)',
]);
const MINT_ABI = parseAbi([
  'function govReward(address tokenAddress, uint256 round) view returns (uint256)',
  'function govRewardByMemberId(address tokenAddress, uint256 round, uint256 memberId) view returns (uint256 voteReward, uint256 boostReward, bool minted)',
  'function proposalReward(address tokenAddress, uint256 round) view returns (uint256)',
  'function proposalRewardSettlement(address tokenAddress, uint256 round, uint256 proposalId) view returns (uint256 amount, uint8 status)',
  'function PROPOSAL_REWARD_MIN_VOTE_RATIO() view returns (uint256)',
]);
const TOKEN_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);

/**
 * 本文件跨用例共享的链上事实（`test.describe.configure({ mode: 'serial' })`：同一个 worker、
 * 同一个文件、同一个快照内串行）。
 *
 * - `round`：推举 + 投票实际发生的那一轮（`Phase.currentPhase()` 的读数）；
 * - `proposalId`：链上回执 / `Submit.submitInfos` 记下的提案编号（不拿表单输入冒充）；
 * - `proposalTitle`：回执里链上记下的标题。
 */
let round = 0n;
let proposalId = 0n;
let maxVoteAmount = 0n;

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  actionTimeout: 30_000,
});

test.describe.configure({ mode: 'serial', timeout: 900_000 });
isolateChain();

// ---------------------------------------------------------------------------------------------
// 期望值派生（从链上读回 + 页面的显示规则）
// ---------------------------------------------------------------------------------------------

/**
 * `formatTokenAmount` 的数量级规则（owner 2026-11-19）：整数部分决定最多保留几位小数，
 * 截断不四舍五入，整数部分千分位分组。
 */
function fractionDigitsFor(whole: bigint): number {
  if (whole >= 1_000_000n) return 0;
  if (whole >= 1_000n) return 2;
  if (whole >= 1n) return 4;
  return 6;
}

/**
 * 页面上一个 18 位小数金额的期望字符串。
 *
 * 与 `src/shared/lib/format.ts#formatTokenAmount` 同一套规则，但这里是**独立实现**：
 * 复用页面的格式化函数会让「格式化本身写错」的回归静默通过。
 */
function expectedAmount(value: bigint, decimals = VOTE_DECIMALS): string {
  if (value === 0n) return '0';
  const absolute = value < 0n ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fractionText = (absolute % base).toString().padStart(decimals, '0');
  let digits = fractionDigitsFor(whole);
  // 极小非零金额：显示到「第一个有效位 + 2 位」，绝不让 1 wei 显示成 0。
  if (absolute < base) {
    const first = fractionText.search(/[1-9]/) + 1;
    if (first > digits) digits = Math.min(decimals, first + 2);
  }
  const fraction = fractionText.slice(0, digits).replace(/0+$/, '');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction.length > 0 ? `${grouped}.${fraction}` : grouped;
}

/** `ceil(a * b / denominator)`：两个合约门槛（推举 / 提案激励）都是向上取整的 mulDiv。 */
function ceilMulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  const product = a * b;
  const quotient = product / denominator;
  return product % denominator === 0n ? quotient : quotient + 1n;
}

/** UTF-8 字节数：推举页的标题计数器按字节算（一个中文字 3 字节，`Submit.sol:264`）。 */
function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** 页面上的轮次文案（`copy.gov.vote.roundHint`）。 */
function roundLabelOf(value: bigint): string {
  return `治理第 ${value.toString()} 轮`;
}

// ---------------------------------------------------------------------------------------------
// 链上读
// ---------------------------------------------------------------------------------------------

async function readPhase(): Promise<bigint> {
  return client.readContract({ address: phase, abi: PHASE_ABI, functionName: 'currentPhase' });
}

async function readPhaseInfo(target: bigint): Promise<{ startBlock: bigint; phaseBlocks: bigint }> {
  const [startBlock, phaseBlocks] = await client.readContract({
    address: phase,
    abi: PHASE_ABI,
    functionName: 'phaseInfo',
    args: [target],
  });
  return { startBlock, phaseBlocks };
}

async function readGovVotes(target: bigint): Promise<bigint> {
  return client.readContract({
    address: stake,
    abi: STAKE_ABI,
    functionName: 'govVotes',
    args: [tokenAddress, target, BigInt(MEMBER_ID)],
  });
}

async function readTotalGovVotes(target: bigint): Promise<bigint> {
  return client.readContract({
    address: stake,
    abi: STAKE_ABI,
    functionName: 'totalGovVotes',
    args: [tokenAddress, target],
  });
}

async function readMaxVoteAmount(): Promise<bigint> {
  return client.readContract({
    address: vote,
    abi: VOTE_ABI,
    functionName: 'maxVoteAmount',
    args: [tokenAddress, BigInt(MEMBER_ID)],
  });
}

async function readVoteByMember(target: bigint): Promise<bigint> {
  return client.readContract({
    address: vote,
    abi: VOTE_ABI,
    functionName: 'voteAmountByMemberId',
    args: [tokenAddress, target, BigInt(MEMBER_ID)],
  });
}

async function readVoteByProposal(target: bigint, id: bigint): Promise<bigint> {
  return client.readContract({
    address: vote,
    abi: VOTE_ABI,
    functionName: 'voteAmountByProposalId',
    args: [tokenAddress, target, id],
  });
}

async function readTotalVoteAmount(target: bigint): Promise<bigint> {
  return client.readContract({
    address: vote,
    abi: VOTE_ABI,
    functionName: 'totalVoteAmount',
    args: [tokenAddress, target],
  });
}

/**
 * 找出「这 100 票记在哪一轮」：从当前阶段往回最多找 3 轮。
 *
 * 阶段是活的时钟（1 块/秒），极端情况下收票与读数之间可能已经换轮；按链上票数反查比
 * 「假设当前阶段就是投票那一轮」稳，也不会把一次正常的阶段推进报成页面缺陷。
 */
async function votedRound(): Promise<bigint> {
  const current = await readPhase();
  for (let candidate = current; candidate > 0n && candidate + 3n > current; candidate -= 1n) {
    if ((await readVoteByMember(candidate)) === VOTE_AMOUNT) return candidate;
  }
  throw new Error(`[gov-core] 链上找不到记着 ${expectedAmount(VOTE_AMOUNT)} 票的那一轮`);
}

async function readCanSubmit(): Promise<boolean> {
  return client.readContract({
    address: submit,
    abi: SUBMIT_ABI,
    functionName: 'canSubmit',
    args: [tokenAddress, BigInt(MEMBER_ID)],
  });
}

async function readMaxTitleLength(): Promise<bigint> {
  return client.readContract({
    address: submit,
    abi: SUBMIT_ABI,
    functionName: 'MAX_TITLE_LENGTH',
  });
}

async function readSubmitMinRatio(): Promise<bigint> {
  return client.readContract({
    address: submit,
    abi: SUBMIT_ABI,
    functionName: 'SUBMIT_MIN_RATIO',
  });
}

async function readSubmittedProposalId(target: bigint): Promise<bigint> {
  return client.readContract({
    address: submit,
    abi: SUBMIT_ABI,
    functionName: 'proposalIdBySubmitterId',
    args: [tokenAddress, target, BigInt(MEMBER_ID)],
  });
}

/** 本轮已被推举的提案（推举顺序，合约不排序）。期望值从这里取，不手抄编号。 */
async function readRoundProposalIds(target: bigint): Promise<readonly bigint[]> {
  const [infos] = await client.readContract({
    address: submit,
    abi: SUBMIT_ABI,
    functionName: 'submitInfos',
    args: [tokenAddress, target, 0n, 20n, false],
  });
  return infos.map((info) => info.proposalId);
}

async function readGovReward(target: bigint): Promise<bigint> {
  return client.readContract({
    address: mint,
    abi: MINT_ABI,
    functionName: 'govReward',
    args: [tokenAddress, target],
  });
}

async function readGovRewardByMember(
  target: bigint,
): Promise<{ voteReward: bigint; boostReward: bigint; minted: boolean }> {
  const [voteReward, boostReward, minted] = await client.readContract({
    address: mint,
    abi: MINT_ABI,
    functionName: 'govRewardByMemberId',
    args: [tokenAddress, target, BigInt(MEMBER_ID)],
  });
  return { voteReward, boostReward, minted };
}

async function readProposalReward(target: bigint): Promise<bigint> {
  return client.readContract({
    address: mint,
    abi: MINT_ABI,
    functionName: 'proposalReward',
    args: [tokenAddress, target],
  });
}

async function readProposalSettlement(
  target: bigint,
  id: bigint,
): Promise<{ amount: bigint; status: number }> {
  const [amount, status] = await client.readContract({
    address: mint,
    abi: MINT_ABI,
    functionName: 'proposalRewardSettlement',
    args: [tokenAddress, target, id],
  });
  return { amount, status };
}

async function readProposalMinVoteRatio(): Promise<bigint> {
  return client.readContract({
    address: mint,
    abi: MINT_ABI,
    functionName: 'PROPOSAL_REWARD_MIN_VOTE_RATIO',
  });
}

async function readTokenDecimals(): Promise<number> {
  const decimals = await client.readContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'decimals',
  });
  return Number(decimals);
}

async function readTokenSymbol(): Promise<string> {
  return client.readContract({ address: tokenAddress, abi: TOKEN_ABI, functionName: 'symbol' });
}

// ---------------------------------------------------------------------------------------------
// 出块控制（只作用于 8555 自动化链）
// ---------------------------------------------------------------------------------------------

/**
 * 推 `blocks` 块。大数先暂停 interval mining、推完再恢复（`restoreMining` 会回读断言挖矿模式），
 * 并按 240 块分块——anvil 1.8.1 一次连挖 ~3,100 块会假死（2026-11-17 在 8555 / 8566 各复现一次）。
 */
async function mine(blocks: bigint): Promise<void> {
  if (blocks <= 0n) return;
  const CHUNK = 240n;
  await suspendMining();
  try {
    let remaining = blocks;
    while (remaining > 0n) {
      const step = remaining > CHUNK ? CHUNK : remaining;
      await anvilRpc('anvil_mine', [`0x${step.toString(16)}`]);
      remaining -= step;
    }
  } finally {
    await restoreMining();
  }
}

/**
 * 把链推到下一个阶段的第 1 个块，返回推进前的阶段号。
 *
 * `phaseInfo(currentPhase)` 给出当前阶段的 startBlock / phaseBlocks，差值就是「到下一阶段
 * 起点还差几块」；推完 `currentPhase` 恰好 +1（不会跨多轮，期望值只按这一轮算）。
 */
async function mineToNextPhase(): Promise<bigint> {
  const before = await readPhase();
  const info = await readPhaseInfo(before);
  const block = await client.getBlockNumber();
  const toNext = info.startBlock + info.phaseBlocks - block;
  await mine(toNext);
  const after = await readPhase();
  expect(after, `推块后应当只前进一个阶段（${before.toString()} → ${after.toString()}）`).toBe(
    before + 1n,
  );
  return before;
}

/** 本阶段剩余块数（1 块/秒，约等于剩余秒数）。 */
async function blocksLeftInPhase(): Promise<bigint> {
  const current = await readPhase();
  const info = await readPhaseInfo(current);
  const block = await client.getBlockNumber();
  return info.startBlock + info.phaseBlocks - block;
}

/**
 * 保证接下来的推举 + 投票有**完整一轮**可用：本阶段剩余不足 100 块（≈100 s）就先推到下一个
 * 阶段的起点。开局门禁（空态 → 推举 → 投票）≈ 40 s，留 100 s 足够，也不至于每次白推一轮。
 */
async function settleFreshPhase(): Promise<bigint> {
  const left = await blocksLeftInPhase();
  if (left >= 100n) return readPhase();
  const before = await readPhase();
  await mine(left);
  const after = await readPhase();
  expect(after, `推进一个阶段后应当换轮（${before.toString()} → ${after.toString()}）`).toBe(
    before + 1n,
  );
  return after;
}

// ---------------------------------------------------------------------------------------------
// 页面操作
// ---------------------------------------------------------------------------------------------

async function openPage(page: Page, path: string): Promise<void> {
  await installWallet(page, ACCOUNT);
  await seedIdentity(page, ACCOUNT, MEMBER_ID);
  await page.goto(`${path}${QUERY}`);
  await connect(page);
}

/** 一个 testid 的元素顶边滚到视口 `topOffset` 处（不依赖像素高度，布局变了仍取同一块）。 */
async function scrollTo(page: Page, testId: string, topOffset: number): Promise<void> {
  await page.getByTestId(testId).evaluate((element, offset) => {
    const rect = element.getBoundingClientRect();
    window.scrollTo(0, rect.top + window.scrollY - offset);
  }, topOffset);
}

/** 提案激励页的轮次标签：卡片与内层 `<p>` 共用了同一个 testid，取 DOM 里最后那个（数值那个）。 */
function proposalRoundLabel(page: Page) {
  return page.getByTestId('gov-proposal-rewards-round').last();
}

/**
 * 把提案激励页选到目标轮次。页面默认停在最近一个已结束的轮次（`currentPhase - 1`），
 * 链在测试过程中可能又推进了一轮，所以用「上一轮」按钮一步步退回去（这也是真实交互）。
 */
async function selectProposalRound(page: Page, target: bigint): Promise<void> {
  const label = proposalRoundLabel(page);
  await expect(label).not.toHaveText('—', { timeout: 30_000 });
  for (let step = 0; step < 64; step += 1) {
    const match = /治理第 (\d+) 轮/.exec((await label.innerText()).trim());
    if (match === null || match[1] === undefined) {
      throw new Error(`[gov-core] 读不出提案激励页的轮次文案: ${await label.innerText()}`);
    }
    const shown = BigInt(match[1]);
    if (shown <= target) {
      await expect(label).toHaveText(roundLabelOf(target));
      return;
    }
    await page.getByTestId('gov-proposal-rewards-prev').click();
    await expect(label).toHaveText(roundLabelOf(shown - 1n));
  }
  throw new Error(`[gov-core] 无法把提案激励页退到${roundLabelOf(target)}`);
}

// ---------------------------------------------------------------------------------------------
// 截图
// ---------------------------------------------------------------------------------------------

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
 * 一个状态 × 4 档（浅/深 × 手机/桌面）。`assertReady` 在每次重新打开页面后重新确认状态
 * （导航会重置页面内的选择），`scrollTarget` 决定这一屏落在哪个区块上。
 */
async function captureState(
  page: Page,
  name: string,
  path: string,
  assertReady: (page: Page) => Promise<void>,
  scrollTarget: string,
): Promise<void> {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      await prepare(page, theme, viewport.width, viewport.height, path);
      await assertReady(page);
      await scrollTo(page, scrollTarget, 96);
      await shoot(page, `${name}-${theme}-${viewport.key}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 用例
// ---------------------------------------------------------------------------------------------

test.describe('治理域 core 前端线（推举 / 投票 / 治理激励 / 提案激励）', () => {
  test('用例 G1 · 治理核心：/submit 推举提案 → /vote 投 100 票（同一轮真实写链）', async ({
    page,
  }) => {
    // 先确保接下来有一整轮可用：推举与投票必须在同一个 `currentPhase` 里，否则投票会因为
    // `ProposalNotSubmitted` 整笔回滚（Vote._vote）。
    const phase = await settleFreshPhase();

    // ---- 1. /vote 开局：本轮还没有提案被推举（空态） ----
    await openPage(page, '/vote');
    await expect(page.getByTestId('gov-vote-title')).toHaveText('投票');
    await expect(page.getByTestId('gov-vote-empty')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-vote-empty')).toContainText('本轮还没有提案被推举');
    await expect(page.getByTestId('gov-vote-list')).toHaveCount(0);
    await expect(page.getByTestId('gov-vote-receipt')).toHaveCount(0);

    // 投票额度就是本轮的治理权（`Vote.maxVoteAmount` 内部读 `Stake.govVotes`）。
    maxVoteAmount = await readMaxVoteAmount();
    const govVotes = await readGovVotes(phase);
    expect(maxVoteAmount, '本轮治理权应当来自 Stake.govVotes').toBe(govVotes);
    expect(maxVoteAmount, '种子仓位应当给 memberId 1 一笔可投票的治理权').toBeGreaterThan(0n);
    await expect(page.getByTestId('gov-vote-power-max')).toHaveText(expectedAmount(maxVoteAmount), {
      timeout: 30_000,
    });
    await expect(page.getByTestId('gov-vote-power-used')).toHaveText(expectedAmount(0n));
    await expect(page.getByTestId('gov-vote-power-remaining')).toHaveText(
      expectedAmount(maxVoteAmount),
    );
    await expect(page.getByTestId('gov-vote-error')).toHaveCount(0);

    // ---- 2. /submit：资格 + 字节计数器 → 真实推举交易 → 回执 ----
    await openPage(page, '/submit');
    await expect(page.getByTestId('gov-submit-page-title')).toHaveText('提案');
    await expect(page.getByTestId('gov-submit-eligibility')).toContainText('推举资格');

    const totalGovVotes = await readTotalGovVotes(phase);
    const submitMinRatio = await readSubmitMinRatio();
    const requiredVotes = ceilMulDiv(totalGovVotes, submitMinRatio, PRECISION);
    expect(await readCanSubmit(), '种子身份（治理权 = 社区 100%）应当满足推举门槛').toBe(true);
    await expect(page.getByTestId('gov-submit-eligibility')).toContainText('这一轮可以推举');
    // 可以推举时页面不渲染「为什么不能推举」的原因行，只写门槛数字。
    await expect(page.getByTestId('gov-submit-eligibility-reason')).toHaveCount(0);
    await expect(page.getByTestId('gov-submit-eligibility-threshold')).toHaveText(
      `本轮推举门槛：${expectedAmount(requiredVotes)} 治理权`,
      { timeout: 30_000 },
    );

    const maxTitleLength = await readMaxTitleLength();
    await page.getByTestId('gov-submit-title').fill(TITLE);
    await expect(page.getByTestId('gov-submit-title-counter')).toHaveText(
      `${utf8Bytes(TITLE)} / ${maxTitleLength.toString()} 字节`,
    );
    await page.getByTestId('gov-submit-details').fill(DETAILS);
    // 目标地址用部署地址簿里的 WETH（非零；不回调的提案不要求它有代码）。
    await page.getByTestId('gov-submit-target').fill(weth);
    await expect(page.getByTestId('gov-submit-submit')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('gov-submit-submit').click();

    // 回执走自下而上的 Sheet（role="dialog"），编号与标题只认链上 ProposalCreated。
    await expect(page.getByRole('dialog').getByTestId('gov-submit-receipt')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole('dialog')).toContainText('推举结果');
    const submitted = await readSubmittedProposalId(phase);
    expect(submitted, '本轮应当记下了这个身份的提案编号').toBeGreaterThan(0n);
    proposalId = submitted;
    await expect(page.getByTestId('gov-submit-receipt-line')).toHaveText(
      `提案 #${proposalId.toString()}「${TITLE}」已经推举进本轮。`,
    );
    await expect(page.getByTestId('gov-submit-error')).toHaveCount(0);
    await page.getByTestId('gov-submit-receipt-close').click();
    await expect(page.getByTestId('gov-submit-receipt')).toHaveCount(0);

    // 推举成功后表单整块换成「本轮已经推举」（同一轮不能再推举第二个）。
    await expect(page.getByTestId('gov-submit-submitted')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-submit-submitted-body')).toHaveText(
      `你在本轮推举了提案 #${proposalId.toString()}「${TITLE}」，同一轮不能推举第二个。`,
    );
    await expect(page.getByTestId('gov-submit-form')).toHaveCount(0);
    // 链上：本轮提案列表里就是这一个（推举顺序）。
    const roundIds = await readRoundProposalIds(phase);
    expect(roundIds, '本轮推举列表应当只有这一个提案').toEqual([proposalId]);

    // ---- 3. /vote：本轮提案行出现 → 填 100 票 → 回执 → 额度变化 ----
    await page.goto(`/vote${QUERY}`);
    await connect(page);
    await expect(page.getByTestId('gov-vote-list')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`gov-vote-proposal-${proposalId.toString()}`)).toBeVisible();
    await expect(page.getByTestId(`gov-vote-proposal-total-${proposalId.toString()}`)).toHaveText(
      '本轮共 0 票',
    );
    await expect(page.getByTestId(`gov-vote-proposal-mine-${proposalId.toString()}`)).toHaveText(
      '我已投 0 票',
    );
    // 没填票数时提交按钮是禁用的（本地校验：至少给一个提案分票）。
    await expect(page.getByTestId('gov-vote-submit')).toBeDisabled();

    await page.getByTestId(`gov-vote-amount-${proposalId.toString()}`).fill('100');
    await expect(page.getByTestId('gov-vote-submit')).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId('gov-vote-submit').click();
    await expect(page.getByRole('dialog').getByTestId('gov-vote-receipt')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole('dialog')).toContainText('投票结果');
    // 回执数字只认回执里的 VoteCast 事件（两条：逐提案 + 本轮合计）。
    const receiptLines = page.getByTestId('gov-vote-receipt').locator('p');
    await expect(receiptLines).toHaveCount(2);
    await expect(receiptLines.nth(0)).toHaveText(
      `提案 #${proposalId.toString()}：${expectedAmount(VOTE_AMOUNT)} 票`,
    );
    await expect(receiptLines.nth(1)).toHaveText(`本轮合计投出 ${expectedAmount(VOTE_AMOUNT)} 票`);
    await expect(page.getByTestId('gov-vote-error')).toHaveCount(0);
    await page.getByTestId('gov-vote-receipt-close').click();
    await expect(page.getByTestId('gov-vote-receipt')).toHaveCount(0);

    // 本轮就是投票所在的那一轮（投票只可能落在 Vote.currentRound()）：按链上票数反查，
    // 不假设「现在还是那一轮」——阶段时钟一直在走。
    round = await votedRound();
    expect(round, '阶段只可能前进，投票轮不会早于进门时的阶段').toBeGreaterThanOrEqual(phase);
    await expect(page.getByTestId('gov-vote-round-label')).toHaveText(roundLabelOf(round));
    expect(
      await readSubmittedProposalId(round),
      '投票轮里应当记着这个身份的提案（推举与投票同一轮）',
    ).toBe(proposalId);

    // 链上核对：票记在了这一轮的这个提案上，并且本轮奖励池已经预留。
    expect(await readVoteByMember(round), '本轮我的票数').toBe(VOTE_AMOUNT);
    expect(await readVoteByProposal(round, proposalId), '这个提案的票数').toBe(VOTE_AMOUNT);
    expect(await readTotalVoteAmount(round), '本轮总票数').toBe(VOTE_AMOUNT);
    expect(await readGovReward(round), '本轮第一次投票应当触发预留治理激励池').toBeGreaterThan(0n);

    // 页面上的券额与提案行随 refetch 更新（不拿输入冒充链上结果）。
    await expect(page.getByTestId(`gov-vote-proposal-mine-${proposalId.toString()}`)).toHaveText(
      `我已投 ${expectedAmount(VOTE_AMOUNT)} 票`,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId(`gov-vote-proposal-total-${proposalId.toString()}`)).toHaveText(
      `本轮共 ${expectedAmount(VOTE_AMOUNT)} 票`,
    );
    await expect(page.getByTestId('gov-vote-power-used')).toHaveText(expectedAmount(VOTE_AMOUNT));
    await expect(page.getByTestId('gov-vote-power-remaining')).toHaveText(
      expectedAmount(maxVoteAmount - VOTE_AMOUNT),
    );
    await expect(page.getByTestId('gov-vote-power-max')).toHaveText(expectedAmount(maxVoteAmount));
  });

  test('用例 G2 · 治理核心：推举 / 投票两态的验收截图', async ({ page }) => {
    // 这两态都是「当轮」状态：出块一过就换轮（推举卡换回表单、投票列表清空），
    // 所以截图期间冻住出块（读页面不需要出块），拍完回读挖矿模式。
    await suspendMining();
    try {
      await captureState(
        page,
        'gov-core-submit-submitted',
        '/submit',
        async (target) => {
          await expect(target.getByTestId('gov-submit-submitted')).toBeVisible({
            timeout: 30_000,
          });
          await expect(target.getByTestId('gov-submit-submitted-body')).toHaveText(
            `你在本轮推举了提案 #${proposalId.toString()}「${TITLE}」，同一轮不能推举第二个。`,
          );
        },
        'gov-submit-submitted',
      );

      await captureState(
        page,
        'gov-core-vote-voted',
        '/vote',
        async (target) => {
          await expect(
            target.getByTestId(`gov-vote-proposal-mine-${proposalId.toString()}`),
          ).toHaveText(`我已投 ${expectedAmount(VOTE_AMOUNT)} 票`, { timeout: 30_000 });
          await expect(target.getByTestId('gov-vote-power-used')).toHaveText(
            expectedAmount(VOTE_AMOUNT),
          );
        },
        'gov-vote-power',
      );
    } finally {
      await restoreMining();
    }
  });

  test('用例 G3 · 治理核心：推进阶段后 /gov/rewards 铸造治理激励', async ({ page }) => {
    // 治理激励只能铸「已结束」的轮次（Mint._checkSettlementRound）：先把链推到下一阶段。
    const phaseBeforeMine = await mineToNextPhase();
    // 投票之后链可能已经自己翻过一轮（1 块/秒），所以这里只要求「已经越过投票那一轮」。
    expect(phaseBeforeMine, '推块前至少已经到了投票的那一轮').toBeGreaterThanOrEqual(round);
    expect(await readPhase(), '当前阶段应当已经越过投票那一轮').toBeGreaterThan(round);

    const decimals = await readTokenDecimals();
    const symbol = await readTokenSymbol();
    expect(symbol, '社区代币符号').toBe(SYMBOL);

    // 期望值从链上读回：本轮池子、我的投票激励 / 加速激励（没有加速质押 → 0）。
    const pool = await readGovReward(round);
    expect(pool, '投票那一轮应当预留了治理激励池').toBeGreaterThan(0n);
    const before = await readGovRewardByMember(round);
    expect(before.minted, '铸造前应当是未铸造').toBe(false);
    expect(before.voteReward, '投过票就应当有投票激励').toBeGreaterThan(0n);
    expect(before.boostReward, '没有加速质押 → 加速激励为 0').toBe(0n);
    const mintAmount = before.voteReward + before.boostReward;

    // ---- 1. 可铸造态 ----
    await openPage(page, '/gov/rewards');
    await expect(page.getByTestId('gov-rewards-title')).toHaveText('治理激励');
    await expect(page.getByTestId('gov-rewards-summary')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-rewards-mintable-count')).toHaveText('1 轮可铸造');
    await expect(page.getByTestId('gov-rewards-mint-all')).toHaveText('铸造这 1 轮');
    await expect(page.getByTestId('gov-rewards-mint-all')).toBeEnabled();
    await expect(page.getByTestId(`gov-rewards-row-${round.toString()}`)).toBeVisible();
    await expect(page.getByTestId(`gov-rewards-vote-${round.toString()}`)).toHaveText(
      expectedAmount(before.voteReward, decimals),
    );
    await expect(page.getByTestId(`gov-rewards-boost-${round.toString()}`)).toHaveText(
      expectedAmount(before.boostReward, decimals),
    );
    await expect(page.getByTestId(`gov-rewards-mint-${round.toString()}`)).toHaveText('铸造');
    // 更早的轮次没有我的投票 → 状态列写「没有投票」，不会冒充可铸造。
    if (round > 1n) {
      await expect(page.getByTestId(`gov-rewards-row-${(round - 1n).toString()}`)).toContainText(
        '没有投票',
      );
    }
    // 分页 footer 与链深度有关：8555 是复用链，阶段数可能早已超过一页（20 轮）。
    // 只断言「底部恰好是三态之一」，不绑定「刚好一页」这个与历史相关的假设。
    const exhaustedFooter = page.getByTestId('gov-rewards-exhausted');
    const loadMoreFooter = page.getByTestId('gov-rewards-load-more');
    expect((await exhaustedFooter.count()) + (await loadMoreFooter.count())).toBe(1);
    if ((await exhaustedFooter.count()) === 1) {
      await expect(exhaustedFooter).toHaveText('已经到底');
    }
    await expect(page.getByTestId('gov-rewards-error-text')).toHaveCount(0);

    await captureState(
      page,
      'gov-core-rewards-mintable',
      '/gov/rewards',
      async (target) => {
        await expect(target.getByTestId('gov-rewards-mintable-count')).toHaveText('1 轮可铸造', {
          timeout: 30_000,
        });
        await expect(target.getByTestId(`gov-rewards-mint-${round.toString()}`)).toBeVisible();
      },
      'gov-rewards-summary',
    );

    // ---- 2. 铸造这一轮 ----
    await expect(page.getByTestId(`gov-rewards-mint-${round.toString()}`)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId(`gov-rewards-mint-${round.toString()}`).click();
    await expect(page.getByRole('dialog').getByTestId('gov-rewards-receipt')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole('dialog')).toContainText('铸造结果');
    // 回执金额来自 GovRewardMinted 事件：投票激励 + 加速激励。
    await expect(page.getByTestId('gov-rewards-receipt-line')).toHaveText(
      `${roundLabelOf(round)}：${expectedAmount(mintAmount, decimals)} ${symbol}`,
    );
    await page.getByTestId('gov-rewards-receipt-close').click();
    await expect(page.getByTestId('gov-rewards-receipt')).toHaveCount(0);

    // ---- 3. 已铸造态：这一行变成「已铸造」，可铸造轮数归零 ----
    const after = await readGovRewardByMember(round);
    expect(after.minted, '链上应当记下这一轮已铸造').toBe(true);
    await expect(page.getByTestId('gov-rewards-mintable-count')).toHaveText('0 轮可铸造', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('gov-rewards-mint-all')).toHaveText('铸造这 0 轮');
    await expect(page.getByTestId('gov-rewards-mint-all')).toBeDisabled();
    await expect(page.getByTestId(`gov-rewards-row-${round.toString()}`)).toContainText('已铸造');
    await expect(page.getByTestId(`gov-rewards-mint-${round.toString()}`)).toHaveCount(0);

    await captureState(
      page,
      'gov-core-rewards-minted',
      '/gov/rewards',
      async (target) => {
        await expect(target.getByTestId(`gov-rewards-row-${round.toString()}`)).toContainText(
          '已铸造',
          { timeout: 30_000 },
        );
        await expect(target.getByTestId('gov-rewards-mintable-count')).toHaveText('0 轮可铸造');
      },
      'gov-rewards-summary',
    );
  });

  test('用例 G4 · 治理核心：/gov/proposal-rewards 提案激励结算（上一轮）', async ({ page }) => {
    const decimals = await readTokenDecimals();
    const symbol = await readTokenSymbol();
    expect(symbol, '社区代币符号').toBe(SYMBOL);

    // 期望值：池子 / 本轮总票数 / 门槛（ceil(totalVoteAmount * ratio / 1e18)）/
    // 这个提案的结算金额与状态，全部从链上读回。
    const pool = await readProposalReward(round);
    const totalVoteAmount = await readTotalVoteAmount(round);
    const minVoteRatio = await readProposalMinVoteRatio();
    const threshold = ceilMulDiv(totalVoteAmount, minVoteRatio, PRECISION);
    const settlement = await readProposalSettlement(round, proposalId);
    expect(pool, '投票那一轮应当预留了提案激励池').toBeGreaterThan(0n);
    expect(settlement.amount, '达标提案的结算金额应当等于池子 × 票数占比').toBe(pool);
    expect(settlement.status, '还没人铸造 → 未结算').toBe(0);
    expect(await readVoteByProposal(round, proposalId), '行内票数应当就是上一轮投出去的票').toBe(
      totalVoteAmount,
    );
    expect(totalVoteAmount, '这个提案的票数应当过门槛').toBeGreaterThanOrEqual(threshold);

    await openPage(page, '/gov/proposal-rewards');
    await expect(page.getByTestId('gov-proposal-rewards-title')).toHaveText('提案激励');
    await selectProposalRound(page, round);
    // 页面默认停在最近一个已结束轮次；我们投票的那一轮就在它前面（推进过一轮）。
    expect(await readPhase(), '当前阶段应当已经越过投票那一轮').toBeGreaterThan(round);

    // ---- 汇总：本轮提案激励池 / 总票数 / 门槛 ----
    await expect(page.getByTestId('gov-proposal-rewards-summary')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('gov-proposal-rewards-pool')).toHaveText(
      expectedAmount(pool, decimals),
    );
    await expect(page.getByTestId('gov-proposal-rewards-total-votes')).toHaveText(
      expectedAmount(totalVoteAmount),
    );
    await expect(page.getByTestId('gov-proposal-rewards-threshold')).toHaveText(
      expectedAmount(threshold),
    );
    await expect(page.getByTestId('gov-proposal-rewards-pool-empty')).toHaveCount(0);
    await expect(page.getByTestId('gov-proposal-rewards-read-error')).toHaveCount(0);

    // ---- 提案行：票数 / 门槛、激励金额、状态与达标说明 ----
    await expect(page.getByTestId('gov-proposal-rewards-list')).toBeVisible();
    await expect(
      page.getByTestId(`gov-proposal-rewards-row-${proposalId.toString()}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`gov-proposal-rewards-row-title-${proposalId.toString()}`),
    ).toHaveText(`#${proposalId.toString()} ${TITLE}`);
    await expect(
      page.getByTestId(`gov-proposal-rewards-row-votes-${proposalId.toString()}`),
    ).toHaveText(`${expectedAmount(totalVoteAmount)} / ${expectedAmount(threshold)}`);
    await expect(
      page.getByTestId(`gov-proposal-rewards-row-amount-${proposalId.toString()}`),
    ).toHaveText(expectedAmount(settlement.amount, decimals));
    await expect(
      page.getByTestId(`gov-proposal-rewards-row-status-${proposalId.toString()}`),
    ).toHaveText('待结算');
    await expect(
      page.getByTestId(`gov-proposal-rewards-row-hint-${proposalId.toString()}`),
    ).toHaveText('票数已过门槛，由提案目标合约铸造。');
    // 达标提案只能由提案目标合约铸造 → 这一页不给按钮，也不该出现销毁按钮。
    await expect(
      page.getByTestId(`gov-proposal-rewards-burn-${proposalId.toString()}`),
    ).toHaveCount(0);
    await expect(page.getByTestId('gov-proposal-rewards-error')).toHaveCount(0);

    // ---- 轮次选择：上一轮（空轮）→ 回到投票那一轮 ----
    await expect(page.getByTestId('gov-proposal-rewards-prev')).toBeEnabled();
    await page.getByTestId('gov-proposal-rewards-prev').click();
    await expect(proposalRoundLabel(page)).toHaveText(roundLabelOf(round - 1n));
    await expect(page.getByTestId('gov-proposal-rewards-empty')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-proposal-rewards-empty')).toContainText('这一轮没有提案');
    await expect(page.getByTestId('gov-proposal-rewards-list')).toHaveCount(0);
    await expect(page.getByTestId('gov-proposal-rewards-pool')).toHaveText(expectedAmount(0n));
    await expect(page.getByTestId('gov-proposal-rewards-total-votes')).toHaveText(
      expectedAmount(0n),
    );
    await expect(page.getByTestId('gov-proposal-rewards-threshold')).toHaveText(expectedAmount(0n));
    await expect(page.getByTestId('gov-proposal-rewards-pool-empty')).toHaveText(
      '这一轮没有预留提案激励（本轮没有人投票）。',
    );
    await page.getByTestId('gov-proposal-rewards-next').click();
    await expect(proposalRoundLabel(page)).toHaveText(roundLabelOf(round));
    await expect(page.getByTestId('gov-proposal-rewards-list')).toBeVisible({ timeout: 30_000 });

    await captureState(
      page,
      'gov-core-proposal-rewards-eligible',
      '/gov/proposal-rewards',
      async (target) => {
        await selectProposalRound(target, round);
        await expect(
          target.getByTestId(`gov-proposal-rewards-row-amount-${proposalId.toString()}`),
        ).toHaveText(expectedAmount(settlement.amount, decimals), { timeout: 30_000 });
        await expect(target.getByTestId('gov-proposal-rewards-pool')).toHaveText(
          expectedAmount(pool, decimals),
        );
      },
      'gov-proposal-rewards-summary',
    );
  });

  /**
   * 用例 G5 · 治理首页「我的投票」卡（owner 2026-11-21：仿旧库 `MyVotingPanel` +
   * `/vote/records` 的呈现内容，布局重做）。
   *
   * 数据全部来自 G1 那一笔真实投票：本轮额度 = 治理权 − 已投；记录按轮分组，
   * 每条显示「编号 + 标题 + 我的投票 + 占本轮」。期望值同样从链上读回后派生。
   */
  test('用例 G5 · 治理核心：/gov 我的投票卡（额度 / 按轮记录 / 占比）', async ({ page }) => {
    // 卡片上的额度是**当前轮**的：G1 投票之后链可能又推进了阶段，所以这里重新读一次。
    const nowRound = (await client.readContract({
      address: deployment.addresses.phase,
      abi: PHASE_ABI,
      functionName: 'currentPhase',
    })) as bigint;
    const maxVote = (await client.readContract({
      address: deployment.addresses.vote,
      abi: VOTE_ABI,
      functionName: 'maxVoteAmount',
      args: [deployment.addresses.tokenAddress, BigInt(MEMBER_ID)],
    })) as bigint;
    const usedNow = (await client.readContract({
      address: deployment.addresses.vote,
      abi: VOTE_ABI,
      functionName: 'voteAmountByMemberId',
      args: [deployment.addresses.tokenAddress, nowRound, BigInt(MEMBER_ID)],
    })) as bigint;
    const remaining = maxVote - usedNow;

    await openPage(page, '/gov');
    const card = page.getByTestId('gov-my-votes-card');
    await expect(card).toBeVisible({ timeout: 30_000 });

    // 两格：已投 / 未投（「本轮可投」= 上面摘要卡的有效治理权，不在本卡重复，owner 2026-11-21）。
    await expect(page.getByTestId('gov-my-votes-max')).toHaveCount(0);
    await expect(page.getByTestId('gov-my-votes-used')).toHaveText(expectedAmount(usedNow), {
      timeout: 30_000,
    });
    await expect(page.getByTestId('gov-my-votes-remaining')).toHaveText(expectedAmount(remaining));
    await expect(page.getByTestId('gov-my-votes-round')).toHaveText(roundLabelOf(nowRound));

    // 卡片只预览最近两轮：给「查看全部投票记录」入口；完整记录在独立页断言。
    await expect(page.getByTestId('gov-my-votes-all-link')).toHaveText('查看全部投票记录 >>');
    await expect(page.getByTestId('gov-my-votes-error')).toHaveCount(0);
    // 还有票没投完 → 主按钮是「去投票」链接；投完了就是禁用的「本轮票已经投完」。
    if (remaining > 0n) {
      await expect(page.getByTestId('gov-my-votes-go-vote')).toBeVisible();
      await expect(page.getByTestId('gov-my-votes-go-vote')).toHaveText('去投票');
    } else {
      await expect(page.getByTestId('gov-my-votes-go-vote')).toHaveCount(0);
    }

    await captureState(
      page,
      'gov-core-home-my-votes',
      '/gov',
      async (target) => {
        await expect(target.getByTestId('gov-my-votes-card')).toBeVisible({ timeout: 30_000 });
        await expect(target.getByTestId('gov-my-votes-used')).toHaveText(expectedAmount(usedNow));
      },
      'gov-my-votes-card',
    );
  });

  /**
   * 用例 G6 · 独立页 `/vote/records`（旧库 `/vote/records` 的对应页，owner 2026-11-21 要求拆出来）。
   *
   * 断言：标题 +「去投票」入口 + 按轮记录（轮次行 / 编号 + 标题 / 我的投票 / 占本轮）
   * + 空态与读失败分支存在性；期望值仍由链上读回派生。
   */
  test('用例 G6 · 治理核心：/vote/records 独立投票记录页（按轮分组）', async ({ page }) => {
    await openPage(page, '/vote/records');
    await expect(page.getByTestId('gov-vote-records-title')).toHaveText('我的投票记录', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('gov-vote-records-go-vote')).toHaveText('去投票 >>');
    await expect(page.getByTestId('gov-vote-records-body')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('gov-vote-records-error')).toHaveCount(0);

    // 投票那一轮的记录：轮次行 + 编号标题 + 我的投票 + 占本轮。
    await expect(page.getByTestId(`gov-vote-records-round-line-${round.toString()}`)).toHaveText(
      `治理第 ${round.toString()} 轮 · 共投出 ${expectedAmount(VOTE_AMOUNT)} 票`,
    );
    await expect(
      page.getByTestId(`gov-vote-records-entry-${round.toString()}-${proposalId.toString()}`),
    ).toContainText(`#${proposalId.toString()} ${TITLE}`);
    await expect(
      page.getByTestId(`gov-vote-records-mine-${round.toString()}-${proposalId.toString()}`),
    ).toHaveText(`我的投票 ${expectedAmount(VOTE_AMOUNT)}`);
    await expect(
      page.getByTestId(`gov-vote-records-share-${round.toString()}-${proposalId.toString()}`),
    ).toHaveText('占本轮 100%');

    await captureState(
      page,
      'gov-core-vote-records',
      '/vote/records',
      async (target) => {
        await expect(target.getByTestId('gov-vote-records-body')).toBeVisible({
          timeout: 30_000,
        });
        await expect(
          target.getByTestId(`gov-vote-records-entry-${round.toString()}-${proposalId.toString()}`),
        ).toContainText(`#${proposalId.toString()} ${TITLE}`);
      },
      'gov-vote-records-title',
    );
  });
});
