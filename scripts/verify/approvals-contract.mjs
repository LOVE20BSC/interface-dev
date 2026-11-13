#!/usr/bin/env node
// 代币授权 合约线（三线校验 §2）:
//   node scripts/verify/approvals-contract.mjs
//
// 直连验证链（默认 http://127.0.0.1:8567，即 `make -C ../anvil bootstrap PORT=8567`
// 的专用链），用 viem test client 走 anvil 的 unlocked 账户发 approve，逐 wei 断言
// docs/product/three-line/approvals.md §1 的理论值。整个脚本前后 snapshot/revert，
// 跑完链上状态与跑前完全一致；绝不使用前端的计算结果，也绝不触碰 8545。
//
// 用例顺序 A → B → C → D → E → F → G。A/B 用 router、C/D 用 stake、E 用 vote/submit、
// F 用 mint、G 用自定义 EOA，各用例之间只有同一条用例内部有先后依赖，因此共用
// 一个快照即可。
//
// 退出码非 0 = 失败。

import { createTestClient, encodeFunctionData, http, parseAbi, publicActions } from 'viem';

const RPC = (process.env.VERIFY_RPC ?? 'http://127.0.0.1:8567').replace(/\/+$/, '');
const CHAIN_ID = 31337;

// anvil 固定账户（mnemonic test … junk），与理论线 §0 一一对应。
const ACCOUNT_1 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // 唯一写账户
const CUSTOM_SPENDER = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'; // EOA，#5

const TOKEN = '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF'; // TestLOVE20
const ROUTER = '0x0165878A594ca255338adfa4d48449f69242Eb8F';
const STAKE = '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e';
const VOTE = '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82';
const SUBMIT = '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0';
const MINT = '0x9A676e781A523b5d0C0e43731313A708CB607508';

// 理论线 §1 写死的数值（脚本独立重算，不 import 前端代码）。
const MAX_UINT256 = 2n ** 256n - 1n;
const THRESHOLD = 2n ** 255n;
const CONCRETE = 1234567890123456789n;
const CUSTOM_AMOUNT = 2500000000000000000n;
const INITIAL_BALANCE = 99799100000000000000000000n;

const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);
const token = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);

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

async function allowance(spender) {
  return client.readContract({
    address: TOKEN,
    abi: erc20,
    functionName: 'allowance',
    args: [ACCOUNT_1, spender],
  });
}

async function balance() {
  return client.readContract({
    address: TOKEN,
    abi: erc20,
    functionName: 'balanceOf',
    args: [ACCOUNT_1],
  });
}

async function approve(spender, amount) {
  const data = encodeFunctionData({ abi: erc20, functionName: 'approve', args: [spender, amount] });
  const hash = await client.sendUnsignedTransaction({ from: ACCOUNT_1, to: TOKEN, data });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`approve ${spender} reverted (tx ${hash})`);
  return hash;
}

async function main() {
  const chainId = await client.getChainId();
  if (chainId !== CHAIN_ID) {
    throw new Error(`expected chain ${CHAIN_ID} at ${RPC}, got ${chainId}`);
  }
  console.log(`[approvals-contract] chain ${chainId} at ${RPC}`);

  const snapshot = await client.snapshot();
  try {
    // ── §0 初始状态 ─────────────────────────────────────────────────────────
    check(
      '§0 TestLOVE20 symbol',
      'TestLOVE20',
      await client.readContract({ address: TOKEN, abi: token, functionName: 'symbol' }),
    );
    check(
      '§0 TestLOVE20 decimals',
      18,
      await client.readContract({ address: TOKEN, abi: token, functionName: 'decimals' }),
    );
    check('§0 ACCOUNT_1 TestLOVE20 初始余额', INITIAL_BALANCE, await balance());
    check('§0 A 初始 allowance(#1, router)', 0n, await allowance(ROUTER));

    // ── 用例 A：未授权（初始态）────────────────────────────────────────────
    check('A allowance(#1, router) = 0', 0n, await allowance(ROUTER));

    // ── 用例 B：长期授权 = maxUint256 ───────────────────────────────────────
    const bHash = await approve(ROUTER, MAX_UINT256);
    console.log(`[B] approve(router, maxUint256) tx ${bHash}`);
    check('B allowance(#1, router) = maxUint256', MAX_UINT256, await allowance(ROUTER));
    check('B maxUint256 >= 2^255', true, MAX_UINT256 >= THRESHOLD);

    // ── 用例 C：具体额度 1234567890123456789 wei ────────────────────────────
    const cHash = await approve(STAKE, CONCRETE);
    console.log(`[C] approve(stake, ${CONCRETE}) tx ${cHash}`);
    check('C allowance(#1, stake) = 1234567890123456789', CONCRETE, await allowance(STAKE));
    check('C 具体额度 < 2^255', true, CONCRETE < THRESHOLD);

    // ── 用例 D：撤销归零 approve(stake, 0) ──────────────────────────────────
    const dHash = await approve(STAKE, 0n);
    console.log(`[D] approve(stake, 0) tx ${dHash}`);
    check('D allowance(#1, stake) = 0', 0n, await allowance(STAKE));

    // ── 用例 E：阈值边界 2^255−1 具体额度 / 2^255 长期授权 ──────────────────
    const e1Hash = await approve(VOTE, THRESHOLD - 1n);
    console.log(`[E1] approve(vote, 2^255−1) tx ${e1Hash}`);
    check('E1 allowance(#1, vote) = 2^255−1', THRESHOLD - 1n, await allowance(VOTE));
    check('E1 2^255−1 < 2^255（具体额度）', true, THRESHOLD - 1n < THRESHOLD);

    const e2Hash = await approve(SUBMIT, THRESHOLD);
    console.log(`[E2] approve(submit, 2^255) tx ${e2Hash}`);
    check('E2 allowance(#1, submit) = 2^255', THRESHOLD, await allowance(SUBMIT));
    check('E2 2^255 >= 2^255（长期授权）', true, THRESHOLD >= THRESHOLD);

    // ── 用例 F：最小可见额度 1 wei ──────────────────────────────────────────
    const fHash = await approve(MINT, 1n);
    console.log(`[F] approve(mint, 1) tx ${fHash}`);
    check('F allowance(#1, mint) = 1', 1n, await allowance(MINT));

    // ── 用例 G：自定义 spender（EOA 0x9965…）────────────────────────────────
    check('G1 自定义地址初始 allowance = 0', 0n, await allowance(CUSTOM_SPENDER));
    const g2Hash = await approve(CUSTOM_SPENDER, CUSTOM_AMOUNT);
    console.log(`[G2] approve(${CUSTOM_SPENDER}, 2.5e18) tx ${g2Hash}`);
    check(
      'G2 自定义地址 allowance = 2500000000000000000',
      CUSTOM_AMOUNT,
      await allowance(CUSTOM_SPENDER),
    );
    const g3Hash = await approve(CUSTOM_SPENDER, MAX_UINT256);
    console.log(`[G3] approve(${CUSTOM_SPENDER}, maxUint256) tx ${g3Hash}`);
    check('G3 自定义地址 allowance = maxUint256', MAX_UINT256, await allowance(CUSTOM_SPENDER));

    // ── 授权不改代币余额 ────────────────────────────────────────────────────
    check('H approve 不改 ACCOUNT_1 代币余额', INITIAL_BALANCE, await balance());

    // ── 回滚并证明链上状态回到跑前 ──────────────────────────────────────────
    await client.revert({ id: snapshot });
    check('回滚后 allowance(#1, router)', 0n, await allowance(ROUTER));
    check('回滚后 allowance(#1, stake)', 0n, await allowance(STAKE));
    check('回滚后 allowance(#1, vote)', 0n, await allowance(VOTE));
    check('回滚后 allowance(#1, submit)', 0n, await allowance(SUBMIT));
    check('回滚后 allowance(#1, mint)', 0n, await allowance(MINT));
    check('回滚后 allowance(#1, 自定义地址)', 0n, await allowance(CUSTOM_SPENDER));
    check('回滚后 ACCOUNT_1 代币余额', INITIAL_BALANCE, await balance());
  } catch (error) {
    await client.revert({ id: snapshot }).catch(() => {});
    throw error;
  }

  console.log('');
  console.log(`[approvals-contract] ${results.length - failures}/${results.length} checks passed`);
  if (failures > 0) {
    console.error(`[approvals-contract] FAIL: ${failures} mismatch(es) against the theory line`);
    process.exit(1);
  }
  console.log('[approvals-contract] ALL CHECKS PASSED (theory line §1 ↔ chain)');
}

main().catch((error) => {
  console.error('[approvals-contract] FATAL:', error instanceof Error ? error.message : error);
  process.exit(1);
});
