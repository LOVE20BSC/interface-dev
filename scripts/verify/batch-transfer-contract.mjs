#!/usr/bin/env node
// 批量转账 合约线（三线校验 §2）:
//   node scripts/verify/batch-transfer-contract.mjs
//
// 直连验证链（默认 http://127.0.0.1:8569，即 `make -C ../anvil bootstrap PORT=8569`
// 的专用链），用 viem test client 走 anvil 的 unlocked 账户发交易，逐 wei 断言
// docs/product/three-line/batch-transfer.md §1 的理论值。整个脚本前后
// snapshot/revert，跑完链上状态与跑前完全一致；绝不使用前端的计算结果，也绝不触碰
// 8545（人工链）。
//
// 用例顺序：A 原生 5 行（重复地址合并）→ B ERC20 批量 + approve → C 一行非法
// （纯 eth_call）→ D 合计超余额（纯 eth_call / 被节点拒绝）→ E 整批 revert 后状态
// 不变。A 与 E 都从 #6 出金，但每条用例都在自己的「before」读数上断言，互不影响。
//
// 退出码非 0 = 失败。

import {
  createTestClient,
  decodeEventLog,
  encodeFunctionData,
  http,
  parseAbi,
  publicActions,
} from 'viem';

const RPC = (process.env.VERIFY_RPC ?? 'http://127.0.0.1:8569').replace(/\/+$/, '');
const CHAIN_ID = 31337;

// 地址簿 batchTransfer（anvil31337_dev 导出一致）与首币。
const BATCH_TRANSFER = '0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690';
const TOKEN = '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF'; // TestLOVE20, decimals 18
const ZERO = '0x0000000000000000000000000000000000000000';

// anvil 固定账户（mnemonic test … junk），与理论线 §0 一一对应。
const ACCOUNT_1 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // ERC20 发送方
const ACCOUNT_2 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // ERC20 收款方
const ACCOUNT_5 = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'; // 收款方
const ACCOUNT_6 = '0x976EA74026E726554dB657fA54763abd0C3a0aa9'; // 原生发送方
const ACCOUNT_7 = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'; // 收款方
const ACCOUNT_8 = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f'; // 收款方
const ACCOUNT_9 = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720'; // 收款方

const batchAbi = parseAbi([
  'function batchTransferNative(address[] recipients, uint256[] amounts, uint256 gasLimit) payable returns (uint256 totalAmount)',
  'function batchTransferERC20(address tokenAddress, address[] recipients, uint256[] amounts, uint256 gasLimit) returns (uint256 totalAmount)',
  'function nativeBalances(address[] accounts) view returns (uint256[] balances)',
  'function erc20Balances(address tokenAddress, address[] accounts) view returns (uint256[] balances)',
  'event NativeBatchTransferred(address indexed sender, uint256 totalAmount, uint256 recipientCount)',
  'event ERC20BatchTransferred(address indexed tokenAddress, address indexed sender, uint256 totalAmount, uint256 recipientCount)',
  'error EmptyBatch()',
  'error ArrayLengthMismatch(uint256 recipientsLength, uint256 amountsLength)',
  'error ZeroRecipient(uint256 index)',
  'error ZeroAmount(uint256 index)',
  'error ZeroGasLimit()',
  'error NativeValueMismatch(uint256 expected, uint256 actual)',
  'error NativeTransferFailed(uint256 index, address recipient, uint256 amount, bytes32 errorHash, uint256 errorLength)',
  'error ERC20TransferFailed(address tokenAddress, uint256 index, address recipient, uint256 amount, bytes32 errorHash, uint256 errorLength)',
  'error ERC20InsufficientBalance(address tokenAddress, address owner, uint256 required, uint256 available)',
  'error ERC20InsufficientAllowance(address tokenAddress, address owner, address spender, uint256 required, uint256 available)',
  'error TokenNotContract(address tokenAddress)',
]);

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

// anvil test actions (snapshot/revert/sendUnsignedTransaction) + public reads.
const client = createTestClient({ mode: 'anvil', transport: http(RPC) }).extend(publicActions);

const results = [];
let failures = 0;

function check(label, expected, actual) {
  const pass = expected === actual;
  if (!pass) failures += 1;
  results.push({ label, expected, actual, pass });
  let suffix = '';
  if (!pass) {
    try {
      suffix = ` diff=${BigInt(actual) - BigInt(expected)}`;
    } catch {
      suffix = '';
    }
  }
  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${label}: expected=${expected} actual=${actual}${suffix}`,
  );
}

async function ethBalance(address) {
  return client.getBalance({ address });
}

async function tokenBalance(address) {
  return client.readContract({
    address: TOKEN,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });
}

async function allowance(owner) {
  return client.readContract({
    address: TOKEN,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, BATCH_TRANSFER],
  });
}

async function nativeBalances(addresses) {
  return client.readContract({
    address: BATCH_TRANSFER,
    abi: batchAbi,
    functionName: 'nativeBalances',
    args: [addresses],
  });
}

async function erc20Balances(addresses) {
  return client.readContract({
    address: BATCH_TRANSFER,
    abi: batchAbi,
    functionName: 'erc20Balances',
    args: [TOKEN, addresses],
  });
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

function batchNativeData(recipients, amounts, gasLimit) {
  return encodeFunctionData({
    abi: batchAbi,
    functionName: 'batchTransferNative',
    args: [recipients, amounts, BigInt(gasLimit)],
  });
}

function batchErc20Data(token, recipients, amounts, gasLimit) {
  return encodeFunctionData({
    abi: batchAbi,
    functionName: 'batchTransferERC20',
    args: [token, recipients, amounts, BigInt(gasLimit)],
  });
}

function approveData(amount) {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [BATCH_TRANSFER, amount],
  });
}

/** Walks a viem error chain for a decoded custom-error name (simulateContract). */
function contractErrorName(error) {
  const seen = new Set();
  const walk = (value, depth) => {
    if (depth > 6 || value === null || typeof value !== 'object' || seen.has(value)) return undefined;
    seen.add(value);
    const data = value.data;
    if (data !== null && typeof data === 'object' && typeof data.errorName === 'string') {
      return data.errorName;
    }
    if (typeof value.errorName === 'string') return value.errorName;
    return walk(value.cause, depth + 1) ?? walk(value.error, depth + 1);
  };
  return walk(error, 0);
}

/** Expects a simulated call to revert with the named custom error (no chain write). */
async function expectRevert(label, run, errorName) {
  let actual;
  try {
    await run();
  } catch (error) {
    actual = contractErrorName(error) ?? 'undecoded revert';
  }
  check(label, errorName, actual);
}

function eventOf(receipt, abi, eventName) {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (decoded.eventName === eventName) return decoded.args;
    } catch {
      // Not one of our events.
    }
  }
  return undefined;
}

async function main() {
  const chainId = await client.getChainId();
  if (chainId !== CHAIN_ID) {
    throw new Error(`expected chain ${CHAIN_ID} at ${RPC}, got ${chainId}`);
  }
  console.log(`[batch-transfer-contract] chain ${chainId} at ${RPC}`);

  const snapshot = await client.snapshot();
  try {
    // ── §0 初始状态快照 ─────────────────────────────────────────────────────
    check('§0 BATCH_TRANSFER 有 bytecode', true, (await client.getCode({ address: BATCH_TRANSFER })) !== undefined);
    check('§0 #1 TestLOVE20 初始余额', 99799100000000000000000000n, await tokenBalance(ACCOUNT_1));
    check(
      '§0 allowance(#1 → BatchTransfer) 初始值',
      0n,
      await allowance(ACCOUNT_1),
    );
    check('§0 #5 ETH 初始余额', 10000000000000000000000n, await ethBalance(ACCOUNT_5));
    check('§0 #6 ETH 初始余额', 10000000000000000000000n, await ethBalance(ACCOUNT_6));
    check('§0 #9 ETH 初始余额', 10000000000000000000000n, await ethBalance(ACCOUNT_9));

    // ── 用例 A：原生 5 行，重复地址合并 ─────────────────────────────────────
    const aRecipients = [ACCOUNT_5, ACCOUNT_7, ACCOUNT_8, ACCOUNT_9];
    const aAmounts = [
      150000000000000000n, // #5 第 1 行 0.1 + 第 4 行 0.05 合并
      200000000000000000n, // #7
      150000000000000000n, // #8
      1000000000000n, // #9 0.000001
    ];
    const aTotal = 500001000000000000n;
    check('A 合计 = Σ amounts', 500001000000000000n, aAmounts.reduce((sum, value) => sum + value, 0n));
    const aBefore = await nativeBalances(aRecipients);
    check('A §0 #5 预余额', 10000000000000000000000n, aBefore[0]);
    check('A §0 #6 发送前 ETH', 10000000000000000000000n, await ethBalance(ACCOUNT_6));

    const txA = await send({
      from: ACCOUNT_6,
      to: BATCH_TRANSFER,
      value: aTotal,
      data: batchNativeData(aRecipients, aAmounts, 30000),
    });
    const feeA = txA.receipt.gasUsed * txA.receipt.effectiveGasPrice;
    console.log(`[A] tx ${txA.hash} gasUsed=${txA.receipt.gasUsed} fee=${feeA}`);
    check('A 交易成功', 'success', txA.receipt.status);

    const aAfter = await nativeBalances(aRecipients);
    check('A #5 到账额', aAmounts[0], aAfter[0] - aBefore[0]);
    check('A #5 终态', 10000150000000000000000n, aAfter[0]);
    check('A #7 到账额', aAmounts[1], aAfter[1] - aBefore[1]);
    check('A #7 终态', 10000200000000000000000n, aAfter[1]);
    check('A #8 到账额', aAmounts[2], aAfter[2] - aBefore[2]);
    check('A #8 终态', 10000150000000000000000n, aAfter[2]);
    check('A #9 到账额', aAmounts[3], aAfter[3] - aBefore[3]);
    check('A #9 终态', 10000000001000000000000n, aAfter[3]);
    check('A 发送方扣款 = 合计 + fee', aTotal + feeA, 10000000000000000000000n - (await ethBalance(ACCOUNT_6)));

    const eventA = eventOf(txA.receipt, batchAbi, 'NativeBatchTransferred');
    check('A 事件 totalAmount', aTotal, eventA?.totalAmount);
    check('A 事件 recipientCount', 4n, eventA?.recipientCount);

    // ── 用例 B：ERC20 批量 3 行 + approve ───────────────────────────────────
    const bRecipients = [ACCOUNT_5, ACCOUNT_2, ACCOUNT_7];
    const bAmounts = [1500000000000000000n, 500000000000000000n, 2000000000000n];
    const bTotal = 2000002000000000000n;
    check('B 合计 = Σ amounts', 2000002000000000000n, bAmounts.reduce((sum, value) => sum + value, 0n));
    const bTokenBefore = await tokenBalance(ACCOUNT_1);
    check('B §0 #1 TestLOVE20 预余额', 99799100000000000000000000n, bTokenBefore);
    const bRecipientBefore = await erc20Balances(bRecipients);
    check('B §0 #2 预余额', 99999099999910000000000000n, bRecipientBefore[1]);

    const txApprove = await send({
      from: ACCOUNT_1,
      to: TOKEN,
      data: approveData(bTotal),
    });
    console.log(`[B] approve tx ${txApprove.hash}`);
    check('B 授权交易成功', 'success', txApprove.receipt.status);
    check('B 授权后 allowance', bTotal, await allowance(ACCOUNT_1));

    const txB = await send({
      from: ACCOUNT_1,
      to: BATCH_TRANSFER,
      data: batchErc20Data(TOKEN, bRecipients, bAmounts, 60000),
    });
    console.log(`[B] batch tx ${txB.hash} gasUsed=${txB.receipt.gasUsed}`);
    check('B 批量交易成功', 'success', txB.receipt.status);

    const bRecipientAfter = await erc20Balances(bRecipients);
    check('B #5 到账额', bAmounts[0], bRecipientAfter[0] - bRecipientBefore[0]);
    check('B #5 终态', 1500000000000000000n, bRecipientAfter[0]);
    check('B #2 到账额', bAmounts[1], bRecipientAfter[1] - bRecipientBefore[1]);
    check('B #2 终态', 99999100499910000000000000n, bRecipientAfter[1]);
    check('B #7 到账额', bAmounts[2], bRecipientAfter[2] - bRecipientBefore[2]);
    check('B #7 终态', 2000000000000n, bRecipientAfter[2]);
    check('B 发送方减少 = 合计', bTotal, bTokenBefore - (await tokenBalance(ACCOUNT_1)));
    check('B 发送方终态', 99799097999998000000000000n, await tokenBalance(ACCOUNT_1));
    check('B 批量后 allowance', 0n, await allowance(ACCOUNT_1));

    const eventB = eventOf(txB.receipt, batchAbi, 'ERC20BatchTransferred');
    check('B 事件 totalAmount', bTotal, eventB?.totalAmount);
    check('B 事件 recipientCount', 3n, eventB?.recipientCount);

    // ── 用例 C：一行非法（纯 eth_call，不写链）──────────────────────────────
    const cBefore = await nativeBalances([ACCOUNT_5, ACCOUNT_7]);
    await expectRevert(
      'C 零金额回滚 ZeroAmount',
      () =>
        client.simulateContract({
          account: ACCOUNT_1,
          address: BATCH_TRANSFER,
          abi: batchAbi,
          functionName: 'batchTransferNative',
          args: [[ACCOUNT_5], [0n], 30000n],
        }),
      'ZeroAmount',
    );
    await expectRevert(
      'C 零地址回滚 ZeroRecipient',
      () =>
        client.simulateContract({
          account: ACCOUNT_1,
          address: BATCH_TRANSFER,
          abi: batchAbi,
          functionName: 'batchTransferNative',
          args: [[ZERO], [1n], 30000n],
        }),
      'ZeroRecipient',
    );
    await expectRevert(
      'C 数组长度不一致回滚 ArrayLengthMismatch',
      () =>
        client.simulateContract({
          account: ACCOUNT_1,
          address: BATCH_TRANSFER,
          abi: batchAbi,
          functionName: 'batchTransferNative',
          args: [[ACCOUNT_5], [1n, 2n], 30000n],
        }),
      'ArrayLengthMismatch',
    );
    const cAfter = await nativeBalances([ACCOUNT_5, ACCOUNT_7]);
    check('C 失败调用后 #5 余额不变', cBefore[0], cAfter[0]);
    check('C 失败调用后 #7 余额不变', cBefore[1], cAfter[1]);

    // ── 用例 D：合计超余额（纯 eth_call / 节点拒绝）─────────────────────────
    // #8 still holds 0 TestLOVE20 at this point (case B credited #5), so the
    // balance check — which the contract runs before the allowance check — fails.
    await expectRevert(
      'D1 ERC20 余额不足回滚 ERC20InsufficientBalance',
      () =>
        client.simulateContract({
          account: ACCOUNT_8,
          address: BATCH_TRANSFER,
          abi: batchAbi,
          functionName: 'batchTransferERC20',
          args: [TOKEN, [ACCOUNT_2], [1000000000000000000n], 60000n],
        }),
      'ERC20InsufficientBalance',
    );
    await expectRevert(
      'D2 msg.value 与合计不一致回滚 NativeValueMismatch',
      () =>
        client.simulateContract({
          account: ACCOUNT_6,
          address: BATCH_TRANSFER,
          abi: batchAbi,
          functionName: 'batchTransferNative',
          args: [[ACCOUNT_5], [100000000000000000n], 30000n],
          value: 0n,
        }),
      'NativeValueMismatch',
    );
    let overspendRejected = false;
    try {
      await client.sendUnsignedTransaction({
        from: ACCOUNT_5,
        to: BATCH_TRANSFER,
        value: 10000500000000000000000n,
        data: batchNativeData([ACCOUNT_5], [100000000000000000n], 30000),
      });
    } catch {
      overspendRejected = true;
    }
    check('D2 超过余额的原生交易被节点拒绝', true, overspendRejected);
    check('D2 被拒后 #8 TestLOVE20 余额不变', 0n, await tokenBalance(ACCOUNT_8));

    // ── 用例 E：整批 revert 后状态不变 ─────────────────────────────────────
    const eRecipients = [ACCOUNT_5, TOKEN, ACCOUNT_7];
    const eAmounts = [100000000000000000n, 100000000000000000n, 100000000000000000n];
    const eTotal = 300000000000000000n;
    const eNativeBefore = await nativeBalances([ACCOUNT_5, ACCOUNT_7]);
    const eTokenEthBefore = await ethBalance(TOKEN);
    const eSenderBefore = await ethBalance(ACCOUNT_6);

    const txE = await send({
      from: ACCOUNT_6,
      to: BATCH_TRANSFER,
      value: eTotal,
      data: batchNativeData(eRecipients, eAmounts, 30000),
    });
    const feeE = txE.receipt.gasUsed * txE.receipt.effectiveGasPrice;
    console.log(`[E] tx ${txE.hash} status=${txE.receipt.status} fee=${feeE}`);
    check('E 整批交易回滚', 'reverted', txE.receipt.status);

    const eNativeAfter = await nativeBalances([ACCOUNT_5, ACCOUNT_7]);
    check('E #5 余额不变', eNativeBefore[0], eNativeAfter[0]);
    check('E #7 余额不变', eNativeBefore[1], eNativeAfter[1]);
    check('E 代币合约 ETH 不变', eTokenEthBefore, await ethBalance(TOKEN));
    check('E 发送方只扣 fee', feeE, eSenderBefore - (await ethBalance(ACCOUNT_6)));

    // ── 回滚并证明链上状态回到跑前 ─────────────────────────────────────────
    await client.revert({ id: snapshot });
    check('回滚后 #1 TestLOVE20 余额', 99799100000000000000000000n, await tokenBalance(ACCOUNT_1));
    check('回滚后 #1 allowance', 0n, await allowance(ACCOUNT_1));
    check('回滚后 #6 ETH 余额', 10000000000000000000000n, await ethBalance(ACCOUNT_6));
    check('回滚后 #5 ETH 余额', 10000000000000000000000n, await ethBalance(ACCOUNT_5));
  } catch (error) {
    await client.revert({ id: snapshot }).catch(() => {});
    throw error;
  }

  console.log('');
  console.log(`[batch-transfer-contract] ${results.length - failures}/${results.length} checks passed`);
  if (failures > 0) {
    console.error(`[batch-transfer-contract] FAIL: ${failures} mismatch(es) against the theory line`);
    process.exit(1);
  }
  console.log('[batch-transfer-contract] ALL CHECKS PASSED (theory line §1 ↔ chain)');
}

main().catch((error) => {
  console.error('[batch-transfer-contract] FATAL:', error instanceof Error ? error.message : error);
  process.exit(1);
});
