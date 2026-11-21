#!/usr/bin/env node
// 治理·core 合约线（三线校验 §2：推举 → 投票 → 推进阶段 → 铸造治理激励 → 提案激励结算/销毁）
//
//   node scripts/verify/gov-core-contract.mjs [--rpc http://127.0.0.1:8566]
//
// 链：**只连专用验证链**，默认 http://127.0.0.1:8566（`cd ../anvil && make bootstrap PORT=8566`
// 起的那条；`--rpc` / `VERIFY_RPC` 可覆盖）。
// **禁止 8545（人工链）与 8555（e2e 套件链）**：这两个端口在启动时直接被拒绝（见
// `assertDedicatedChain`），任何交易与非只读 RPC 只会打到 --rpc 指向的链。
//
// 口径：期望值全部由「链上读回的读数 + core/src/{Submit,Vote,Mint}.sol 的整数公式」在脚本里
// 现算（`Math.mulDiv` 即 floor；推举门槛/提案门槛是 `Math.Rounding.Ceil`，逐式照合约），
// 链上 view 只作为被断言对象，不抄任何 §1 常量。地址读
// `src/config/network/anvil31337_dev/network.json`，ABI 读 `../anvil/export/abis/*.json`。
//
// 交易用 anvil 的 unlocked 确定性账户（#0 `0xf39F…2266` 持身份 NFT #1 与全部治理权；
// §7 的第二个推举人/投票人用持身份 NFT #5 的 #4 `0x15d3…6A65`）。
//
// 状态卫生：两个用例组各包一次 snapshot/revert，跑完链上状态与跑前逐 wei 相同；采矿模式
// （automine / interval mining）在 finally 里恢复原值。退出码非 0 = 失败。

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTestClient,
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  http,
  isAddress,
  publicActions,
  toFunctionSelector,
} from 'viem';

// ─── 0. 路径 / 参数 / 链守卫 ─────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..'); // LOVE20BSC
const FRONTEND_ROOT = resolve(REPO_ROOT, 'interface-dev-dsh');
const NETWORK_FILE = resolve(FRONTEND_ROOT, 'src/config/network/anvil31337_dev/network.json');
const ABI_DIR = resolve(REPO_ROOT, 'anvil/export/abis');

const CHAIN_ID = 31337;
const DEFAULT_RPC = 'http://127.0.0.1:8566';

function die(message) {
  console.error(`[gov-core-contract] FAILED: ${message}`);
  process.exit(1);
}

/**
 * 用例组内部的致命错误：**必须抛异常而不是 process.exit**——否则 `withSnapshot` 的
 * `anvil_revert` 与 `restoreMining` 都不会执行，链会被留在半途状态（踩过一次）。
 */
class FatalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FatalError';
  }
}

function fail(message) {
  throw new FatalError(message);
}

function loadJson(file, what) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    die(
      `读不到${what}（${file}）：${error instanceof Error ? error.message : error}\n` +
        '  地址簿与 ABI 由 `cd ../anvil && make bootstrap PORT=8566` 生成（本脚本只读，不写入仓库）。',
    );
  }
  return undefined;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--rpc') {
      options.rpc = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--rpc=')) {
      options.rpc = arg.slice('--rpc='.length);
    } else if (arg === '--help' || arg === '-h') {
      console.log('用法: node scripts/verify/gov-core-contract.mjs [--rpc http://127.0.0.1:8566]');
      console.log('  专用验证链默认 8566；8545（人工链）/ 8555（e2e 链）会被拒绝。');
      process.exit(0);
    } else {
      die(`未知参数 ${arg}（--help 看用法）`);
    }
  }
  return options;
}

function assertDedicatedChain(rpcUrl) {
  let parsed;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    die(`--rpc / VERIFY_RPC 不是合法 URL：${rpcUrl}`);
  }
  const port = parsed.port === '' ? (parsed.protocol === 'https:' ? '443' : '80') : parsed.port;
  if (port === '8545') {
    die(
      '拒绝在 8545 上运行：8545 是**人工链**（开发者钱包连着的那条），任何自动化交易都不许打它。\n' +
        '  专用验证链：cd ../anvil && make bootstrap PORT=8566，然后 --rpc http://127.0.0.1:8566。',
    );
  }
  if (port === '8555') {
    die(
      '拒绝在 8555 上运行：8555 是 **e2e 套件链**（`pnpm e2e` 自己管），脚本的快照/回滚会破坏套件。\n' +
        '  专用验证链：cd ../anvil && make bootstrap PORT=8566，然后 --rpc http://127.0.0.1:8566。',
    );
  }
}

const args = parseArgs(process.argv.slice(2));
const RPC = (args.rpc ?? process.env.VERIFY_RPC ?? DEFAULT_RPC).replace(/\/+$/, '');
assertDedicatedChain(RPC);

const ABI_FILES = {
  LOVE20Token: 'LOVE20Token.json',
  MemberNFT: 'MemberNFT.json',
  Stake: 'Stake.json',
  Submit: 'Submit.json',
  Vote: 'Vote.json',
  Mint: 'Mint.json',
  Phase: 'Phase.json',
  Launch: 'Launch.json',
  WETH9: 'WETH9.json',
};
const ABIS = Object.fromEntries(
  Object.entries(ABI_FILES).map(([name, file]) => [
    name,
    loadJson(resolve(ABI_DIR, file), ` ABI（${file}）`),
  ]),
);

const network = loadJson(NETWORK_FILE, '地址簿（network.json）');
const addresses = network?.addresses ?? {};
const params = network?.params ?? {};

const CONTRACTS = {
  token: { addressKey: 'tokenAddress', abi: 'LOVE20Token', label: 'LOVE20Token' },
  memberNFT: { addressKey: 'memberNFT', abi: 'MemberNFT', label: 'MemberNFT' },
  stake: { addressKey: 'stake', abi: 'Stake', label: 'Stake' },
  submit: { addressKey: 'submit', abi: 'Submit', label: 'Submit' },
  vote: { addressKey: 'vote', abi: 'Vote', label: 'Vote' },
  mint: { addressKey: 'mint', abi: 'Mint', label: 'Mint' },
  phase: { addressKey: 'phase', abi: 'Phase', label: 'Phase' },
  launch: { addressKey: 'launch', abi: 'Launch', label: 'Launch' },
  weth: { addressKey: 'weth', abi: 'WETH9', label: 'WETH9' },
};

for (const [name, contract] of Object.entries(CONTRACTS)) {
  const address = addresses[contract.addressKey];
  if (!address) {
    die(`地址簿 network.json 缺少 addresses.${contract.addressKey}（${contract.label}）`);
  }
  if (!isAddress(address)) {
    die(`地址簿 network.json 的 addresses.${contract.addressKey} 不是合法地址：${address}`);
  }
  CONTRACTS[name].address = address;
}

// anvil 固定账户（mnemonic `test test … junk`）
const ACCOUNT_0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // 持 MemberNFT #1（本脚本主交易账户）
const ACCOUNT_4 = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'; // 持 MemberNFT #5（§7 的第二推举人/投票人）
const NO_NFT_ACCOUNT = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'; // 无身份 NFT 的对照账户

const MEMBER = 1n;
const MEMBER_2 = 2n;
const MEMBER_5 = 5n;
const DEADLINE = 4000000000n; // 2096 年，远大于任何本地链时间戳

// 合约常量（不是可配置参数，`Submit.sol:17` / `Mint.sol:14-15` 里是 private constant）
const PRECISION = 10n ** 18n;
const VOTE_POOL_DIVISOR = 2n;

// 本脚本选定的操作量（输入，不是期望值）
const VOTE_AMOUNT = 1000000000000000000000n; // 每轮第一票投 1000e18 治理权
const BOOST_AMOUNT = 1000000000000000000000n; // 成员1 加速质押 1000e18（§6 round1 起让 voterBoost 非 0）
const BOOST_AMOUNT_5 = 100000000000000000000n; // 成员5 加速质押 100e18（§7 多投票人）
const MEMBER5_TOKEN_IN = 1000000000000000000000n; // 成员5 流动性质押 1000e18（换成治理权，才够推举门槛）
const MEMBER5_PARENT_IN = 1000000000000000000000n; // 成员5 先 deposit 1e18 TestWETH，池子只采用一半
const MEMBER5_PHASES = 10n; // 成员5 承诺解锁期（与 gov-stake C1 同路径）

const PROPOSAL_TARGET = CONTRACTS.token.address; // targetMode = 0（NoCallback），target 只要非 0

const client = createTestClient({ mode: 'anvil', transport: http(RPC) }).extend(publicActions);

// ─── 1. 断言与读链工具 ───────────────────────────────────────────────────────────

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

/** `Math.mulDiv(a, b, c)`（OpenZeppelin）的整数语义：floor(a×b/c)。 */
function mulDiv(a, b, c) {
  return (a * b) / c;
}

/** `Math.mulDiv(a, b, c, Rounding.Ceil)`：ceil(a×b/c)，即 `Submit.sol:84` / `Mint.sol:417`。 */
function mulDivCeil(a, b, c) {
  const product = a * b;
  const quotient = product / c;
  return product % c === 0n ? quotient : quotient + 1n;
}

async function latestBlock() {
  return BigInt(await client.request({ method: 'eth_blockNumber' }));
}

async function read(contractName, functionName, callArgs = []) {
  const contract = CONTRACTS[contractName];
  return client.readContract({
    address: contract.address,
    abi: ABIS[contract.abi],
    functionName,
    args: callArgs,
  });
}

async function send({ from, to, value, data }) {
  const hash = await client.sendUnsignedTransaction({
    from,
    to,
    ...(value !== undefined ? { value } : {}),
    ...(data !== undefined ? { data } : {}),
  });
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  return { hash, receipt };
}

/**
 * 把链切成「一交易一区块」的确定性出块：先关 interval mining，再开 automine。
 * 顺序不能反：anvil 在 interval 模式下会忽略 `anvil_setAutomine`（实测 getAutomine 仍为 false），
 * 结果交易永远不上块、viem 等回执超时。跑完用 `restoreMining` 还原原值。
 */
async function enterDeterministicMining() {
  const originalAutomine = await client.request({ method: 'anvil_getAutomine' });
  const originalInterval = await client.request({ method: 'anvil_getIntervalMining' }); // number | null
  note(
    `[mining] automine=${originalAutomine} intervalMining=${originalInterval} → automine=true interval=0`,
  );
  if (originalInterval !== null && originalInterval !== 0) {
    await client.request({ method: 'anvil_setIntervalMining', params: [0] });
  }
  if (originalAutomine !== true) {
    await client.request({ method: 'anvil_setAutomine', params: [true] });
  }
  const automineNow = await client.request({ method: 'anvil_getAutomine' });
  const intervalNow = await client.request({ method: 'anvil_getIntervalMining' });
  if (automineNow !== true || (intervalNow !== null && intervalNow !== 0)) {
    die(
      `无法把 ${RPC} 切成确定性出块（automine=${automineNow} interval=${intervalNow}）：` +
        '交易不会自动上块，脚本无法继续。先 `cd ../anvil && make bootstrap PORT=8566`。',
    );
  }
  return { originalAutomine, originalInterval };
}

async function restoreMining({ originalAutomine, originalInterval }) {
  try {
    // 先还原 automine 再还原 interval（interval 模式会接管出块，与 anvil 的优先级一致）
    await client.request({ method: 'anvil_setAutomine', params: [originalAutomine] });
    if (originalInterval !== null) {
      await client.request({ method: 'anvil_setIntervalMining', params: [originalInterval] });
    }
    note(
      `[mining] 恢复 automine=${originalAutomine} intervalMining=${originalInterval}（套件口径）`,
    );
  } catch (error) {
    // 链中途挂掉时不要把原始错误盖掉：恢复失败只报警告，退出码仍由调用方设置。
    console.error(
      `[gov-core-contract] 警告：恢复采矿模式失败（automine=${originalAutomine} interval=${originalInterval}）：` +
        `${error instanceof Error ? (error.message ?? error) : error}`,
    );
  }
}

function encodeCall(abiName, functionName, callArgs) {
  return encodeFunctionData({ abi: ABIS[abiName], functionName, args: callArgs });
}

/** `eth_call`，取 revert data（viem 把 data 挂在 error.data / error.cause.data）。 */
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

/** 只读模拟一个非 view 函数，拿它的返回值（用于 `mintGovReward(s)` 的返回值断言）。 */
async function staticRead(contractName, functionName, callArgs, from) {
  const contract = CONTRACTS[contractName];
  const data = encodeCall(contract.abi, functionName, callArgs);
  const raw = await client.request({
    method: 'eth_call',
    params: [{ from, to: contract.address, data }, 'latest'],
  });
  return decodeFunctionResult({ abi: ABIS[contract.abi], functionName, data: raw });
}

function decodeEvents(receipt, address, abiName, eventName) {
  const abi = ABIS[abiName];
  const decoded = [];
  for (const log of receipt.logs) {
    if (String(log.address).toLowerCase() !== String(address).toLowerCase()) continue;
    try {
      const item = decodeEventLog({ abi, eventName, data: log.data, topics: log.topics });
      decoded.push(item);
    } catch {
      // 同地址上别的 event：忽略
    }
  }
  return decoded;
}

async function expectRevert(label, { from, to, data }, abiName, expectedName, expectedArgs) {
  const abi = ABIS[abiName];
  const result = await staticCall({ from, to, data });
  if (result.ok) {
    check(`${label}（应回滚 ${expectedName}）`, 'reverted', 'returned');
    return;
  }
  const raw = result.data;
  const selector = typeof raw === 'string' ? raw.slice(0, 10).toLowerCase() : 'missing';
  const expectedError = abi.find((entry) => entry.type === 'error' && entry.name === expectedName);
  if (expectedError === undefined) fail(`ABI 里没有 revert 定义 ${expectedName}（ABI 文件过期？）`);
  check(
    `${label} revert selector（${expectedName}）`,
    toFunctionSelector(expectedError).toLowerCase(),
    selector,
  );
  const item = abi.find(
    (entry) => entry.type === 'error' && toFunctionSelector(entry).toLowerCase() === selector,
  );
  check(`${label} revert 名称`, expectedName, item?.name ?? 'unknown');
  if (expectedArgs !== undefined && item !== undefined && typeof raw === 'string') {
    const decoded = decodeErrorResult({ abi, data: raw });
    const decodedArgs = decoded.args ?? [];
    check(`${label} revert 参数个数`, expectedArgs.length, decodedArgs.length);
    expectedArgs.forEach((expected, index) => {
      check(`${label} revert 参数[${index}]`, expected, decodedArgs[index]);
    });
  }
}

async function withSnapshot(fn) {
  const snapshot = await client.snapshot();
  try {
    return await fn();
  } finally {
    await client.revert({ id: snapshot });
  }
}

/**
 * 用 `Phase.phaseInfo(下一阶段)` 算出下一阶段起始块，再用 `anvil_mine` 把块推过去。
 * 全过程不假设阶段长度：`Phase.sync()`（`Submit` 每轮第一次推举时调用，`Submit.sol:375-379`）
 * 会按「观察到的每秒块数」把**下一阶段**拉长/缩短——automine 下出块远快于 1s/块，实测下一阶段
 * 被拉到 496–726 块（见每行 `[mine]` 输出的 `phaseBlocks`）。所以每次都现读 `phaseInfo` 再算差值。
 */
async function mineToNextPhase(fromPhase) {
  const [startBlock, phaseBlocks] = await read('phase', 'phaseInfo', [fromPhase + 1n]);
  const blockBefore = await latestBlock();
  const missing = startBlock > blockBefore ? Number(startBlock - blockBefore) : 1;
  await client.mine({ blocks: missing });
  const blockAfter = await latestBlock();
  const phaseAfter = await read('phase', 'currentPhase');
  note(
    `[mine] phaseInfo(${fromPhase + 1n}) = (startBlock=${startBlock}, phaseBlocks=${phaseBlocks})；` +
      `anvil_mine +${missing} → block ${blockBefore} → ${blockAfter}，phase ${fromPhase} → ${phaseAfter}`,
  );
  return { startBlock, phaseBlocks, block: blockAfter, phase: phaseAfter };
}

// ─── 2. 交易构造 ────────────────────────────────────────────────────────────────

function proposalBody(tag) {
  return {
    title: `gov-core contract line ${tag}`,
    details: `three-line verification (contract) ${tag}`,
    target: PROPOSAL_TARGET,
    targetMode: 0, // TargetMode.NoCallback
    creationData: '0x',
  };
}

/** 交易的「本轮不变」守卫：阶段长度可被 `Phase.sync()` 调整，跨轮会让后续断言失去意义。 */
async function guardRound(roundBefore, label) {
  const roundAfter = await read('phase', 'currentPhase');
  if (roundAfter !== roundBefore) {
    fail(
      `[${label}] 交易期间阶段从 ${roundBefore} 变成 ${roundAfter}（Phase.sync 调整了阶段长度）：` +
        '本轮的推举/投票会落在不同阶段的语义上，请重跑或换干净链。',
    );
  }
}

async function submitProposal(from, memberId, tag) {
  const roundBefore = await read('phase', 'currentPhase');
  const tx = await send({
    from,
    to: CONTRACTS.submit.address,
    data: encodeCall('Submit', 'submitNewProposal', [
      CONTRACTS.token.address,
      memberId,
      proposalBody(tag),
      '0x',
    ]),
  });
  await guardRound(roundBefore, `submit ${tag}`);
  const created = decodeEvents(tx.receipt, CONTRACTS.submit.address, 'Submit', 'ProposalCreated');
  const proposalId = created[0]?.args?.proposalId;
  if (proposalId === undefined)
    fail(`[${tag}] 交易里没有 ProposalCreated 事件（回执 status=${tx.receipt.status}）`);
  return { tx, proposalId };
}

async function vote(from, memberId, proposalIds, voteAmounts) {
  const roundBefore = await read('phase', 'currentPhase');
  const tx = await send({
    from,
    to: CONTRACTS.vote.address,
    data: encodeCall('Vote', 'vote', [
      CONTRACTS.token.address,
      memberId,
      proposalIds,
      voteAmounts,
      [],
    ]),
  });
  await guardRound(roundBefore, `vote ${proposalIds.join(',')}`);
  return tx;
}

async function approveToken(tokenAddress, owner, spender, amount) {
  return send({
    from: owner,
    to: tokenAddress,
    data: encodeCall('LOVE20Token', 'approve', [spender, amount]),
  });
}

async function proposalCount() {
  const [, totalCount] = await read('submit', 'proposalIds', [
    CONTRACTS.token.address,
    0n,
    1n,
    false,
  ]);
  return totalCount;
}

// ─── 3. 治理激励手算（照 Mint.sol 的整数语义）────────────────────────────────────

/**
 * `Mint._govRewardCalculation`（`Mint.sol:337-378`）：
 *   votePool    = govReward / 2
 *   boostPool   = govReward - votePool
 *   voteReward  = votePool × memberVotes / totalVotes           （floor；totalVotes=0 时 0）
 *   boostReward = boostPool × voterBoost / totalVoterBoost      （floor；totalVoterBoost=0 时 0）
 */
async function readGovMath(round, memberId) {
  const gov = await read('mint', 'govReward', [CONTRACTS.token.address, round]);
  const memberVotes = await read('vote', 'voteAmountByMemberId', [
    CONTRACTS.token.address,
    round,
    memberId,
  ]);
  const totalVotes = await read('vote', 'totalVoteAmount', [CONTRACTS.token.address, round]);
  const voterBoost = await read('vote', 'voterBoost', [CONTRACTS.token.address, round, memberId]);
  const totalVoterBoost = await read('vote', 'totalVoterBoost', [CONTRACTS.token.address, round]);
  const votePool = gov / VOTE_POOL_DIVISOR;
  const boostPool = gov - votePool;
  const voteReward = totalVotes === 0n ? 0n : (votePool * memberVotes) / totalVotes;
  const boostReward = totalVoterBoost === 0n ? 0n : (boostPool * voterBoost) / totalVoterBoost;
  return {
    gov,
    memberVotes,
    totalVotes,
    voterBoost,
    totalVoterBoost,
    votePool,
    boostPool,
    voteReward,
    boostReward,
  };
}

async function assertGovMath(label, round, memberId, expectMinted = false) {
  const math = await readGovMath(round, memberId);
  const [voteReward, boostReward, minted] = await read('mint', 'govRewardByMemberId', [
    CONTRACTS.token.address,
    round,
    memberId,
  ]);
  check(
    `${label} votePool + boostPool = govReward（Mint.sol:359-360）`,
    math.gov,
    math.votePool + math.boostPool,
  );
  check(
    `${label} 成员票数 ∈ (0, 本轮总票数]`,
    true,
    math.memberVotes > 0n && math.memberVotes <= math.totalVotes,
  );
  check(`${label} minted 标记`, expectMinted, minted);
  check(
    `${label} govRewardByMemberId.voteReward = floor(votePool×memberVotes/totalVotes)`,
    math.voteReward,
    voteReward,
  );
  check(
    `${label} govRewardByMemberId.boostReward = floor(boostPool×voterBoost/totalVoterBoost)`,
    math.boostReward,
    boostReward,
  );
  note(
    `[math ${label}] gov=${math.gov} votePool=${math.votePool} boostPool=${math.boostPool} ` +
      `memberVotes=${math.memberVotes} totalVotes=${math.totalVotes} voterBoost=${math.voterBoost} ` +
      `totalVoterBoost=${math.totalVoterBoost} → voteReward=${math.voteReward} boostReward=${math.boostReward}`,
  );
  return math;
}

function checkPoolReservation(
  label,
  availableAtReserve,
  reservedBefore,
  govRatio,
  proposalRatio,
  govReward,
  proposalReward,
  reservedAfter,
) {
  const expectedGov = mulDiv(availableAtReserve, govRatio, PRECISION);
  const expectedProposal = mulDiv(availableAtReserve, proposalRatio, PRECISION);
  check(
    `${label} govReward = floor(rewardAvailableAtReserve×govRatio/1e18)`,
    expectedGov,
    govReward,
  );
  check(
    `${label} proposalReward = floor(rewardAvailableAtReserve×proposalRatio/1e18)`,
    expectedProposal,
    proposalReward,
  );
  check(`${label} 两个池子都非 0`, true, govReward > 0n && proposalReward > 0n);
  check(
    `${label} totalRewardReserved 增量 = gov + proposal`,
    govReward + proposalReward,
    reservedAfter - reservedBefore,
  );
  check(
    `${label} gov + proposal = floor(rewardAvailableAtReserve×(govRatio+proposalRatio)/1e18)`,
    mulDiv(availableAtReserve, govRatio + proposalRatio, PRECISION),
    govReward + proposalReward,
  );
}

/**
 * 阶段余量守卫：一个用例组要在**同一阶段**里连发 N 笔交易（automine = 一交易一块），
 * 若当前阶段剩余块数不足，就先 `anvil_mine` 推进到下一阶段再开始，否则组内交易会跨轮
 * （推举/投票的 round 变了，断言就失去意义）。实测起始块可能正好落在阶段末尾。
 */
async function ensurePhaseRoom(minRemainingBlocks, label) {
  const current = await read('phase', 'currentPhase');
  const [nextStartBlock] = await read('phase', 'phaseInfo', [current + 1n]);
  const block = await latestBlock();
  const remaining = nextStartBlock > block ? nextStartBlock - block : 0n;
  if (remaining < BigInt(minRemainingBlocks)) {
    note(
      `[phase-guard] ${label}：阶段 ${current} 只剩 ${remaining} 块（需要 ≥ ${minRemainingBlocks}），先推进阶段`,
    );
    await mineToNextPhase(current);
    return read('phase', 'currentPhase');
  }
  note(
    `[phase-guard] ${label}：阶段 ${current} 剩余 ${remaining} 块（需要 ≥ ${minRemainingBlocks}）`,
  );
  return current;
}

// ─── 4. 用例组 A：推举 → 投票 → 预留 → 阶段推进 → 治理激励铸造（含批量）─────────────

async function runGovFlow() {
  // 组 A 的 round0 只发 2 笔（推举 + 投票），留 8 块余量足够
  await ensurePhaseRoom(8, '§1-§4 round0');
  // ═══ §1 推举门槛 ═══════════════════════════════════════════════════════════════
  const round0 = await read('phase', 'currentPhase');
  const phaseBlocks0 = await read('phase', 'currentPhaseBlocks');
  note(`[§1] round0=${round0} phaseBlocks=${phaseBlocks0}`);

  const submitMinRatio = await read('submit', 'SUBMIT_MIN_RATIO');
  check(
    '§1 Submit.SUBMIT_MIN_RATIO = 地址簿参数 SUBMIT_MIN_RATIO（部署一致）',
    BigInt(params.SUBMIT_MIN_RATIO),
    submitMinRatio,
  );
  check(
    '§1 Submit.currentRound() = Phase.currentPhase()',
    round0,
    await read('submit', 'currentRound'),
  );

  const totalGovVotes0 = await read('stake', 'totalGovVotes', [CONTRACTS.token.address, round0]);
  const member1GovVotes0 = await read('stake', 'govVotes', [
    CONTRACTS.token.address,
    round0,
    MEMBER,
  ]);
  const requiredSubmitVotes = mulDivCeil(totalGovVotes0, submitMinRatio, PRECISION);
  // ceil 的定义式（不依赖任何常量）：required 是使 required×1e18 ≥ total×ratio 的最小整数
  check(
    '§1 推举门槛 = ceil(totalGovVotes×ratio/1e18) 的 ceil 语义',
    true,
    requiredSubmitVotes * PRECISION >= totalGovVotes0 * submitMinRatio &&
      (requiredSubmitVotes - 1n) * PRECISION < totalGovVotes0 * submitMinRatio,
  );
  const handCanSubmit = requiredSubmitVotes !== 0n && member1GovVotes0 >= requiredSubmitVotes;
  check('§1 手算 canSubmit(成员1) = required≠0 且 govVotes ≥ required', true, handCanSubmit);
  const chainCanSubmit = await read('submit', 'canSubmit', [CONTRACTS.token.address, MEMBER]);
  check('§1 Submit.canSubmit(成员1) 与手算结论一致', handCanSubmit, chainCanSubmit);
  check('§1 canSubmit(成员1) = true（种子治理权全部在成员1）', true, chainCanSubmit);
  check(
    '§1 无治理权的成员（#2）canSubmit = false',
    false,
    await read('submit', 'canSubmit', [CONTRACTS.token.address, MEMBER_2]),
  );
  note(
    `[§1] totalGovVotes=${totalGovVotes0} govVotes(round0,1)=${member1GovVotes0} ` +
      `required=ceil(total×${submitMinRatio}/1e18)=${requiredSubmitVotes}`,
  );

  // ═══ §2 创建 + 推举 ════════════════════════════════════════════════════════════
  const totalBefore = await proposalCount();
  const { tx: submitTx, proposalId: proposalA } = await submitProposal(ACCOUNT_0, MEMBER, 'A');
  const totalAfter = await proposalCount();
  check('§2 推举后 proposalIds.totalCount = 推举前 + 1', totalBefore + 1n, totalAfter);
  check(
    '§2 新提案 id = 旧 totalCount + 1（ProposalCreated.proposalId）',
    totalBefore + 1n,
    proposalA,
  );
  check(
    '§2 Submit.isSubmitted(round0, id) = true',
    true,
    await read('submit', 'isSubmitted', [CONTRACTS.token.address, round0, proposalA]),
  );
  check(
    '§2 Submit.proposalIdBySubmitterId(round0, 1) = id',
    proposalA,
    await read('submit', 'proposalIdBySubmitterId', [CONTRACTS.token.address, round0, MEMBER]),
  );
  check(
    '§2 Submit.submitterIdByProposalId(round0, id) = 1',
    MEMBER,
    await read('submit', 'submitterIdByProposalId', [CONTRACTS.token.address, round0, proposalA]),
  );
  const submitEvent = decodeEvents(
    submitTx.receipt,
    CONTRACTS.submit.address,
    'Submit',
    'ProposalCreated',
  )[0];
  check('§2 ProposalCreated.authorId = 1', MEMBER, submitEvent.args.authorId);
  check(
    '§2 ProposalCreated.target = 传入 target',
    PROPOSAL_TARGET.toLowerCase(),
    String(submitEvent.args.target).toLowerCase(),
  );
  check('§2 ProposalCreated.targetMode = 0（NoCallback）', 0, Number(submitEvent.args.targetMode));
  check('§2 ProposalCreated.creationData = 0x', '0x', submitEvent.args.creationData);
  // 同一身份同一轮再推举一次必须 revert：只走 eth_call，不发第二笔真交易
  await expectRevert(
    '§2 同一身份同轮再推举一次',
    {
      from: ACCOUNT_0,
      to: CONTRACTS.submit.address,
      data: encodeCall('Submit', 'submitNewProposal', [
        CONTRACTS.token.address,
        MEMBER,
        proposalBody('A-dup'),
        '0x',
      ]),
    },
    'Submit',
    'MemberAlreadySubmitted',
    [CONTRACTS.token.address, round0, MEMBER],
  );

  // ═══ §3 投票 + §4 激励预留 ═════════════════════════════════════════════════════
  const maxVoteAmount0 = await read('vote', 'maxVoteAmount', [CONTRACTS.token.address, MEMBER]);
  check(
    '§3 Vote.maxVoteAmount(成员1) = Stake.govVotes(round0, 1)',
    member1GovVotes0,
    maxVoteAmount0,
  );
  const totalVoteBefore = await read('vote', 'totalVoteAmount', [CONTRACTS.token.address, round0]);
  check('§3 投票前本轮 totalVoteAmount = 0', 0n, totalVoteBefore);
  const govRewardBeforeVote = await read('mint', 'govReward', [CONTRACTS.token.address, round0]);
  check('§4 投票前本轮激励池未预留（govReward = 0）', 0n, govRewardBeforeVote);
  // 预留发生在「第一票」那一刻：先记下那一刻的可用额度（之后 rewardAvailable 会变）
  const availableAtReserve0 = await read('mint', 'rewardAvailable', [CONTRACTS.token.address]);
  const reservedBefore0 = await read('mint', 'totalRewardReserved', [CONTRACTS.token.address]);

  const voteTx0 = await vote(ACCOUNT_0, MEMBER, [proposalA], [VOTE_AMOUNT]);
  check(
    '§3 Vote.voteAmountByProposalId = 传入金额',
    VOTE_AMOUNT,
    await read('vote', 'voteAmountByProposalId', [CONTRACTS.token.address, round0, proposalA]),
  );
  check(
    '§3 Vote.voteAmountByMemberId = 传入金额（累计）',
    VOTE_AMOUNT,
    await read('vote', 'voteAmountByMemberId', [CONTRACTS.token.address, round0, MEMBER]),
  );
  check(
    '§3 Vote.totalVoteAmount = 投票前 + 传入金额',
    totalVoteBefore + VOTE_AMOUNT,
    await read('vote', 'totalVoteAmount', [CONTRACTS.token.address, round0]),
  );
  const cumulativeVote0 = await read('vote', 'voteAmountByMemberId', [
    CONTRACTS.token.address,
    round0,
    MEMBER,
  ]);
  check('§3 maxVoteAmount ≥ 累计已投（链上读数）', true, maxVoteAmount0 >= cumulativeVote0);
  // 超额投票必须 revert（VoteLimitExceeded，Vote.sol:282-286）
  await expectRevert(
    '§3 超额投票（amount = maxVoteAmount + 1）',
    {
      from: ACCOUNT_0,
      to: CONTRACTS.vote.address,
      data: encodeCall('Vote', 'vote', [
        CONTRACTS.token.address,
        MEMBER,
        [proposalA],
        [maxVoteAmount0 + 1n],
        [],
      ]),
    },
    'Vote',
    'VoteLimitExceeded',
    [CONTRACTS.token.address, round0, MEMBER, VOTE_AMOUNT + maxVoteAmount0 + 1n, maxVoteAmount0],
  );
  const voteCast0 = decodeEvents(voteTx0.receipt, CONTRACTS.vote.address, 'Vote', 'VoteCast')[0];
  check('§3 VoteCast.voteAmount = 传入金额', VOTE_AMOUNT, voteCast0.args.voteAmount);
  check('§3 VoteCast.voteAmountTotal = 成员累计', VOTE_AMOUNT, voteCast0.args.voteAmountTotal);
  check(
    '§3 VoteCast.totalVoteAmount = 本轮总票数',
    totalVoteBefore + VOTE_AMOUNT,
    voteCast0.args.totalVoteAmount,
  );
  check('§3 VoteCast.voterBoost = 0（本轮投票前没有加速份额）', 0n, voteCast0.args.voterBoost);

  // §4：池子按「预留那一刻的 rewardAvailable」拆分，之后 rewardAvailable 会变
  const govRatio = await read('mint', 'ROUND_REWARD_GOV_RATIO');
  const proposalRatio = await read('mint', 'ROUND_REWARD_PROPOSAL_RATIO');
  const minVoteRatio = await read('mint', 'PROPOSAL_REWARD_MIN_VOTE_RATIO');
  check(
    '§4 Mint.ROUND_REWARD_GOV_RATIO = 地址簿参数',
    BigInt(params.ROUND_REWARD_GOV_RATIO),
    govRatio,
  );
  check(
    '§4 Mint.ROUND_REWARD_PROPOSAL_RATIO = 地址簿参数',
    BigInt(params.ROUND_REWARD_PROPOSAL_RATIO),
    proposalRatio,
  );
  check(
    '§4 Mint.PROPOSAL_REWARD_MIN_VOTE_RATIO = 地址簿参数',
    BigInt(params.PROPOSAL_REWARD_MIN_VOTE_RATIO),
    minVoteRatio,
  );
  const govReward0 = await read('mint', 'govReward', [CONTRACTS.token.address, round0]);
  const proposalReward0 = await read('mint', 'proposalReward', [CONTRACTS.token.address, round0]);
  const reservedAfter0 = await read('mint', 'totalRewardReserved', [CONTRACTS.token.address]);
  checkPoolReservation(
    '§4 round0',
    availableAtReserve0,
    reservedBefore0,
    govRatio,
    proposalRatio,
    govReward0,
    proposalReward0,
    reservedAfter0,
  );
  const reserveEvents = decodeEvents(
    voteTx0.receipt,
    CONTRACTS.mint.address,
    'Mint',
    'RoundRewardReserved',
  );
  check('§4 RoundRewardReserved 事件条数 = 1', 1, reserveEvents.length);
  if (reserveEvents.length === 1) {
    const eventArgs = reserveEvents[0].args;
    check('§4 事件.round = round0', round0, eventArgs.round);
    check('§4 事件.govReward = 链上 govReward', govReward0, eventArgs.govReward);
    check(
      '§4 事件.proposalReward = 链上 proposalReward',
      proposalReward0,
      eventArgs.proposalReward,
    );
    check(
      '§4 事件.totalRewardReserved = 链上 totalRewardReserved',
      reservedAfter0,
      eventArgs.totalRewardReserved,
    );
  }
  const availableAfterReserve0 = await read('mint', 'rewardAvailable', [CONTRACTS.token.address]);
  check(
    '§4 预留后 rewardAvailable 减少 = gov + proposal（所以用事件/totalRewardReserved 断言恒等式）',
    availableAtReserve0 - (govReward0 + proposalReward0),
    availableAfterReserve0,
  );

  // ═══ §5 推进阶段（anvil_mine 到下一阶段）═══════════════════════════════════════
  const step1 = await mineToNextPhase(round0);
  const round1 = step1.phase;
  check('§5 Phase.currentPhase 增加', true, round1 > round0);
  check('§5 currentPhase = round0 + 1', round0 + 1n, round1);
  check(
    '§5 上一轮已结束：Vote.isRoundEnded(round0) = true',
    true,
    await read('vote', 'isRoundEnded', [round0]),
  );
  check(
    '§5 新轮未结束：Vote.isRoundEnded(round1) = false',
    false,
    await read('vote', 'isRoundEnded', [round1]),
  );
  check(
    '§5 Phase.phaseAtBlock(最新块) = currentPhase',
    round1,
    await read('phase', 'phaseAtBlock', [step1.block]),
  );

  // ═══ §8（补充）totalVoterBoost = 0 的轮次：burnUnusedBoostReward 销毁量 = boostPool ═══
  const totalVoterBoostRound0 = await read('vote', 'totalVoterBoost', [
    CONTRACTS.token.address,
    round0,
  ]);
  const voterBoostRound0Member1 = await read('vote', 'voterBoost', [
    CONTRACTS.token.address,
    round0,
    MEMBER,
  ]);
  check('§8 round0 totalVoterBoost = 0（本轮没人带加速份额投票）', 0n, totalVoterBoostRound0);
  check('§8 round0 voterBoost(成员1) = 0', 0n, voterBoostRound0Member1);
  const boostPool0 = govReward0 - govReward0 / VOTE_POOL_DIVISOR;
  const burnedBeforeRound0 = await read('mint', 'totalRewardBurned', [CONTRACTS.token.address]);
  await send({
    from: ACCOUNT_0,
    to: CONTRACTS.mint.address,
    data: encodeCall('Mint', 'burnUnusedBoostReward', [CONTRACTS.token.address, round0]),
  });
  const burnedAfterRound0 = await read('mint', 'totalRewardBurned', [CONTRACTS.token.address]);
  check(
    '§8 burnUnusedBoostReward 销毁量 = boostPool（gov - gov/2）',
    boostPool0,
    burnedAfterRound0 - burnedBeforeRound0,
  );
  check(
    '§8 boostPool + votePool = govReward',
    govReward0,
    boostPool0 + govReward0 / VOTE_POOL_DIVISOR,
  );
  await send({
    from: ACCOUNT_0,
    to: CONTRACTS.mint.address,
    data: encodeCall('Mint', 'burnUnusedBoostReward', [CONTRACTS.token.address, round0]),
  });
  check(
    '§8 重复 burnUnusedBoostReward 不重复销毁',
    burnedAfterRound0,
    await read('mint', 'totalRewardBurned', [CONTRACTS.token.address]),
  );

  // ═══ §6 round0 治理激励数学（无加速 → boostReward = 0）═══════════════════════════
  const math0 = await assertGovMath('§6 round0', round0, MEMBER, false);
  check('§6 round0 成员1 票数 = 本轮总票数（唯一投票人）', math0.totalVotes, math0.memberVotes);
  check('§6 round0 voteReward = votePool（全票占满投票池）', math0.votePool, math0.voteReward);
  check('§6 round0 boostReward = 0（totalVoterBoost = 0）', 0n, math0.boostReward);
  const mintedBeforeRound0 = await read('mint', 'totalRewardMinted', [CONTRACTS.token.address]);

  // ═══ round1：加速质押（让 voterBoost 非 0）→ 推举 → 投票 → 预留 ══════════════════
  await approveToken(CONTRACTS.token.address, ACCOUNT_0, CONTRACTS.stake.address, BOOST_AMOUNT);
  await send({
    from: ACCOUNT_0,
    to: CONTRACTS.stake.address,
    data: encodeCall('Stake', 'stakeBoost', [
      CONTRACTS.token.address,
      BOOST_AMOUNT,
      1n, // phases 保持种子值 1（不改变治理权）
      MEMBER,
      DEADLINE,
    ]),
  });
  check(
    '§6 round1 前置：validBoostShares(round1, 1) = 加速质押额',
    BOOST_AMOUNT,
    await read('stake', 'validBoostShares', [CONTRACTS.token.address, round1, MEMBER]),
  );
  const totalBeforeRound1 = await proposalCount();
  const { proposalId: proposalB } = await submitProposal(ACCOUNT_0, MEMBER, 'B');
  check(
    '§2 round1 推举后 proposalIds.totalCount 再 +1',
    totalBeforeRound1 + 1n,
    await proposalCount(),
  );
  const totalVoteBeforeRound1 = await read('vote', 'totalVoteAmount', [
    CONTRACTS.token.address,
    round1,
  ]);
  const availableAtReserve1 = await read('mint', 'rewardAvailable', [CONTRACTS.token.address]);
  const reservedBefore1 = await read('mint', 'totalRewardReserved', [CONTRACTS.token.address]);
  await vote(ACCOUNT_0, MEMBER, [proposalB], [VOTE_AMOUNT]);
  check(
    '§3 round1 Vote.voteAmountByProposalId = 传入金额',
    VOTE_AMOUNT,
    await read('vote', 'voteAmountByProposalId', [CONTRACTS.token.address, round1, proposalB]),
  );
  check(
    '§3 round1 Vote.totalVoteAmount = 投票前 + 传入金额',
    totalVoteBeforeRound1 + VOTE_AMOUNT,
    await read('vote', 'totalVoteAmount', [CONTRACTS.token.address, round1]),
  );
  const govReward1 = await read('mint', 'govReward', [CONTRACTS.token.address, round1]);
  const proposalReward1 = await read('mint', 'proposalReward', [CONTRACTS.token.address, round1]);
  const reservedAfter1 = await read('mint', 'totalRewardReserved', [CONTRACTS.token.address]);
  checkPoolReservation(
    '§4 round1（第二次预留）',
    availableAtReserve1,
    reservedBefore1,
    govRatio,
    proposalRatio,
    govReward1,
    proposalReward1,
    reservedAfter1,
  );
  check(
    '§3 round1 voterBoost(成员1) = 加速份额',
    BOOST_AMOUNT,
    await read('vote', 'voterBoost', [CONTRACTS.token.address, round1, MEMBER]),
  );
  check(
    '§3 round1 totalVoterBoost = 加速份额（唯一投票人）',
    BOOST_AMOUNT,
    await read('vote', 'totalVoterBoost', [CONTRACTS.token.address, round1]),
  );

  // 推进到 round2（round1 结束），再做 round1 的治理激励单笔铸造
  const step2 = await mineToNextPhase(round1);
  const round2 = step2.phase;
  check('§5 第二次推进：currentPhase 增加', true, round2 > round1);
  check('§5 round1 已结束', true, await read('vote', 'isRoundEnded', [round1]));

  const math1 = await assertGovMath('§6 round1', round1, MEMBER, false);
  check('§6 round1 voterBoost = 加速份额（非 0）', BOOST_AMOUNT, math1.voterBoost);
  check('§6 round1 totalVoterBoost = 加速份额（非 0）', BOOST_AMOUNT, math1.totalVoterBoost);
  check(
    '§6 round1 boostReward = boostPool（加速份额占满加速池）',
    math1.boostPool,
    math1.boostReward,
  );
  note(
    `[§6 round1] govReward=${govReward1} proposalReward=${proposalReward1} ` +
      `→ voteReward=${math1.voteReward} boostReward=${math1.boostReward}`,
  );
  // 单笔铸造：先 eth_call 拿返回值，再发真交易
  const mintGovArgs = [CONTRACTS.token.address, round1, MEMBER, ACCOUNT_0];
  const simulatedMint = await staticRead('mint', 'mintGovReward', mintGovArgs, ACCOUNT_0);
  check('§6 mintGovReward 返回值.voteReward = 手算', math1.voteReward, simulatedMint[0]);
  check('§6 mintGovReward 返回值.boostReward = 手算', math1.boostReward, simulatedMint[1]);
  const balanceBeforeMintRound1 = await read('token', 'balanceOf', [ACCOUNT_0]);
  const mintTxRound1 = await send({
    from: ACCOUNT_0,
    to: CONTRACTS.mint.address,
    data: encodeCall('Mint', 'mintGovReward', mintGovArgs),
  });
  const balanceAfterMintRound1 = await read('token', 'balanceOf', [ACCOUNT_0]);
  check(
    '§6 mintGovReward 代币到账 = voteReward + boostReward',
    math1.voteReward + math1.boostReward,
    balanceAfterMintRound1 - balanceBeforeMintRound1,
  );
  check(
    '§6 mintGovReward 后 totalRewardMinted 增量 = voteReward + boostReward',
    math1.voteReward + math1.boostReward,
    (await read('mint', 'totalRewardMinted', [CONTRACTS.token.address])) - mintedBeforeRound0,
  );
  check(
    '§6 mintGovReward 后 govRewardByMemberId.minted = true',
    true,
    (await read('mint', 'govRewardByMemberId', [CONTRACTS.token.address, round1, MEMBER]))[2],
  );
  const govMintedEvent = decodeEvents(
    mintTxRound1.receipt,
    CONTRACTS.mint.address,
    'Mint',
    'GovRewardMinted',
  )[0];
  check('§6 GovRewardMinted.voteReward = 手算', math1.voteReward, govMintedEvent.args.voteReward);
  check(
    '§6 GovRewardMinted.boostReward = 手算',
    math1.boostReward,
    govMintedEvent.args.boostReward,
  );
  check('§6 GovRewardMinted.round = round1', round1, govMintedEvent.args.round);
  check('§6 GovRewardMinted.memberId = 1', MEMBER, govMintedEvent.args.memberId);
  // 同一轮再铸必须 revert（MemberRewardAlreadyMinted）
  await expectRevert(
    '§6 同一轮再次 mintGovReward',
    {
      from: ACCOUNT_0,
      to: CONTRACTS.mint.address,
      data: encodeCall('Mint', 'mintGovReward', mintGovArgs),
    },
    'Mint',
    'MemberRewardAlreadyMinted',
    [CONTRACTS.token.address, round1, MEMBER],
  );

  // ═══ round2：再推举 + 投票 → 批量铸造 [round0, round2] ═════════════════════════
  const { proposalId: proposalC } = await submitProposal(ACCOUNT_0, MEMBER, 'C');
  const totalVoteBeforeRound2 = await read('vote', 'totalVoteAmount', [
    CONTRACTS.token.address,
    round2,
  ]);
  const availableAtReserve2 = await read('mint', 'rewardAvailable', [CONTRACTS.token.address]);
  const reservedBefore2 = await read('mint', 'totalRewardReserved', [CONTRACTS.token.address]);
  await vote(ACCOUNT_0, MEMBER, [proposalC], [VOTE_AMOUNT]);
  check(
    '§3 round2 Vote.totalVoteAmount = 投票前 + 传入金额',
    totalVoteBeforeRound2 + VOTE_AMOUNT,
    await read('vote', 'totalVoteAmount', [CONTRACTS.token.address, round2]),
  );
  const govReward2 = await read('mint', 'govReward', [CONTRACTS.token.address, round2]);
  const proposalReward2 = await read('mint', 'proposalReward', [CONTRACTS.token.address, round2]);
  const reservedAfter2 = await read('mint', 'totalRewardReserved', [CONTRACTS.token.address]);
  checkPoolReservation(
    '§4 round2（第三次预留）',
    availableAtReserve2,
    reservedBefore2,
    govRatio,
    proposalRatio,
    govReward2,
    proposalReward2,
    reservedAfter2,
  );
  const step3 = await mineToNextPhase(round2);
  const round3 = step3.phase;
  check('§5 第三次推进：currentPhase 增加', true, round3 > round2);
  check('§5 round2 已结束', true, await read('vote', 'isRoundEnded', [round2]));
  check(
    '§5 round0 / round1 / round2 均已结束',
    true,
    await Promise.all([
      read('vote', 'isRoundEnded', [round0]),
      read('vote', 'isRoundEnded', [round1]),
      read('vote', 'isRoundEnded', [round2]),
    ]).then((flags) => flags.every((flag) => flag === true)),
  );

  const math2 = await assertGovMath('§6 round2', round2, MEMBER, false);
  check('§6 round2 voterBoost = 加速份额（沿用到本轮）', BOOST_AMOUNT, math2.voterBoost);
  note(
    `[§6 round2] govReward=${govReward2} → voteReward=${math2.voteReward} boostReward=${math2.boostReward}`,
  );

  // 批量路径：两个已结束、且都还没铸过的轮次 [round0, round2]
  const batchArgs = [CONTRACTS.token.address, [round0, round2], MEMBER, ACCOUNT_0];
  const simulatedBatch = await staticRead('mint', 'mintGovRewards', batchArgs, ACCOUNT_0);
  const simulatedVoteRewards = simulatedBatch[0];
  const simulatedBoostRewards = simulatedBatch[1];
  check('§6 mintGovRewards 返回数组长度 = 2', 2, simulatedVoteRewards.length);
  check(
    '§6 mintGovRewards.voteRewards[0] = round0 手算 voteReward',
    math0.voteReward,
    simulatedVoteRewards[0],
  );
  check(
    '§6 mintGovRewards.boostRewards[0] = round0 手算 boostReward',
    math0.boostReward,
    simulatedBoostRewards[0],
  );
  check(
    '§6 mintGovRewards.voteRewards[1] = round2 手算 voteReward',
    math2.voteReward,
    simulatedVoteRewards[1],
  );
  check(
    '§6 mintGovRewards.boostRewards[1] = round2 手算 boostReward',
    math2.boostReward,
    simulatedBoostRewards[1],
  );
  const balanceBeforeBatch = await read('token', 'balanceOf', [ACCOUNT_0]);
  const mintedBeforeBatch = await read('mint', 'totalRewardMinted', [CONTRACTS.token.address]);
  await send({
    from: ACCOUNT_0,
    to: CONTRACTS.mint.address,
    data: encodeCall('Mint', 'mintGovRewards', batchArgs),
  });
  const expectedBatch = math0.voteReward + math0.boostReward + math2.voteReward + math2.boostReward;
  check(
    '§6 mintGovRewards 代币到账 = 两轮 (voteReward + boostReward) 之和',
    expectedBatch,
    (await read('token', 'balanceOf', [ACCOUNT_0])) - balanceBeforeBatch,
  );
  check(
    '§6 mintGovRewards 后 totalRewardMinted 增量 = 两轮之和',
    expectedBatch,
    (await read('mint', 'totalRewardMinted', [CONTRACTS.token.address])) - mintedBeforeBatch,
  );
  check(
    '§6 批量后 round0 govRewardByMemberId.minted = true',
    true,
    (await read('mint', 'govRewardByMemberId', [CONTRACTS.token.address, round0, MEMBER]))[2],
  );
  check(
    '§6 批量后 round2 govRewardByMemberId.minted = true',
    true,
    (await read('mint', 'govRewardByMemberId', [CONTRACTS.token.address, round2, MEMBER]))[2],
  );
  await expectRevert(
    '§6 批量铸造后再单笔铸 round2',
    {
      from: ACCOUNT_0,
      to: CONTRACTS.mint.address,
      data: encodeCall('Mint', 'mintGovReward', [
        CONTRACTS.token.address,
        round2,
        MEMBER,
        ACCOUNT_0,
      ]),
    },
    'Mint',
    'MemberRewardAlreadyMinted',
    [CONTRACTS.token.address, round2, MEMBER],
  );

  // ── round0 的治理激励已在批量里铸掉（单笔已经验过返回值；这里确认链上累计值只增不减）──
  note(
    `[§6] round0 池：gov=${govReward0} proposal=${proposalReward0}（boost 池已在 §8 销毁 ${boostPool0}）；` +
      `round1 池：gov=${govReward1} proposal=${proposalReward1}；round2 池：gov=${govReward2} proposal=${proposalReward2}`,
  );
  check(
    '§6 单笔 + 批量后 totalRewardMinted = round1 + round0 + round2 的 (vote+boost) 之和',
    math1.voteReward + math1.boostReward + expectedBatch,
    await read('mint', 'totalRewardMinted', [CONTRACTS.token.address]),
  );
}

// ─── 5. 用例组 B：提案激励门槛 / 份额 / 未达门槛销毁（含多投票人的治理激励除法）─────

async function runProposalRewardFlow() {
  // 组 B 要在同一阶段里发 12 笔：成员5 授权/deposit/授权/质押（4）+ 双方加速（4）+ 两个推举（2）+ 两笔投票（2）
  const round = await ensurePhaseRoom(16, '§7 提案激励组');
  note(`[§7] round=${round}`);

  // 前置：成员5 取得治理权。同一轮一个身份只能推举 1 个提案（Submit.sol:329-341），
  // 而「未达门槛」必须有第 2 个被投票的提案 → 需要第 2 个有推举权/投票权的身份。
  await approveToken(CONTRACTS.token.address, ACCOUNT_4, CONTRACTS.stake.address, MEMBER5_TOKEN_IN);
  await send({
    from: ACCOUNT_4,
    to: CONTRACTS.weth.address,
    value: MEMBER5_PARENT_IN,
    data: encodeCall('WETH9', 'deposit', []),
  });
  await approveToken(CONTRACTS.weth.address, ACCOUNT_4, CONTRACTS.stake.address, MEMBER5_PARENT_IN);
  await send({
    from: ACCOUNT_4,
    to: CONTRACTS.stake.address,
    data: encodeCall('Stake', 'stakeLiquidity', [
      CONTRACTS.token.address,
      MEMBER5_TOKEN_IN,
      MEMBER5_PARENT_IN,
      MEMBER5_PHASES,
      MEMBER_5,
      DEADLINE,
    ]),
  });
  const member5Votes = await read('stake', 'govVotes', [CONTRACTS.token.address, round, MEMBER_5]);
  check('§7 前置：成员5 流动性质押后本轮获得治理权', true, member5Votes > 0n);
  check(
    '§7 前置：成员5 Submit.canSubmit = true（达到推举门槛）',
    true,
    await read('submit', 'canSubmit', [CONTRACTS.token.address, MEMBER_5]),
  );

  // 双方加速质押：让本轮 totalVoterBoost 由两个成员按不同份额组成（验证除法不是 100% 特例）
  await approveToken(CONTRACTS.token.address, ACCOUNT_0, CONTRACTS.stake.address, BOOST_AMOUNT);
  await send({
    from: ACCOUNT_0,
    to: CONTRACTS.stake.address,
    data: encodeCall('Stake', 'stakeBoost', [
      CONTRACTS.token.address,
      BOOST_AMOUNT,
      1n,
      MEMBER,
      DEADLINE,
    ]),
  });
  await approveToken(CONTRACTS.token.address, ACCOUNT_4, CONTRACTS.stake.address, BOOST_AMOUNT_5);
  await send({
    from: ACCOUNT_4,
    to: CONTRACTS.stake.address,
    data: encodeCall('Stake', 'stakeBoost', [
      CONTRACTS.token.address,
      BOOST_AMOUNT_5,
      MEMBER5_PHASES,
      MEMBER_5,
      DEADLINE,
    ]),
  });
  check(
    '§7 前置：成员1 本轮加速份额 = 加速质押额',
    BOOST_AMOUNT,
    await read('stake', 'validBoostShares', [CONTRACTS.token.address, round, MEMBER]),
  );
  check(
    '§7 前置：成员5 本轮加速份额 = 加速质押额',
    BOOST_AMOUNT_5,
    await read('stake', 'validBoostShares', [CONTRACTS.token.address, round, MEMBER_5]),
  );

  // 同一轮两个提案：X（成员5 的，只拿低票）、Y（成员1 的，拿高票）
  const { proposalId: proposalX } = await submitProposal(ACCOUNT_4, MEMBER_5, 'X');
  const { proposalId: proposalY } = await submitProposal(ACCOUNT_0, MEMBER, 'Y');
  const maxVote1 = await read('vote', 'maxVoteAmount', [CONTRACTS.token.address, MEMBER]);
  const maxVote5 = await read('vote', 'maxVoteAmount', [CONTRACTS.token.address, MEMBER_5]);
  const amountY = maxVote1; // 成员1 把本轮治理权全投给 Y
  const amountX = maxVote5; // 成员5 把本轮治理权全投给 X → 占比 < 提案门槛 5%
  const availableAtReserve = await read('mint', 'rewardAvailable', [CONTRACTS.token.address]);
  const reservedBefore = await read('mint', 'totalRewardReserved', [CONTRACTS.token.address]);
  await vote(ACCOUNT_0, MEMBER, [proposalY], [amountY]);
  await vote(ACCOUNT_4, MEMBER_5, [proposalX], [amountX]);
  const totalVote = await read('vote', 'totalVoteAmount', [CONTRACTS.token.address, round]);
  check('§7 本轮总票数 = 成员1 + 成员5 的投票额', amountX + amountY, totalVote);
  check(
    '§7 提案Y票数 = 成员1 投票额',
    amountY,
    await read('vote', 'voteAmountByProposalId', [CONTRACTS.token.address, round, proposalY]),
  );
  check(
    '§7 提案X票数 = 成员5 投票额',
    amountX,
    await read('vote', 'voteAmountByProposalId', [CONTRACTS.token.address, round, proposalX]),
  );
  check(
    '§7 本轮 totalVoterBoost = 两人加速份额之和',
    BOOST_AMOUNT + BOOST_AMOUNT_5,
    await read('vote', 'totalVoterBoost', [CONTRACTS.token.address, round]),
  );

  // 预留（本组再验一次 §4 恒等式）
  const govRatio = await read('mint', 'ROUND_REWARD_GOV_RATIO');
  const proposalRatio = await read('mint', 'ROUND_REWARD_PROPOSAL_RATIO');
  const minVoteRatio = await read('mint', 'PROPOSAL_REWARD_MIN_VOTE_RATIO');
  const govReward = await read('mint', 'govReward', [CONTRACTS.token.address, round]);
  const proposalReward = await read('mint', 'proposalReward', [CONTRACTS.token.address, round]);
  const reservedAfter = await read('mint', 'totalRewardReserved', [CONTRACTS.token.address]);
  checkPoolReservation(
    '§4 提案激励组',
    availableAtReserve,
    reservedBefore,
    govRatio,
    proposalRatio,
    govReward,
    proposalReward,
    reservedAfter,
  );

  // 推进阶段，让本轮结束（结算类调用都要求 RoundNotEnded 之外的状态）
  const step = await mineToNextPhase(round);
  check(
    '§5 提案激励组：currentPhase 增加、round 已结束',
    true,
    step.phase > round && (await read('vote', 'isRoundEnded', [round])),
  );

  // ═══ §6（补充）多投票人：治理激励按票数/加速份额比例拆分（除法不是 100% 特例）════
  const mathMember1 = await assertGovMath('§6 多投票人·成员1', round, MEMBER, false);
  const mathMember5 = await assertGovMath('§6 多投票人·成员5', round, MEMBER_5, false);
  check(
    '§6 多投票人：成员1 voteReward < votePool（占比 < 100%）',
    true,
    mathMember1.voteReward < mathMember1.votePool,
  );
  check(
    '§6 多投票人：成员5 voteReward < votePool（占比 < 100%）',
    true,
    mathMember5.voteReward < mathMember5.votePool,
  );
  check(
    '§6 多投票人：两人 voteReward 之和 ≤ votePool（floor 尾差留池）',
    true,
    mathMember1.voteReward + mathMember5.voteReward <= mathMember1.votePool,
  );

  // ═══ §7 提案激励门槛与份额 ═══════════════════════════════════════════════════════
  const minVoteAmount = mulDivCeil(totalVote, minVoteRatio, PRECISION);
  // 门槛的 ceil 定义式（不依赖常量）
  check(
    '§7 minVoteAmount = ceil(totalVoteAmount×ratio/1e18) 的 ceil 语义',
    true,
    minVoteAmount * PRECISION >= totalVote * minVoteRatio &&
      (minVoteAmount - 1n) * PRECISION < totalVote * minVoteRatio,
  );
  check('§7 提案Y 票数 ≥ 门槛（应可结算）', true, amountY >= minVoteAmount);
  check('§7 提案X 票数 < 门槛（应可销毁）', true, amountX < minVoteAmount);
  check(
    '§7 Mint.isProposalIdWithReward(Y) = 手算 true',
    true,
    await read('mint', 'isProposalIdWithReward', [CONTRACTS.token.address, round, proposalY]),
  );
  check(
    '§7 Mint.isProposalIdWithReward(X) = 手算 false',
    false,
    await read('mint', 'isProposalIdWithReward', [CONTRACTS.token.address, round, proposalX]),
  );
  const settlementYBefore = await read('mint', 'proposalRewardSettlement', [
    CONTRACTS.token.address,
    round,
    proposalY,
  ]);
  const settlementXBefore = await read('mint', 'proposalRewardSettlement', [
    CONTRACTS.token.address,
    round,
    proposalX,
  ]);
  const shareY = mulDiv(proposalReward, amountY, totalVote);
  const shareX = mulDiv(proposalReward, amountX, totalVote);
  check(
    '§7 settlement(Y).amount = floor(proposalReward×Y票数/总票数)',
    shareY,
    settlementYBefore[0],
  );
  check('§7 settlement(Y).status = Unsettled(0)', 0, Number(settlementYBefore[1]));
  check('§7 settlement(X).amount = 0（未达门槛时不给份额）', 0n, settlementXBefore[0]);
  check('§7 settlement(X).status = Unsettled(0)', 0, Number(settlementXBefore[1]));
  note(
    `[§7] totalVote=${totalVote} minVoteAmount=${minVoteAmount} X票=${amountX} Y票=${amountY} ` +
      `pool=${proposalReward} → shareX=${shareX} shareY=${shareY}`,
  );

  // 销毁未达门槛的提案（Mint.sol:152-191）
  const burnedBefore = await read('mint', 'totalRewardBurned', [CONTRACTS.token.address]);
  const burnTx = await send({
    from: ACCOUNT_0,
    to: CONTRACTS.mint.address,
    data: encodeCall('Mint', 'burnProposalReward', [CONTRACTS.token.address, round, proposalX]),
  });
  const burnedAfter = await read('mint', 'totalRewardBurned', [CONTRACTS.token.address]);
  const settlementXAfter = await read('mint', 'proposalRewardSettlement', [
    CONTRACTS.token.address,
    round,
    proposalX,
  ]);
  check('§7 销毁后 settlement(X).status = Burned(2)', 2, Number(settlementXAfter[1]));
  check('§7 销毁后 settlement(X).amount = 手算份额', shareX, settlementXAfter[0]);
  check('§7 totalRewardBurned 增量 = 手算份额', shareX, burnedAfter - burnedBefore);
  const burnEvent = decodeEvents(
    burnTx.receipt,
    CONTRACTS.mint.address,
    'Mint',
    'ProposalRewardBurned',
  )[0];
  check('§7 ProposalRewardBurned.amount = 手算份额', shareX, burnEvent.args.amount);
  check(
    '§7 ProposalRewardBurned.totalRewardBurned = 链上 totalRewardBurned',
    burnedAfter,
    burnEvent.args.totalRewardBurned,
  );
  check('§7 ProposalRewardBurned.round = round', round, burnEvent.args.round);
  check('§7 ProposalRewardBurned.proposalId = X', proposalX, burnEvent.args.proposalId);

  // 重复销毁不 revert（Mint.sol:163 直接 return），也不重复扣减
  const repeatBurn = await send({
    from: ACCOUNT_0,
    to: CONTRACTS.mint.address,
    data: encodeCall('Mint', 'burnProposalReward', [CONTRACTS.token.address, round, proposalX]),
  });
  check(
    '§7 重复 burnProposalReward 不 revert（Mint.sol:163 直接 return）',
    'success',
    repeatBurn.receipt.status,
  );
  check(
    '§7 重复销毁后 totalRewardBurned 不变',
    burnedAfter,
    await read('mint', 'totalRewardBurned', [CONTRACTS.token.address]),
  );
  check(
    '§7 重复销毁后 settlement(X).status 仍 = Burned(2)',
    2,
    Number(
      (
        await read('mint', 'proposalRewardSettlement', [CONTRACTS.token.address, round, proposalX])
      )[1],
    ),
  );
  // 过门槛的提案没有被误销毁
  check(
    '§7 过门槛提案Y 仍为 Unsettled(0)',
    0,
    Number(
      (
        await read('mint', 'proposalRewardSettlement', [CONTRACTS.token.address, round, proposalY])
      )[1],
    ),
  );
}

// ─── 6. main ────────────────────────────────────────────────────────────────────

async function main() {
  // ── §0 链可用性 / 地址 / 代码 / 身份 ──
  let chainId;
  try {
    chainId = await client.getChainId();
  } catch (error) {
    die(
      `连不上 ${RPC}：${error instanceof Error ? error.message : error}\n` +
        '  专用验证链：cd ../anvil && make bootstrap PORT=8566（之后 node scripts/verify/gov-core-contract.mjs --rpc http://127.0.0.1:8566）。\n' +
        '  本脚本拒绝 8545（人工链）与 8555（e2e 链）。',
    );
  }
  if (chainId !== CHAIN_ID) die(`期望 chainId=${CHAIN_ID}（anvil dev），${RPC} 返回 ${chainId}`);

  for (const contract of Object.values(CONTRACTS)) {
    const code = await client.getCode({ address: contract.address });
    if (code === undefined || code === '0x') {
      die(
        `地址 ${contract.address}（${contract.label}）上没有合约代码：network.json 与当前链不匹配。\n` +
          '  先 `cd ../anvil && make bootstrap PORT=8566` 生成地址簿与 ABI。',
      );
    }
  }

  const startBlock = await latestBlock();
  const startPhase = await read('phase', 'currentPhase');
  const startPhaseBlocks = await read('phase', 'currentPhaseBlocks');
  note(`[gov-core-contract] chain ${chainId} at ${RPC}（专用验证链；8545 / 8555 未触碰）`);
  note(
    `[§0] block=${startBlock} phase=${startPhase} phaseBlocks=${startPhaseBlocks} ` +
      `launch.isLOVE20Token(token)=${await read('launch', 'isLOVE20Token', [CONTRACTS.token.address])}`,
  );
  check(
    '§0 MemberNFT.ownerOf(1) = anvil #0（本脚本主交易账户）',
    ACCOUNT_0.toLowerCase(),
    String(await read('memberNFT', 'ownerOf', [MEMBER])).toLowerCase(),
  );
  check(
    '§0 MemberNFT.ownerOf(5) = anvil #4（§7 的第二推举人/投票人）',
    ACCOUNT_4.toLowerCase(),
    String(await read('memberNFT', 'ownerOf', [MEMBER_5])).toLowerCase(),
  );
  check(
    '§0 对照账户没有身份 NFT（canSubmit 守卫用）',
    false,
    await read('submit', 'canSubmit', [CONTRACTS.token.address, 99n]),
  );
  check(
    '§0 无 NFT 账户的 TestLOVE20 余额 = 0（对照）',
    0n,
    await read('token', 'balanceOf', [NO_NFT_ACCOUNT]),
  );

  // ── 采矿模式：为了「一交易一区块 + 阶段边界可复现」，临时关掉 interval mining、打开 automine ──
  const mining = await enterDeterministicMining();
  let exitPhase = startPhase;
  let exitBlock = startBlock;
  try {
    await withSnapshot(runGovFlow);
    note('[snapshot] 用例组 A 已回滚（链上状态与跑前一致）');
    await withSnapshot(runProposalRewardFlow);
    note('[snapshot] 用例组 B 已回滚（链上状态与跑前一致）');

    exitBlock = await latestBlock();
    exitPhase = await read('phase', 'currentPhase');
  } finally {
    await restoreMining(mining);
  }

  note(`[§0] 终：block=${exitBlock} phase=${exitPhase}（用例组均已回滚）`);
  const passed = results.length - failures;
  console.log(`\n[gov-core-contract] ${passed}/${results.length} PASS`);
  if (failures > 0) process.exitCode = 1;
}

await main().catch((error) => {
  const detail =
    error instanceof FatalError
      ? error.message
      : error instanceof Error
        ? (error.stack ?? error.message)
        : String(error);
  console.error(`[gov-core-contract] FAILED: ${detail}`);
  process.exitCode = 1;
});
