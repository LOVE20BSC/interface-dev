#!/usr/bin/env node
// 治理·质押 合约线（三线校验 §2）:
//   node scripts/verify/gov-stake-contract.mjs
//
// 直连验证链（默认 http://127.0.0.1:8566，即本任务专用链；支持 VERIFY_RPC 覆盖），
// 用 viem test client 走 anvil 的 unlocked 账户发交易，逐 wei 断言
// docs/product/three-line/gov-stake.md §1 的理论值（期望值全部是本文件里写死的常量，
// 来自 §1 的公式手算；`boostStakeCap` / `memberStake` / `totalStake` / `govPower` 这些
// view 只作为「交叉核对」出现在断言标签里，不参与期望值计算）。
//
// 每个用例前后 snapshot/revert，跑完链上状态与跑前完全一致。绝不触碰 8545（人工链）
// 与 8555（e2e 链）；只需能访问 VERIFY_RPC 指向的 chainId=31337 的 anvil。
//
// 退出码非 0 = 失败。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTestClient,
  decodeErrorResult,
  encodeFunctionData,
  http,
  parseAbi,
  publicActions,
  toFunctionSelector,
} from 'viem';

const RPC = (process.env.VERIFY_RPC ?? 'http://127.0.0.1:8566').replace(/\/+$/, '');
const CHAIN_ID = 31337;
const { port } = new URL(RPC);
if (port === '8545' || port === '8555') {
  throw new Error(`端口 ${port} 留给人工或全量测试，请用专用验证链 8566。`);
}

// 地址来自 Anvil 部署导出，理论值从文档的种子状态独立推导。
const EXPORT_DIR = resolve(
  process.env.ANVIL_EXPORT_DIR ??
    fileURLToPath(new URL(`../../../anvil/.anvil/${port}/export/`, import.meta.url)),
);
const { addresses } = JSON.parse(
  readFileSync(resolve(EXPORT_DIR, 'deployments/anvil31337_dev.json'), 'utf8'),
);
const {
  STAKE_ADDRESS: STAKE,
  MEMBER_NFT_ADDRESS: MEMBER_NFT,
  LOVE20_TOKEN_ADDRESS: TOKEN,
  WETH_ADDRESS: WETH,
  UNISWAP_V2_PAIR_ADDRESS: PAIR,
  PHASE_ADDRESS: PHASE,
} = addresses;

// anvil 固定账户（mnemonic `test test … junk`）
const ACCOUNT_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
// memberId 5 的 owner（导出地址簿第 5 个账户；unstake/withdraw/增加解锁期都是 onlyMemberOwner）
const OWNER_5 = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
// 没有 MemberNFT 的账户，仅供 C5④ 的「无仓位」对照
const NO_NFT_ACCOUNT = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';

const MEMBER_ID = 5n;
const DEADLINE = 4000000000n; // 2096 年，远大于任何本地链时间戳

// ─── 理论线 §1 的期望值（逐 wei；来自 docs/product/three-line/gov-stake.md §1，先于本脚本算出）───
const T = {
  // §0 种子状态
  R_T0: 200000000000000000000000n,
  R_P0: 100000000000000000000n,
  S0: 4472135954999579392818n,
  TLS0: 4472135954999579391818n,
  WLP0: 4472135954999579391818n,
  LIQ0: 200000000000000000000000n,
  SEED_TOKEN_AMOUNT: 199999999999999999955278n,
  SEED_PARENT_AMOUNT: 99999999999999999977n,
  SEED_GOV_POWER: 4472135954999579391818n,
  TOKEN_SUPPLY: 999995499999099999909999997n,
  MAX_SUPPLY: 10000000000000000000000000000n,

  // 用例 C1（流动性质押：1,000 TestLOVE20 + 1 TestWETH，承诺 10 阶段）
  C1_TOKEN_IN: 1000000000000000000000n,
  C1_PARENT_IN: 1000000000000000000000n,
  C1_PHASES: 10n,
  C1_T: 1000000000000000000000n, // 采用的两侧
  C1_P: 500000000000000000n,
  C1_LP: 22360679774997896964n,
  C1_SHARES: 22360679774997896964n,
  C1_GOV_POWER_ADDED: 223606797749978969640n,
  C1_MEMBER_GOV_POWER: 223606797749978969640n,
  C1_TLS: 4494496634774577288782n,
  C1_WLP: 4494496634774577288782n,
  C1_LIQ: 201000000000000000000000n,
  // memberStake 的折算走「成员 LP 份额 → 储备」，与 totalStake 的全社区折算不是一个量：
  //   lpAmount = floor(shares×withdrawableLp/TLS) = 22360679774997896964
  //   tokenAmountForLiquidity = floor(lpAmount×R_T/S)，parent 同理
  C1_MEMBER_TOKEN_AMOUNT: 999999999999999999995n,
  C1_MEMBER_PARENT_AMOUNT: 499999999999999999n,
  C1_TOTAL_TOKEN_AMOUNT: 200999999999999999955278n,
  C1_TOTAL_PARENT_AMOUNT: 100499999999999999977n,
  C1_PAIR_SUPPLY: 4494496634774577289782n,
  C1_R_T: 201000000000000000000000n,
  C1_R_P: 100500000000000000000n,
  C1_TOTAL_GOV_POWER: 4695742752749558361458n,

  // 用例 C2（加速质押 = 上限的一半；clean bootstrap 基线下 memberCap 为偶数 → 恰好整除，余 0）
  C2_MINTED_SHARE: 20099909549981909998190n,
  C2_BASE_CAP: 80399638199927639992760n,
  C2_MEMBER_CAP: 19142770999982771430850n,
  C2_BOOST: 9571385499991385715425n,
  C2_REMAINING: 9571385499991385715425n,
  C2_OVERFLOW: 9571385499991385715426n,

  // 用例 C3（承诺解锁期 10 → 25）
  C3_PHASES: 25n,
  C3_GOV_POWER_ADDED: 335410196624968454460n,
  C3_MEMBER_GOV_POWER: 559016994374947424100n,
  C3_TOTAL_GOV_POWER: 5031152949374526815918n,

  // 用例 C4（申请解锁 + 到期撤出）
  C4_GOV_POWER_REMOVED: 559016994374947424100n,
  C4_LP_AMOUNT: 22360679774997896964n,
  C4_TOKEN_OUT: 999999999999999999995n,
  C4_PARENT_OUT: 499999999999999999n,
  C4_TOKEN_DELTA: 10571385499991385715420n,
  C4_R_T_AFTER: 200000000000000000000005n,
  C4_R_P_AFTER: 100000000000000000001n,
  C4_LIQ_AFTER: 199999999999999999999782n,
};

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function MAX_SUPPLY() view returns (uint256)',
]);
const weth9Abi = parseAbi(['function deposit() payable', 'function withdraw(uint256)']);
const pairAbi = parseAbi([
  'function token0() view returns (address)',
  'function getReserves() view returns (uint112,uint112,uint32)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
]);
const phaseAbi = parseAbi([
  'function currentPhase() view returns (uint256)',
  'function currentPhaseBlocks() view returns (uint256)',
  'function phaseAtBlock(uint256) view returns (uint256)',
  'function phaseInfo(uint256) view returns (uint256,uint256)',
]);
const stakeAbi = parseAbi([
  'function stakeLiquidity(address,uint256,uint256,uint256,uint256,uint256) returns (uint256,uint256)',
  'function stakeBoost(address,uint256,uint256,uint256,uint256) returns (uint256)',
  'function increasePromisedWaitingPhases(address,uint256,uint256) returns (uint256)',
  'function unstake(address,uint256)',
  'function withdraw(address,uint256,uint256)',
  'function memberStake(address,uint256) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256)',
  'function totalStake(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)',
  'function liquidityTokenAmount(address) view returns (uint256)',
  'function govPower(address,uint256,uint256) view returns (uint256)',
  'function totalGovPower(address,uint256) view returns (uint256)',
  'function totalGovPowerAdded(address,uint256) view returns (uint256)',
  'function totalGovPowerRemoved(address,uint256) view returns (uint256)',
  'function validBoostShares(address,uint256,uint256) view returns (uint256)',
  'function totalValidBoostShares(address,uint256) view returns (uint256)',
  'function totalValidBoostSharesAdded(address,uint256) view returns (uint256)',
  'function totalValidBoostSharesRemoved(address,uint256) view returns (uint256)',
  'function boostStakeCap(address,uint256) view returns (uint256,uint256)',
  'function canWithdraw(address,uint256) view returns (bool)',
  'function lastMajorStakeRound(address,uint256) view returns (uint256)',
  'function PROMISED_WAITING_PHASES_MIN() view returns (uint256)',
  'function PROMISED_WAITING_PHASES_MAX() view returns (uint256)',
  'function BOOST_STAKE_SUPPLY_FACTOR() view returns (uint256)',
  'function BOOST_STAKE_MULTIPLIER() view returns (uint256)',
  'function LIQUIDITY_TOKEN_EQUIVALENCE_FACTOR() view returns (uint256)',
  'function FEE_SETTLEMENT_RATIO() view returns (uint256)',
  'function SWAP_FEE_FOR_LP_RATIO() view returns (uint256)',
  'function SWAP_FEE_FOR_PROTOCOL_RATIO() view returns (uint256)',
  // C5 的 revert 定义（只用于 decode/比对 selector）
  'error BoostCapExceeded(address tokenAddress,uint256 memberId,uint256 requested,uint256 allowed)',
  'error InvalidPromisedWaitingPhases(uint256 value,uint256 minPhases,uint256 maxPhases)',
  'error ZeroTokenAmount()',
  'error ZeroParentTokenAmount()',
  'error ZeroBoostAmount()',
  'error NoStakedLiquidity(address tokenAddress,uint256 memberId)',
]);
const nftAbi = parseAbi([
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
]);

const client = createTestClient({ mode: 'anvil', transport: http(RPC) }).extend(publicActions);

const results = [];
let failures = 0;

function check(label, expected, actual) {
  const pass = expected === actual;
  if (!pass) failures += 1;
  results.push({ label, expected, actual, pass });
  const suffix = pass
    ? ''
    : typeof expected === 'bigint' && typeof actual === 'bigint'
      ? ` diff=${actual - expected}`
      : '';
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}: expected=${expected} actual=${actual}${suffix}`);
}

function note(message) {
  console.log(message);
}

async function send({ from, to, value, data }) {
  const hash = await client.sendUnsignedTransaction({
    from,
    to,
    ...(value !== undefined ? { value } : {}),
    ...(data !== undefined ? { data } : {}),
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

async function read(address, abi, functionName, args = []) {
  return client.readContract({ address, abi, functionName, args });
}

const balanceOf = (token, account) => read(token, erc20Abi, 'balanceOf', [account]);
const phase = () => read(PHASE, phaseAbi, 'currentPhase');
const phaseAtBlock = (blockNumber) => read(PHASE, phaseAbi, 'phaseAtBlock', [blockNumber]);

async function pairState() {
  const [r0, r1] = await read(PAIR, pairAbi, 'getReserves');
  const [supply, token0] = await Promise.all([
    read(PAIR, pairAbi, 'totalSupply'),
    read(PAIR, pairAbi, 'token0'),
  ]);
  const isToken0 = token0.toLowerCase() === TOKEN.toLowerCase();
  return {
    rT: BigInt(isToken0 ? r0 : r1),
    rP: BigInt(isToken0 ? r1 : r0),
    supply,
  };
}

async function memberState(memberId = MEMBER_ID) {
  const [shares, boost, phases, unlock, tokenAmt, parentAmt, firstGovPowerRound] = await read(
    STAKE,
    stakeAbi,
    'memberStake',
    [TOKEN, memberId],
  );
  return { shares, boost, phases, unlock, tokenAmt, parentAmt, firstGovPowerRound };
}

async function totalState() {
  const [tls, totalLp, wlp, feeLp, boost, tokenAmt, parentAmt, firstGovPowerRound] = await read(
    STAKE,
    stakeAbi,
    'totalStake',
    [TOKEN],
  );
  return { tls, totalLp, wlp, feeLp, boost, tokenAmt, parentAmt, firstGovPowerRound };
}

const approve = (token, owner, spender, amount) =>
  send({
    from: owner,
    to: token,
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] }),
  });

async function withSnapshot(fn) {
  const snapshot = await client.snapshot();
  try {
    return await fn();
  } finally {
    await client.revert({ id: snapshot });
  }
}

/** 静态调用并取 revert data（`eth_call` 失败时 viem 把 data 挂在 error.data / error.cause.data）。 */
async function staticCall({ from, to, data }) {
  try {
    const value = await client.request({
      method: 'eth_call',
      params: [{ from, to, data }, 'latest'],
    });
    return { ok: true, value };
  } catch (error) {
    return { ok: false, data: error?.data ?? error?.cause?.data };
  }
}

// §1 里写死的 revert 签名（selector 由签名算出，与合约实现无关）
const ERROR_SIGNATURES = {
  BoostCapExceeded: 'address,uint256,uint256,uint256',
  InvalidPromisedWaitingPhases: 'uint256,uint256,uint256',
  ZeroTokenAmount: '',
  ZeroParentTokenAmount: '',
  ZeroBoostAmount: '',
  NoStakedLiquidity: 'address,uint256',
};
const errorSelector = (name) =>
  toFunctionSelector(`error ${name}(${ERROR_SIGNATURES[name] ?? ''})`).toLowerCase();

async function expectRevert(label, { from, to, data }, expectedName, expectedArgs) {
  const result = await staticCall({ from, to, data });
  if (result.ok) {
    check(`${label}（应回滚 ${expectedName}）`, 'reverted', 'returned');
    return;
  }
  const raw = result.data;
  const selector = typeof raw === 'string' ? raw.slice(0, 10).toLowerCase() : 'missing';
  const item = stakeAbi.find(
    (entry) => entry.type === 'error' && toFunctionSelector(entry).toLowerCase() === selector,
  );
  const name = item?.name ?? 'unknown';
  check(`${label} revert selector（${expectedName}）`, errorSelector(expectedName), selector);
  check(`${label} revert 名称`, expectedName, name);
  if (expectedArgs !== undefined && item !== undefined && typeof raw === 'string') {
    const decoded = decodeErrorResult({ abi: stakeAbi, data: raw });
    const args = decoded.args ?? [];
    check(`${label} revert 参数个数`, expectedArgs.length, args.length);
    expectedArgs.forEach((expected, index) => {
      check(`${label} revert 参数[${index}]`, expected, args[index]);
    });
  }
}

/** 推块到「阶段 > targetPhase」：用 phaseInfo 算目标阶段起始块，再 anvil_mine 补齐。 */
async function minePastPhase(targetPhase) {
  const [startBlock, phaseBlocks] = await read(PHASE, phaseAbi, 'phaseInfo', [targetPhase]);
  // viem 的 getBlockNumber 有缓存，这里用原始 RPC 读真实块高
  const current = BigInt(await client.request({ method: 'eth_blockNumber' }));
  const missing = startBlock > current ? Number(startBlock - current) : 1;
  await client.mine({ blocks: missing });
  const block = BigInt(await client.request({ method: 'eth_blockNumber' }));
  const now = await read(PHASE, phaseAbi, 'phaseAtBlock', [block]);
  note(
    `[mine] phaseInfo(${targetPhase}) start=${startBlock} block=${block} → phase=${now} (phaseBlocks=${phaseBlocks})`,
  );
  return { block, phase: now };
}

// ─── 用例 C1 / C2 的交易序列（C5①/C6 复用） ─────────────────────────────────────
async function doC1() {
  await approve(TOKEN, OWNER_5, STAKE, T.C1_TOKEN_IN);
  await send({
    from: OWNER_5,
    to: WETH,
    value: T.C1_PARENT_IN,
    data: encodeFunctionData({ abi: weth9Abi, functionName: 'deposit' }),
  });
  await approve(WETH, OWNER_5, STAKE, T.C1_P);
  const { hash, receipt } = await send({
    from: OWNER_5,
    to: STAKE,
    data: encodeFunctionData({
      abi: stakeAbi,
      functionName: 'stakeLiquidity',
      args: [TOKEN, T.C1_TOKEN_IN, T.C1_PARENT_IN, T.C1_PHASES, MEMBER_ID, DEADLINE],
    }),
  });
  note(`[C1] stakeLiquidity tx ${hash} (block ${receipt.blockNumber})`);
  return { hash, receipt, round: await phaseAtBlock(receipt.blockNumber) };
}

async function doC2() {
  // 授权额度是逐笔消耗的：C1 已经把 1e21 全部用掉，加速质押要再授权一次（与页面每笔授权一致）。
  await approve(TOKEN, OWNER_5, STAKE, T.C2_BOOST);
  const { hash, receipt } = await send({
    from: OWNER_5,
    to: STAKE,
    data: encodeFunctionData({
      abi: stakeAbi,
      functionName: 'stakeBoost',
      args: [TOKEN, T.C2_BOOST, T.C1_PHASES, MEMBER_ID, DEADLINE],
    }),
  });
  note(`[C2] stakeBoost tx ${hash} (block ${receipt.blockNumber})`);
  return { hash, receipt, round: await phaseAtBlock(receipt.blockNumber) };
}

async function main() {
  const chainId = await client.getChainId();
  if (chainId !== CHAIN_ID) {
    throw new Error(`expected chain ${CHAIN_ID} at ${RPC}, got ${chainId}`);
  }
  note(`[gov-stake-contract] chain ${chainId} at ${RPC}`);

  // 交易必须能上块：automine 关闭时（例如链被 anvil_setIntervalMining 0 暂停）临时开启 1s 出块。
  // 不改 automine 为 true 的链，也不在结束时回滚这个模式。
  const automine = await client.request({ method: 'anvil_getAutomine' });
  if (!automine) {
    note('[gov-stake-contract] anvil automine=false → anvil_setIntervalMining 1（只为让交易上块）');
    await client.request({ method: 'anvil_setIntervalMining', params: [1] });
  }

  // ── §0 初始状态（对照 docs/product/three-line/gov-stake.md §0）────────────────
  const block0 = await client.getBlockNumber();
  const round0 = await phase();
  note(
    `[§0] block=${block0} phase=${round0} phaseBlocks=${await read(PHASE, phaseAbi, 'currentPhaseBlocks')}`,
  );
  const p0 = await pairState();
  check('§0 pair.reserveToken', T.R_T0, p0.rT);
  check('§0 pair.reserveParent', T.R_P0, p0.rP);
  check('§0 pair.totalSupply', T.S0, p0.supply);
  check('§0 pair LP @ Stake', T.TLS0, await read(PAIR, pairAbi, 'balanceOf', [STAKE]));
  const t0 = await totalState();
  check('§0 totalStake.totalLiquidityShares', T.TLS0, t0.tls);
  check('§0 totalStake.totalLp', T.WLP0, t0.totalLp);
  check('§0 totalStake.withdrawableLp', T.WLP0, t0.wlp);
  check('§0 totalStake.feeLp', 0n, t0.feeLp);
  check('§0 totalStake.totalBoostShares', 0n, t0.boost);
  check('§0 totalStake.tokenAmountForLiquidity', T.SEED_TOKEN_AMOUNT, t0.tokenAmt);
  check('§0 totalStake.parentTokenAmountForLiquidity', T.SEED_PARENT_AMOUNT, t0.parentAmt);
  check('§0 totalStake.firstGovPowerRound', 2n, t0.firstGovPowerRound);
  check(
    '§0 liquidityTokenAmount',
    T.LIQ0,
    await read(STAKE, stakeAbi, 'liquidityTokenAmount', [TOKEN]),
  );
  const m1 = await memberState(1n);
  check('§0 memberId1.liquidityShares', T.TLS0, m1.shares);
  check('§0 memberId1.boostShares', 0n, m1.boost);
  check('§0 memberId1.promisedWaitingPhases', 1n, m1.phases);
  check('§0 memberId1.unlockRequestPhase', 0n, m1.unlock);
  check('§0 memberId1.firstGovPowerRound', 2n, m1.firstGovPowerRound);
  const m5 = await memberState();
  check('§0 memberId5 未质押（全 0）', 0n, m5.shares);
  check(
    '§0 govPower(current,1) = 4472135954999579391818×1',
    T.SEED_GOV_POWER,
    await read(STAKE, stakeAbi, 'govPower', [TOKEN, round0, 1n]),
  );
  check(
    '§0 totalGovPower = 种子治理权',
    T.SEED_GOV_POWER,
    await read(STAKE, stakeAbi, 'totalGovPower', [TOKEN, round0]),
  );
  check(
    '§0 totalGovPowerRemoved = 0',
    0n,
    await read(STAKE, stakeAbi, 'totalGovPowerRemoved', [TOKEN, round0]),
  );
  check(
    '§0 totalValidBoostShares = 0',
    0n,
    await read(STAKE, stakeAbi, 'totalValidBoostShares', [TOKEN, round0]),
  );
  check('§0 TestLOVE20.totalSupply', T.TOKEN_SUPPLY, await read(TOKEN, erc20Abi, 'totalSupply'));
  check('§0 TestLOVE20.MAX_SUPPLY', T.MAX_SUPPLY, await read(TOKEN, erc20Abi, 'MAX_SUPPLY'));
  check('§0 MemberNFT.totalSupply', 5n, await read(MEMBER_NFT, nftAbi, 'totalSupply'));
  check(
    '§0 MemberNFT.ownerOf(1) = anvil #0（种子质押持有者）',
    ACCOUNT_0,
    await read(MEMBER_NFT, nftAbi, 'ownerOf', [1n]),
  );
  check('§0 MemberNFT.ownerOf(5)', OWNER_5, await read(MEMBER_NFT, nftAbi, 'ownerOf', [MEMBER_ID]));
  check('§0 无 NFT 账户 0x9965 的 TestLOVE20 余额', 0n, await balanceOf(TOKEN, NO_NFT_ACCOUNT));
  check(
    '§0 参数 PROMISED_WAITING_PHASES_MIN',
    1n,
    await read(STAKE, stakeAbi, 'PROMISED_WAITING_PHASES_MIN'),
  );
  check(
    '§0 参数 PROMISED_WAITING_PHASES_MAX',
    100n,
    await read(STAKE, stakeAbi, 'PROMISED_WAITING_PHASES_MAX'),
  );
  check(
    '§0 参数 BOOST_STAKE_SUPPLY_FACTOR',
    2n,
    await read(STAKE, stakeAbi, 'BOOST_STAKE_SUPPLY_FACTOR'),
  );
  check(
    '§0 参数 BOOST_STAKE_MULTIPLIER',
    5n,
    await read(STAKE, stakeAbi, 'BOOST_STAKE_MULTIPLIER'),
  );
  check(
    '§0 参数 LIQUIDITY_TOKEN_EQUIVALENCE_FACTOR',
    2n,
    await read(STAKE, stakeAbi, 'LIQUIDITY_TOKEN_EQUIVALENCE_FACTOR'),
  );
  check(
    '§0 参数 FEE_SETTLEMENT_RATIO',
    2500000000000000n,
    await read(STAKE, stakeAbi, 'FEE_SETTLEMENT_RATIO'),
  );
  check(
    '§0 参数 SWAP_FEE_FOR_LP_RATIO',
    3000000000000000n,
    await read(STAKE, stakeAbi, 'SWAP_FEE_FOR_LP_RATIO'),
  );
  check(
    '§0 参数 SWAP_FEE_FOR_PROTOCOL_RATIO',
    0n,
    await read(STAKE, stakeAbi, 'SWAP_FEE_FOR_PROTOCOL_RATIO'),
  );

  // ── C1 → C2 → C3 → C4（同一成员连续四个用例，共用一次 snapshot）───────────────
  await withSnapshot(async () => {
    // C1 流动性质押
    const beforeToken = await balanceOf(TOKEN, OWNER_5);
    const beforeWeth = await balanceOf(WETH, OWNER_5);
    const c1 = await doC1();

    const m = await memberState();
    check('C1 memberStake.liquidityShares', T.C1_SHARES, m.shares);
    check('C1 memberStake.boostShares', 0n, m.boost);
    check('C1 memberStake.promisedWaitingPhases', T.C1_PHASES, m.phases);
    check('C1 memberStake.unlockRequestPhase', 0n, m.unlock);
    check(
      'C1 memberStake.tokenAmountForLiquidity（成员份额折算）',
      T.C1_MEMBER_TOKEN_AMOUNT,
      m.tokenAmt,
    );
    check(
      'C1 memberStake.parentTokenAmountForLiquidity（成员份额折算）',
      T.C1_MEMBER_PARENT_AMOUNT,
      m.parentAmt,
    );
    check('C1 memberStake.firstGovPowerRound = tx 所在阶段', c1.round, m.firstGovPowerRound);

    const t = await totalState();
    check('C1 totalStake.totalLiquidityShares', T.C1_TLS, t.tls);
    check('C1 totalStake.totalLp', T.C1_WLP, t.totalLp);
    check('C1 totalStake.withdrawableLp', T.C1_WLP, t.wlp);
    check('C1 totalStake.feeLp（无 swap → 不重分类）', 0n, t.feeLp);
    check('C1 totalStake.totalBoostShares', 0n, t.boost);
    check('C1 totalStake.tokenAmountForLiquidity', T.C1_TOTAL_TOKEN_AMOUNT, t.tokenAmt);
    check('C1 totalStake.parentTokenAmountForLiquidity', T.C1_TOTAL_PARENT_AMOUNT, t.parentAmt);
    check(
      'C1 liquidityTokenAmount',
      T.C1_LIQ,
      await read(STAKE, stakeAbi, 'liquidityTokenAmount', [TOKEN]),
    );
    check(
      'C1 member govPower',
      T.C1_MEMBER_GOV_POWER,
      await read(STAKE, stakeAbi, 'govPower', [TOKEN, c1.round, MEMBER_ID]),
    );
    check(
      'C1 totalGovPowerAdded',
      T.C1_TOTAL_GOV_POWER,
      await read(STAKE, stakeAbi, 'totalGovPowerAdded', [TOKEN, c1.round]),
    );
    check(
      'C1 totalGovPower',
      T.C1_TOTAL_GOV_POWER,
      await read(STAKE, stakeAbi, 'totalGovPower', [TOKEN, c1.round]),
    );
    check(
      'C1 totalGovPowerRemoved',
      0n,
      await read(STAKE, stakeAbi, 'totalGovPowerRemoved', [TOKEN, c1.round]),
    );
    const p1 = await pairState();
    check('C1 pair.reserveToken', T.C1_R_T, p1.rT);
    check('C1 pair.reserveParent', T.C1_R_P, p1.rP);
    check('C1 pair.totalSupply', T.C1_PAIR_SUPPLY, p1.supply);
    check(
      'C1 采用的两侧 = 扣款（TestLOVE20）',
      T.C1_T,
      beforeToken - (await balanceOf(TOKEN, OWNER_5)),
    );
    // doC1 内部先 deposit 1e18、再被质押转走 5e17 → 钱包净 +5e17（不是 −5e17）
    check(
      'C1 TestWETH 钱包净变化 = deposit 1e18 − 采用 5e17',
      T.C1_PARENT_IN - T.C1_P,
      (await balanceOf(WETH, OWNER_5)) - beforeWeth,
    );
    check(
      'C1 质押没转走多余的 5e17（钱包余额 = 1e18 − 5e17）',
      T.C1_PARENT_IN - T.C1_P,
      await balanceOf(WETH, OWNER_5),
    );
    check('C1 Stake 不截留代币（余额 0）', 0n, await balanceOf(TOKEN, STAKE));

    // C2 加速质押
    const capBefore = await read(STAKE, stakeAbi, 'boostStakeCap', [TOKEN, MEMBER_ID]);
    check('C2 boostStakeCap.memberCap（交叉核对）', T.C2_MEMBER_CAP, capBefore[0]);
    check('C2 boostStakeCap.memberUsed（交叉核对）', 0n, capBefore[1]);
    const beforeBoostToken = await balanceOf(TOKEN, OWNER_5);
    const c2 = await doC2();
    const m2 = await memberState();
    check('C2 memberStake.boostShares', T.C2_BOOST, m2.boost);
    check('C2 memberStake.liquidityShares 不变', T.C1_SHARES, m2.shares);
    check('C2 memberStake.promisedWaitingPhases 不变', T.C1_PHASES, m2.phases);
    check(
      'C2 lastMajorStakeRound = tx 所在阶段',
      c2.round,
      await read(STAKE, stakeAbi, 'lastMajorStakeRound', [TOKEN, MEMBER_ID]),
    );
    const t2 = await totalState();
    check('C2 totalStake.totalBoostShares', T.C2_BOOST, t2.boost);
    check('C2 totalStake.totalLiquidityShares 不变', T.C1_TLS, t2.tls);
    check(
      'C2 validBoostShares(round,5)',
      T.C2_BOOST,
      await read(STAKE, stakeAbi, 'validBoostShares', [TOKEN, c2.round, MEMBER_ID]),
    );
    check(
      'C2 totalValidBoostShares(round)',
      T.C2_BOOST,
      await read(STAKE, stakeAbi, 'totalValidBoostShares', [TOKEN, c2.round]),
    );
    check(
      'C2 totalValidBoostSharesAdded(round)',
      T.C2_BOOST,
      await read(STAKE, stakeAbi, 'totalValidBoostSharesAdded', [TOKEN, c2.round]),
    );
    check(
      'C2 totalValidBoostSharesRemoved(round)',
      0n,
      await read(STAKE, stakeAbi, 'totalValidBoostSharesRemoved', [TOKEN, c2.round]),
    );
    const capAfter = await read(STAKE, stakeAbi, 'boostStakeCap', [TOKEN, MEMBER_ID]);
    check('C2 boostStakeCap.memberCap 不变（交叉核对）', T.C2_MEMBER_CAP, capAfter[0]);
    check('C2 boostStakeCap.memberUsed（交叉核对）', T.C2_BOOST, capAfter[1]);
    const m2b = await memberState();
    check('C2 剩余额度 = memberCap − used', T.C2_REMAINING, T.C2_MEMBER_CAP - m2b.boost);
    check(
      'C2 治理权不变（加速不产生治理权）',
      T.C1_MEMBER_GOV_POWER,
      await read(STAKE, stakeAbi, 'govPower', [TOKEN, c2.round, MEMBER_ID]),
    );
    check(
      'C2 totalGovPower 不变',
      T.C1_TOTAL_GOV_POWER,
      await read(STAKE, stakeAbi, 'totalGovPower', [TOKEN, c2.round]),
    );
    check(
      'C2 加速扣款（社区代币）',
      T.C2_BOOST,
      beforeBoostToken - (await balanceOf(TOKEN, OWNER_5)),
    );

    // C3 承诺解锁期 10 → 25
    const c3 = await send({
      from: OWNER_5,
      to: STAKE,
      data: encodeFunctionData({
        abi: stakeAbi,
        functionName: 'increasePromisedWaitingPhases',
        args: [TOKEN, MEMBER_ID, T.C3_PHASES],
      }),
    });
    const round3 = await phaseAtBlock(c3.receipt.blockNumber);
    note(`[C3] increasePromisedWaitingPhases tx ${c3.hash} (block ${c3.receipt.blockNumber})`);
    const m3 = await memberState();
    check('C3 memberStake.promisedWaitingPhases', T.C3_PHASES, m3.phases);
    check('C3 memberStake.liquidityShares 不变', T.C1_SHARES, m3.shares);
    check(
      'C3 member govPower',
      T.C3_MEMBER_GOV_POWER,
      await read(STAKE, stakeAbi, 'govPower', [TOKEN, round3, MEMBER_ID]),
    );
    check(
      'C3 totalGovPowerAdded',
      T.C1_TOTAL_GOV_POWER + T.C3_GOV_POWER_ADDED,
      await read(STAKE, stakeAbi, 'totalGovPowerAdded', [TOKEN, round3]),
    );
    check(
      'C3 totalGovPower',
      T.C3_TOTAL_GOV_POWER,
      await read(STAKE, stakeAbi, 'totalGovPower', [TOKEN, round3]),
    );

    // C4 申请解锁 → 到期 → 撤出
    const beforeWithdrawToken = await balanceOf(TOKEN, OWNER_5);
    const beforeWithdrawWeth = await balanceOf(WETH, OWNER_5);
    const unstakeTx = await send({
      from: OWNER_5,
      to: STAKE,
      data: encodeFunctionData({
        abi: stakeAbi,
        functionName: 'unstake',
        args: [TOKEN, MEMBER_ID],
      }),
    });
    const unlockPhase = await phaseAtBlock(unstakeTx.receipt.blockNumber);
    note(
      `[C4] unstake tx ${unstakeTx.hash} (block ${unstakeTx.receipt.blockNumber}, phase ${unlockPhase})`,
    );
    const m4 = await memberState();
    check('C4 unlockRequestPhase = tx 所在阶段', unlockPhase, m4.unlock);
    check('C4 申请解锁后 liquidityShares 不清零', T.C1_SHARES, m4.shares);
    check('C4 申请解锁后 boostShares 不清零', T.C2_BOOST, m4.boost);
    check(
      'C4 申请解锁后 govPower = 0',
      0n,
      await read(STAKE, stakeAbi, 'govPower', [TOKEN, unlockPhase, MEMBER_ID]),
    );
    check(
      'C4 申请解锁后 totalGovPower = 种子治理权',
      T.SEED_GOV_POWER,
      await read(STAKE, stakeAbi, 'totalGovPower', [TOKEN, unlockPhase]),
    );
    check(
      'C4 totalGovPowerRemoved',
      T.C4_GOV_POWER_REMOVED,
      await read(STAKE, stakeAbi, 'totalGovPowerRemoved', [TOKEN, unlockPhase]),
    );
    check(
      'C4 validBoostShares = 0',
      0n,
      await read(STAKE, stakeAbi, 'validBoostShares', [TOKEN, unlockPhase, MEMBER_ID]),
    );
    check(
      'C4 totalValidBoostShares = 0',
      0n,
      await read(STAKE, stakeAbi, 'totalValidBoostShares', [TOKEN, unlockPhase]),
    );
    check(
      'C4 totalValidBoostSharesRemoved',
      T.C2_BOOST,
      await read(STAKE, stakeAbi, 'totalValidBoostSharesRemoved', [TOKEN, unlockPhase]),
    );
    check(
      'C4 未到期 canWithdraw = false',
      false,
      await read(STAKE, stakeAbi, 'canWithdraw', [TOKEN, MEMBER_ID]),
    );

    const { phase: phaseNow } = await minePastPhase(unlockPhase + T.C3_PHASES + 1n);
    check(
      'C4 到期：当前阶段 > unlockRequestPhase + 25',
      true,
      phaseNow > unlockPhase + T.C3_PHASES,
    );
    check(
      'C4 到期 canWithdraw = true',
      true,
      await read(STAKE, stakeAbi, 'canWithdraw', [TOKEN, MEMBER_ID]),
    );

    const withdrawTx = await send({
      from: OWNER_5,
      to: STAKE,
      data: encodeFunctionData({
        abi: stakeAbi,
        functionName: 'withdraw',
        args: [TOKEN, MEMBER_ID, DEADLINE],
      }),
    });
    const round4 = await phaseAtBlock(withdrawTx.receipt.blockNumber);
    note(
      `[C4] withdraw tx ${withdrawTx.hash} (block ${withdrawTx.receipt.blockNumber}, phase ${round4})`,
    );
    check(
      'C4 取回 TestLOVE20（LP 折算 + 加速退还）',
      T.C4_TOKEN_DELTA,
      (await balanceOf(TOKEN, OWNER_5)) - beforeWithdrawToken,
    );
    check(
      'C4 取回 TestWETH（LP 折算）',
      T.C4_PARENT_OUT,
      (await balanceOf(WETH, OWNER_5)) - beforeWithdrawWeth,
    );
    const m5after = await memberState();
    check('C4 撤出后 memberStake 全 0（shares）', 0n, m5after.shares);
    check('C4 撤出后 memberStake 全 0（boost）', 0n, m5after.boost);
    check('C4 撤出后 memberStake 全 0（phases）', 0n, m5after.phases);
    check('C4 撤出后 memberStake 全 0（unlock）', 0n, m5after.unlock);
    check('C4 撤出后 memberStake 全 0（firstGovPowerRound）', 0n, m5after.firstGovPowerRound);
    const t4 = await totalState();
    check('C4 撤出后 totalLiquidityShares', T.TLS0, t4.tls);
    check('C4 撤出后 withdrawableLp', T.WLP0, t4.wlp);
    check('C4 撤出后 totalBoostShares', 0n, t4.boost);
    check(
      'C4 撤出后 liquidityTokenAmount',
      T.C4_LIQ_AFTER,
      await read(STAKE, stakeAbi, 'liquidityTokenAmount', [TOKEN]),
    );
    const p4 = await pairState();
    check('C4 撤出后 pair.reserveToken（多 5 wei 粉尘）', T.C4_R_T_AFTER, p4.rT);
    check('C4 撤出后 pair.reserveParent（多 1 wei 粉尘）', T.C4_R_P_AFTER, p4.rP);
    check('C4 撤出后 pair.totalSupply = 种子', T.S0, p4.supply);
    check(
      'C4 撤出后 govPower = 0',
      0n,
      await read(STAKE, stakeAbi, 'govPower', [TOKEN, round4, MEMBER_ID]),
    );
    check('C4 撤出后 Stake 社区代币余额 0', 0n, await balanceOf(TOKEN, STAKE));
    check('C4 撤出后 Stake WETH 余额 0', 0n, await balanceOf(WETH, STAKE));
  });

  // ── C5①（上限）需要 C1+C2 的状态 ──────────────────────────────────────────────
  await withSnapshot(async () => {
    await doC1();
    await doC2();
    await expectRevert(
      'C5① 加速金额超上限',
      {
        from: OWNER_5,
        to: STAKE,
        data: encodeFunctionData({
          abi: stakeAbi,
          functionName: 'stakeBoost',
          args: [TOKEN, T.C2_OVERFLOW, T.C1_PHASES, MEMBER_ID, DEADLINE],
        }),
      },
      'BoostCapExceeded',
      [TOKEN, MEMBER_ID, T.C2_OVERFLOW, T.C2_REMAINING],
    );
    // allowed 额度边界：正好等于余量的金额可以成功（防守性核对，证明 allowed 的口径是「余量」）
    await approve(TOKEN, OWNER_5, STAKE, T.C2_REMAINING);
    const okCap = await send({
      from: OWNER_5,
      to: STAKE,
      data: encodeFunctionData({
        abi: stakeAbi,
        functionName: 'stakeBoost',
        args: [TOKEN, T.C2_REMAINING, T.C1_PHASES, MEMBER_ID, DEADLINE],
      }),
    });
    note(`[C5①] 余量整额可加速 tx ${okCap.hash}`);
    check('C5① 用满余量后 memberCap 恰好耗尽', T.C2_MEMBER_CAP, (await memberState()).boost);
  });

  // ── C5②③④（无需前置状态）────────────────────────────────────────────────────
  await withSnapshot(async () => {
    await expectRevert(
      'C5② phases = 0',
      {
        from: OWNER_5,
        to: STAKE,
        data: encodeFunctionData({
          abi: stakeAbi,
          functionName: 'stakeLiquidity',
          args: [TOKEN, T.C1_TOKEN_IN, T.C1_P, 0n, MEMBER_ID, DEADLINE],
        }),
      },
      'InvalidPromisedWaitingPhases',
      [0n, 1n, 100n],
    );
    await expectRevert(
      'C5② phases = 101',
      {
        from: OWNER_5,
        to: STAKE,
        data: encodeFunctionData({
          abi: stakeAbi,
          functionName: 'stakeLiquidity',
          args: [TOKEN, T.C1_TOKEN_IN, T.C1_P, 101n, MEMBER_ID, DEADLINE],
        }),
      },
      'InvalidPromisedWaitingPhases',
      [101n, 1n, 100n],
    );
    await expectRevert(
      'C5③ tokenAmount = 0',
      {
        from: OWNER_5,
        to: STAKE,
        data: encodeFunctionData({
          abi: stakeAbi,
          functionName: 'stakeLiquidity',
          args: [TOKEN, 0n, T.C1_P, T.C1_PHASES, MEMBER_ID, DEADLINE],
        }),
      },
      'ZeroTokenAmount',
      [],
    );
    await expectRevert(
      'C5③ parentTokenAmount = 0',
      {
        from: OWNER_5,
        to: STAKE,
        data: encodeFunctionData({
          abi: stakeAbi,
          functionName: 'stakeLiquidity',
          args: [TOKEN, T.C1_TOKEN_IN, 0n, T.C1_PHASES, MEMBER_ID, DEADLINE],
        }),
      },
      'ZeroParentTokenAmount',
      [],
    );
    await expectRevert(
      'C5③ boostAmount = 0',
      {
        from: OWNER_5,
        to: STAKE,
        data: encodeFunctionData({
          abi: stakeAbi,
          functionName: 'stakeBoost',
          args: [TOKEN, 0n, T.C1_PHASES, MEMBER_ID, DEADLINE],
        }),
      },
      'ZeroBoostAmount',
      [],
    );
    await expectRevert(
      'C5④ 未质押就加速',
      {
        from: OWNER_5,
        to: STAKE,
        data: encodeFunctionData({
          abi: stakeAbi,
          functionName: 'stakeBoost',
          args: [TOKEN, 1000000000000000000n, 1n, MEMBER_ID, DEADLINE],
        }),
      },
      'NoStakedLiquidity',
      [TOKEN, MEMBER_ID],
    );
  });

  // ── C6 失败回滚（真交易）─────────────────────────────────────────────────────
  await withSnapshot(async () => {
    await doC1();
    await doC2();
    const round = await phase();
    const before = {
      totals: await totalState(),
      member: await memberState(),
      pair: await pairState(),
      token: await balanceOf(TOKEN, OWNER_5),
      weth: await balanceOf(WETH, OWNER_5),
      liq: await read(STAKE, stakeAbi, 'liquidityTokenAmount', [TOKEN]),
      govPower: await read(STAKE, stakeAbi, 'govPower', [TOKEN, round, MEMBER_ID]),
      validBoost: await read(STAKE, stakeAbi, 'validBoostShares', [TOKEN, round, MEMBER_ID]),
    };
    const tx = await send({
      from: OWNER_5,
      to: STAKE,
      data: encodeFunctionData({
        abi: stakeAbi,
        functionName: 'stakeBoost',
        args: [TOKEN, T.C2_OVERFLOW, T.C1_PHASES, MEMBER_ID, DEADLINE],
      }),
    });
    note(`[C6] 预期回滚的 stakeBoost tx ${tx.hash} status=${tx.receipt.status}`);
    check('C6 交易回执 status', 'reverted', tx.receipt.status);
    check('C6 回滚后 totalBoostShares 不变', before.totals.boost, (await totalState()).boost);
    check('C6 回滚后 member boostShares 不变', before.member.boost, (await memberState()).boost);
    check('C6 回滚后 totalLiquidityShares 不变', before.totals.tls, (await totalState()).tls);
    check(
      'C6 回滚后 liquidityTokenAmount 不变',
      before.liq,
      await read(STAKE, stakeAbi, 'liquidityTokenAmount', [TOKEN]),
    );
    check(
      'C6 回滚后 治理权 不变',
      before.govPower,
      await read(STAKE, stakeAbi, 'govPower', [TOKEN, round, MEMBER_ID]),
    );
    check(
      'C6 回滚后 validBoostShares 不变',
      before.validBoost,
      await read(STAKE, stakeAbi, 'validBoostShares', [TOKEN, round, MEMBER_ID]),
    );
    check('C6 回滚后 TestLOVE20 余额 不变', before.token, await balanceOf(TOKEN, OWNER_5));
    check('C6 回滚后 TestWETH 余额 不变', before.weth, await balanceOf(WETH, OWNER_5));
    const pairAfter = await pairState();
    check('C6 回滚后 pair.reserveToken 不变', before.pair.rT, pairAfter.rT);
    check('C6 回滚后 pair.reserveParent 不变', before.pair.rP, pairAfter.rP);
    check('C6 回滚后 pair.totalSupply 不变', before.pair.supply, pairAfter.supply);
  });

  const passed = results.length - failures;
  console.log(`\n[gov-stake-contract] ${passed}/${results.length} PASS`);
  if (failures > 0) process.exitCode = 1;
}

await main().catch((error) => {
  console.error(
    `[gov-stake-contract] FAILED: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
  );
  process.exitCode = 1;
});
