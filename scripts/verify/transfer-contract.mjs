#!/usr/bin/env node
// 代币转账 合约线（三线校验 §2）:
//   node scripts/verify/transfer-contract.mjs
//
// 直连验证链（默认 http://127.0.0.1:8566，即 `make -C ../anvil bootstrap PORT=8566`
// 的专用链），用 viem test client 走 anvil 的 unlocked 账户发交易，逐 wei 断言
// docs/product/three-line/transfer.md §1 的理论值。整个脚本前后 snapshot/revert，
// 跑完链上状态与跑前完全一致；绝不使用前端的计算结果，也绝不触碰 8545。
//
// 用例顺序：C1 → C2 → A → B → D → E。C/A/B/E 各自触碰的账户与资产两两不重叠，
// 所以每个用例的「初始状态」都仍是理论线 §0 的快照值（C1 的失败不写链）。
//
// 退出码非 0 = 失败。

import { createTestClient, encodeFunctionData, http, parseAbi, publicActions } from 'viem';

const RPC = (process.env.VERIFY_RPC ?? 'http://127.0.0.1:8566').replace(/\/+$/, '');
const CHAIN_ID = 31337;

// anvil 固定账户（mnemonic test … junk），与理论线 §0 一一对应。
const ACCOUNT_1 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // ERC20 正常路径发送方
const ACCOUNT_2 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // 按身份 NFT 收款方
const ACCOUNT_4 = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'; // 按身份 NFT 发送方
const ACCOUNT_5 = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'; // 原生/ERC20 收款方
const ACCOUNT_6 = '0x976EA74026E726554dB657fA54763abd0C3a0aa9'; // 原生发送方

const TOKEN = '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF'; // TestLOVE20
const MEMBER_NFT = '0x610178dA211FEF7D417bC0e6FeD39F05609AD788';
const PAIR = '0x3FC12a5abAe69C8Eee58C37cEDC266751507620D'; // 地址簿 pair / UNI-V2
const ROUTER = '0x0165878A594ca255338adfa4d48449f69242Eb8F';

const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
]);
const memberNft = parseAbi([
  'function ownerOf(uint256) view returns (address)',
  'function memberName(uint256) view returns (string)',
]);

// anvil test actions (snapshot/revert/sendUnsignedTransaction) + public reads.
const client = createTestClient({ mode: 'anvil', transport: http(RPC) }).extend(publicActions);

const results = [];
let failures = 0;

function check(label, expected, actual) {
  const pass = expected === actual;
  if (!pass) failures += 1;
  results.push({ label, expected, actual, pass });
  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${label}: expected=${expected} actual=${actual}` +
      (pass ? '' : ` diff=${BigInt(actual) - BigInt(expected)}`),
  );
}

async function tokenBalance(address) {
  return client.readContract({
    address: TOKEN,
    abi: erc20,
    functionName: 'balanceOf',
    args: [address],
  });
}

function transferData(to, amount) {
  return encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [to, amount] });
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

async function main() {
  const chainId = await client.getChainId();
  if (chainId !== CHAIN_ID) {
    throw new Error(`expected chain ${CHAIN_ID} at ${RPC}, got ${chainId}`);
  }
  console.log(`[transfer-contract] chain ${chainId} at ${RPC}`);

  const snapshot = await client.snapshot();
  try {
    // ── 初始状态快照（对照 §0） ──────────────────────────────────────────────
    check(
      '§0 ACCOUNT_6 ETH 初始余额',
      10000000000000000000000n,
      await client.getBalance({ address: ACCOUNT_6 }),
    );
    check(
      '§0 ACCOUNT_5 ETH 初始余额',
      10000000000000000000000n,
      await client.getBalance({ address: ACCOUNT_5 }),
    );
    check('§0 ACCOUNT_5 TestLOVE20 初始余额', 0n, await tokenBalance(ACCOUNT_5));

    // ── 用例 C1：ERC20 余额不足（ACCOUNT_5 余额 0，尝试转 1）────────────────
    const cAmount = 1000000000000000000n;
    let cReverted = false;
    try {
      await client.call({
        account: ACCOUNT_5,
        to: TOKEN,
        data: transferData(ACCOUNT_5, cAmount),
      });
    } catch {
      cReverted = true;
    }
    check('C1 余额不足的 transfer 被拒绝', true, cReverted);
    check('C1 失败后发送方余额不变', 0n, await tokenBalance(ACCOUNT_5));

    // ── 用例 C2：原生币余额不足（含 gas 预留）──────────────────────────────
    const c2Balance = await client.getBalance({ address: ACCOUNT_5 });
    check('C2 ACCOUNT_5 ETH 余额', 10000000000000000000000n, c2Balance);
    const c2Spendable = c2Balance - 1000000000000000n; // 理论线预留 0.001
    check('C2 可花余额（含预留）', 9999999000000000000000n, c2Spendable);
    let c2Rejected = false;
    try {
      await client.sendUnsignedTransaction({ from: ACCOUNT_5, to: ACCOUNT_6, value: c2Balance });
      await client.mine({ blocks: 1 }).catch(() => {});
    } catch {
      c2Rejected = true;
    }
    check('C2 用全部原生币转账被拒绝', true, c2Rejected);

    // ── 用例 A：原生转账 0.1 ETH, ACCOUNT_6 → ACCOUNT_5 ─────────────────────
    const sBefore = await client.getBalance({ address: ACCOUNT_6 });
    const rBefore = await client.getBalance({ address: ACCOUNT_5 });
    const amountA = 100000000000000000n;
    const txA = await send({ from: ACCOUNT_6, to: ACCOUNT_5, value: amountA });
    const gasCostA = txA.receipt.gasUsed * txA.receipt.effectiveGasPrice;
    const sAfterA = await client.getBalance({ address: ACCOUNT_6 });
    const rAfterA = await client.getBalance({ address: ACCOUNT_5 });
    console.log(
      `[A] tx ${txA.hash} gasUsed=${txA.receipt.gasUsed} effectiveGasPrice=${txA.receipt.effectiveGasPrice} fee=${gasCostA}`,
    );
    check('A 收款方 ETH 增加 = amount', amountA, rAfterA - rBefore);
    check('A 收款方 ETH 终态 = 10000.1 ETH', 10000100000000000000000n, rAfterA);
    check('A 发送方扣款 = amount + fee', amountA + gasCostA, sBefore - sAfterA);

    // ── 用例 B：ERC20 非整数转账 1.5 TestLOVE20, ACCOUNT_1 → ACCOUNT_5 ──────
    const amountB = 1500000000000000000n;
    const bSenderBefore = await tokenBalance(ACCOUNT_1);
    const bReceiverBefore = await tokenBalance(ACCOUNT_5);
    check('B 发送方 TestLOVE20 初始余额', 99799100000000000000000000n, bSenderBefore);
    check('B 收款方 TestLOVE20 初始余额', 0n, bReceiverBefore);
    const txB = await send({
      from: ACCOUNT_1,
      to: TOKEN,
      data: transferData(ACCOUNT_5, amountB),
    });
    console.log(`[B] tx ${txB.hash}`);
    check('B 发送方 TestLOVE20 终态', 99799098500000000000000000n, await tokenBalance(ACCOUNT_1));
    check('B 收款方 TestLOVE20 终态', amountB, await tokenBalance(ACCOUNT_5));

    // ── 用例 D：地址簿已知合约（门禁用例，不发交易）────────────────────────
    const pairCode = await client.getCode({ address: PAIR });
    const routerCode = await client.getCode({ address: ROUTER });
    check('D pair 有 bytecode（已知合约）', true, pairCode !== undefined && pairCode !== '0x');
    check('D router 有 bytecode', true, routerCode !== undefined && routerCode !== '0x');

    // ── 用例 E：按身份 NFT 收款 #2, 2.5 TestLOVE20, ACCOUNT_4 → owner(#2) ───
    const owner2 = await client.readContract({
      address: MEMBER_NFT,
      abi: memberNft,
      functionName: 'ownerOf',
      args: [2n],
    });
    const name2 = await client.readContract({
      address: MEMBER_NFT,
      abi: memberNft,
      functionName: 'memberName',
      args: [2n],
    });
    check('E ownerOf(2)', ACCOUNT_2.toLowerCase(), owner2.toLowerCase());
    check('E memberName(2)', 'Testdev-member-1', name2);

    const amountE = 2500000000000000000n;
    const eSenderBefore = await tokenBalance(ACCOUNT_4);
    const eReceiverBefore = await tokenBalance(ACCOUNT_2);
    check('E 发送方 TestLOVE20 初始余额', 99999099999639999945999997n, eSenderBefore);
    check('E 收款方 TestLOVE20 初始余额', 99999099999910000000000000n, eReceiverBefore);
    const txE = await send({ from: ACCOUNT_4, to: TOKEN, data: transferData(owner2, amountE) });
    console.log(`[E] tx ${txE.hash}`);
    check('E 发送方 TestLOVE20 终态', 99999097499639999945999997n, await tokenBalance(ACCOUNT_4));
    check('E 收款方 TestLOVE20 终态', 99999102499910000000000000n, await tokenBalance(ACCOUNT_2));

    // ── 回滚并证明链上状态回到跑前 ─────────────────────────────────────────
    await client.revert({ id: snapshot });
    check(
      '回滚后 ACCOUNT_6 ETH 余额',
      10000000000000000000000n,
      await client.getBalance({ address: ACCOUNT_6 }),
    );
    check('回滚后 ACCOUNT_5 TestLOVE20 余额', 0n, await tokenBalance(ACCOUNT_5));
    check(
      '回滚后 ACCOUNT_1 TestLOVE20 余额',
      99799100000000000000000000n,
      await tokenBalance(ACCOUNT_1),
    );
  } catch (error) {
    await client.revert({ id: snapshot }).catch(() => {});
    throw error;
  }

  console.log('');
  console.log(`[transfer-contract] ${results.length - failures}/${results.length} checks passed`);
  if (failures > 0) {
    console.error(`[transfer-contract] FAIL: ${failures} mismatch(es) against the theory line`);
    process.exit(1);
  }
  console.log('[transfer-contract] ALL CHECKS PASSED (theory line §1 ↔ chain)');
}

main().catch((error) => {
  console.error('[transfer-contract] FATAL:', error instanceof Error ? error.message : error);
  process.exit(1);
});
