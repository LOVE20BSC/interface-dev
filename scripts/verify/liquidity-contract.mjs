#!/usr/bin/env node
// 应用·流动性池 合约线（三线校验 §2）:
//   node scripts/verify/liquidity-contract.mjs
//
// 直连验证链（默认 http://127.0.0.1:8566，即 `make -C ../anvil bootstrap PORT=8566`
// 的专用链；本任务用 PORT=8568，故支持 VERIFY_RPC 覆盖），用 viem test client 走
// anvil 的 unlocked 账户发交易，逐 wei 断言 docs/product/three-line/liquidity.md
// §1 的理论值。每个用例前后 snapshot/revert，跑完链上状态与跑前完全一致；只用
// 理论线期望值，`quoteLp` 只做交叉核对（不参与期望值计算）。绝不触碰 8545。
//
// 退出码非 0 = 失败。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createTestClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  parseAbi,
  parseAbiParameters,
  publicActions,
} from 'viem';

const RPC = (process.env.VERIFY_RPC ?? 'http://127.0.0.1:8566').replace(/\/+$/, '');
const CHAIN_ID = 31337;

// anvil 固定账户（mnemonic test … junk），与理论线 §0 一一对应。
const ACCOUNT_1 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ACCOUNT_4 = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const ACCOUNT_5 = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';
const ACCOUNT_8 = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f';

const TOKEN = '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF'; // TestLOVE20
const WETH = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9'; // TestWETH
const PAIR = '0x3FC12a5abAe69C8Eee58C37cEDC266751507620D';
const ROUTER = '0x0165878A594ca255338adfa4d48449f69242Eb8F';
const FACTORY = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707';
const HUB = '0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB';

const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);
const pairAbi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112,uint112,uint32)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
]);
const routerAbi = parseAbi([
  'function addLiquidityETH(address,uint256,uint256,uint256,address,uint256) payable returns (uint256,uint256,uint256)',
  'function removeLiquidityETH(address,uint256,uint256,uint256,address,uint256) returns (uint256,uint256)',
]);
const hubAbi = parseAbi([
  'function addLiquidityWithToken((address tokenA,address tokenB,uint256 amountADesired,uint256 amountBDesired,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline) params) returns (uint256)',
  'function addLiquidityWithNative((address tokenAddress,uint256 amountTokenDesired,uint256 amountTokenMin,uint256 amountNativeMin,address to,uint256 deadline) params) payable returns (uint256)',
  'function quoteLpWithNative(address,uint256,uint256) view returns ((bool hasLiquidity,bool willSwap,address swapTokenIn,address swapTokenOut,uint256 amountToSwap,uint256 amountOutFromSwap,uint256 preparedAmountA,uint256 preparedAmountB,uint256 usableAmountA,uint256 usableAmountB,uint256 expectedLiquidity,uint256 suggestedAmountAMin,uint256 suggestedAmountBMin))',
]);
const factoryAbi = parseAbi(['function getPair(address,address) view returns (address)']);
const weth9Abi = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256)',
]);

const client = createTestClient({ mode: 'anvil', transport: http(RPC) }).extend(publicActions);

// ─── 理论线 §1 的期望值（逐 wei，先于实现与脚本算出） ────────────────────────────
const R_A = 200000000000000000000000n;
const R_B = 100000000000000000000n;
const S = 4472135954999579392818n;
const DEADLINE = 4000000000n;

// 用例 A：单边 100000 TestLOVE20 走 Hub
const A = {
  tokenIn: 100000000000000000000000n,
  amountToSwap: 45016508348071107131609n,
  amountOut: 18327830550642964289n,
  preparedA: 54983491651928892868391n,
  preparedB: 18327830550642964289n,
  liquidity: 1003579928576458381352n,
  minA: 54708574193669248404049n,
  minB: 18236191397889749467n,
  reserveTokenAfter: 300000000000000000000000n,
  reserveNativeAfter: 100000000000000000000n,
  totalSupplyAfter: 5475715883576037774170n,
};
// 用例 B：单边 10 ETH 走 Hub
const B = {
  nativeIn: 10000000000000000000n,
  amountToSwap: 4888217399419358069n,
  amountOut: 9294150182873894419011n,
  preparedA: 9294150182873894419011n,
  preparedB: 5111782600580641931n,
  liquidity: 217951904694344577682n,
  minA: 9247679431959524946915n,
  minB: 5086223687577738720n,
};
// 用例 C：A 之后 100% 撤出（储备已含这次注资：3e23 / 1e20）
const C = {
  outToken: 54983491651928892866980n,
  outNative: 18327830550642964288n,
  minToken: 54708574193669248402645n,
  minNative: 18236191397889749466n,
  reserveTokenAfter: 245016508348071107133020n,
  reserveNativeAfter: 81672169449357035712n,
};
// 用例 D：双币 1000 token + 0.5 ETH 走 Router
const D = {
  amountToken: 1000000000000000000000n,
  amountNative: 500000000000000000n,
  liquidity: 22360679774997896964n,
  minToken: 995000000000000000000n,
  minNative: 497500000000000000n,
};
// 用例 E：首次建池 100 X + 0.01 ETH
const E = {
  amountToken: 100000000000000000000n,
  amountNative: 10000000000000000n,
  liquidity: 999999999999999000n,
  totalSupply: 1000000000000000000n,
};

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

async function tokenBalance(address, account) {
  return read(address, erc20, 'balanceOf', [account]);
}

async function pairState(pair = PAIR) {
  const [r0, r1] = await read(pair, pairAbi, 'getReserves');
  const [token0, token1] = await Promise.all([
    read(pair, pairAbi, 'token0'),
    read(pair, pairAbi, 'token1'),
  ]);
  const totalSupply = await read(pair, pairAbi, 'totalSupply');
  const isToken0 = token0.toLowerCase() === TOKEN.toLowerCase();
  return {
    reserveToken: BigInt(isToken0 ? r0 : r1),
    reserveNative: BigInt(isToken0 ? r1 : r0),
    totalSupply,
    token0,
    token1,
  };
}

async function approve(tokenAddress, owner, spender, amount) {
  await send({
    from: owner,
    to: tokenAddress,
    data: encodeFunctionData({
      abi: erc20,
      functionName: 'approve',
      args: [spender, amount],
    }),
  });
}

async function withSnapshot(fn) {
  const snapshot = await client.snapshot();
  try {
    await fn(snapshot);
  } finally {
    await client.revert({ id: snapshot });
  }
}

/** 部署 dex 的 WETH9Configurable 作为首次建池的测试代币；返回其地址。 */
async function deployTestToken(name, symbol) {
  const candidates = [
    resolve(process.cwd(), '../dex/out/WETH9Configurable.sol/WETH9Configurable.json'),
    resolve(process.cwd(), '../compatibility/out/WETH9.sol/WETH9.json'),
  ];
  let artifact;
  let path = '';
  for (const candidate of candidates) {
    try {
      artifact = JSON.parse(readFileSync(candidate, 'utf8'));
      path = candidate;
      break;
    } catch {
      // 试下一个；两个都缺时下面显式失败。
    }
  }
  if (artifact === undefined) {
    throw new Error(
      'deployTestToken: 找不到 WETH9Configurable/WETH9 的编译产物（先 make -C ../anvil bootstrap）',
    );
  }
  const constructorInputs =
    artifact.abi.find((item) => item.type === 'constructor')?.inputs ?? [];
  const encodedArgs =
    constructorInputs.length === 2
      ? encodeAbiParameters(parseAbiParameters('string, string'), [name, symbol]).slice(2)
      : '';
  console.log(`[E] deploy artifact ${path}`);
  const { receipt } = await send({ from: ACCOUNT_8, data: `${artifact.bytecode.object}${encodedArgs}` });
  if (receipt.contractAddress === undefined || receipt.contractAddress === null) {
    throw new Error('deployTestToken: 部署没有返回合约地址');
  }
  return receipt.contractAddress;
}

async function main() {
  const chainId = await client.getChainId();
  if (chainId !== CHAIN_ID) {
    throw new Error(`expected chain ${CHAIN_ID} at ${RPC}, got ${chainId}`);
  }
  console.log(`[liquidity-contract] chain ${chainId} at ${RPC}`);

  const snapshot = await client.snapshot();
  try {
    // ── 初始状态快照（对照 §0） ────────────────────────────────────────────
    const initial = await pairState();
    check('§0 reserveToken', R_A, initial.reserveToken);
    check('§0 reserveNative', R_B, initial.reserveNative);
    check('§0 totalSupply', S, initial.totalSupply);

    // ── 用例 A：Hub 单边社区代币（quote 只做交叉核对） ─────────────────────
    await withSnapshot(async () => {
      const quote = await read(HUB, hubAbi, 'quoteLpWithNative', [TOKEN, A.tokenIn, 0n]);
      check('A quote.amountToSwap（交叉核对）', A.amountToSwap, quote.amountToSwap);
      check('A quote.amountOutFromSwap（交叉核对）', A.amountOut, quote.amountOutFromSwap);
      check('A quote.preparedAmountA（交叉核对）', A.preparedA, quote.preparedAmountA);
      check('A quote.preparedAmountB（交叉核对）', A.preparedB, quote.preparedAmountB);
      check('A quote.expectedLiquidity（交叉核对）', A.liquidity, quote.expectedLiquidity);

      await approve(TOKEN, ACCOUNT_4, HUB, A.tokenIn);
      const beforeToken = await tokenBalance(TOKEN, ACCOUNT_4);
      const { hash } = await send({
        from: ACCOUNT_4,
        to: HUB,
        data: encodeFunctionData({
          abi: hubAbi,
          functionName: 'addLiquidityWithToken',
          args: [
            {
              tokenA: TOKEN,
              tokenB: WETH,
              amountADesired: A.tokenIn,
              amountBDesired: 0n,
              amountAMin: A.minA,
              amountBMin: A.minB,
              to: ACCOUNT_4,
              deadline: DEADLINE,
            },
          ],
        }),
      });
      console.log(`[A] tx ${hash}`);
      const after = await pairState();
      check('A reserveToken after', A.reserveTokenAfter, after.reserveToken);
      check('A reserveNative after', A.reserveNativeAfter, after.reserveNative);
      check('A totalSupply after', A.totalSupplyAfter, after.totalSupply);
      check('A 我的 LP', A.liquidity, await read(PAIR, pairAbi, 'balanceOf', [ACCOUNT_4]));
      check(
        'A TestLOVE20 扣款 = tokenIn（余额差）',
        A.tokenIn,
        beforeToken - (await tokenBalance(TOKEN, ACCOUNT_4)),
      );
    });

    // ── 用例 B：Hub 单边原生币 ─────────────────────────────────────────────
    await withSnapshot(async () => {
      const quote = await read(HUB, hubAbi, 'quoteLpWithNative', [TOKEN, 0n, B.nativeIn]);
      check('B quote.amountToSwap（交叉核对）', B.amountToSwap, quote.amountToSwap);
      check('B quote.amountOutFromSwap（交叉核对）', B.amountOut, quote.amountOutFromSwap);
      check('B quote.expectedLiquidity（交叉核对）', B.liquidity, quote.expectedLiquidity);

      const beforeToken = await tokenBalance(TOKEN, ACCOUNT_5);
      const { hash } = await send({
        from: ACCOUNT_5,
        to: HUB,
        value: B.nativeIn,
        data: encodeFunctionData({
          abi: hubAbi,
          functionName: 'addLiquidityWithNative',
          args: [
            {
              tokenAddress: TOKEN,
              amountTokenDesired: 0n,
              amountTokenMin: B.minA,
              amountNativeMin: B.minB,
              to: ACCOUNT_5,
              deadline: DEADLINE,
            },
          ],
        }),
      });
      console.log(`[B] tx ${hash}`);
      check('B 单边原生不加代币：代币余额不变', beforeToken, await tokenBalance(TOKEN, ACCOUNT_5));
      check('B 我的 LP', B.liquidity, await read(PAIR, pairAbi, 'balanceOf', [ACCOUNT_5]));
      const after = await pairState();
      check('B reserveToken after', R_A, after.reserveToken);
      // usable 比 prepared 少 1 wei（向下取整），Hub 把 1 wei 退给用户，所以储备多 1e19−1。
      check('B reserveNative after', R_B + B.nativeIn - 1n, after.reserveNative);
    });

    // ── 用例 C：A 之后 100% 撤出 ───────────────────────────────────────────
    await withSnapshot(async () => {
      await approve(TOKEN, ACCOUNT_4, HUB, A.tokenIn);
      await send({
        from: ACCOUNT_4,
        to: HUB,
        data: encodeFunctionData({
          abi: hubAbi,
          functionName: 'addLiquidityWithToken',
          args: [
            {
              tokenA: TOKEN,
              tokenB: WETH,
              amountADesired: A.tokenIn,
              amountBDesired: 0n,
              amountAMin: A.minA,
              amountBMin: A.minB,
              to: ACCOUNT_4,
              deadline: DEADLINE,
            },
          ],
        }),
      });
      const afterAdd = await pairState();
      check('C 加池后 reserveToken', A.reserveTokenAfter, afterAdd.reserveToken);
      check('C 加池后 reserveNative', A.reserveNativeAfter, afterAdd.reserveNative);
      check('C 加池后 totalSupply', A.totalSupplyAfter, afterAdd.totalSupply);

      const lp = await read(PAIR, pairAbi, 'balanceOf', [ACCOUNT_4]);
      check('C 我的 LP', A.liquidity, lp);
      await approve(PAIR, ACCOUNT_4, ROUTER, lp);
      const beforeToken = await tokenBalance(TOKEN, ACCOUNT_4);
      const { hash } = await send({
        from: ACCOUNT_4,
        to: ROUTER,
        data: encodeFunctionData({
          abi: routerAbi,
          functionName: 'removeLiquidityETH',
          args: [TOKEN, lp, C.minToken, C.minNative, ACCOUNT_4, DEADLINE],
        }),
      });
      console.log(`[C] tx ${hash}`);
      check(
        'C 撤出的社区代币 = lp·R/S',
        C.outToken,
        (await tokenBalance(TOKEN, ACCOUNT_4)) - beforeToken,
      );
      const afterWithdraw = await pairState();
      check('C 撤出后 reserveToken', C.reserveTokenAfter, afterWithdraw.reserveToken);
      check('C 撤出后 reserveNative', C.reserveNativeAfter, afterWithdraw.reserveNative);
      check('C 撤出后 totalSupply', A.totalSupplyAfter - lp, afterWithdraw.totalSupply);
      check('C 我的 LP 归零', 0n, await read(PAIR, pairAbi, 'balanceOf', [ACCOUNT_4]));
    });

    // ── 用例 D：双币按比例（Router addLiquidityETH） ───────────────────────
    await withSnapshot(async () => {
      await approve(TOKEN, ACCOUNT_1, ROUTER, D.amountToken);
      const { hash } = await send({
        from: ACCOUNT_1,
        to: ROUTER,
        value: D.amountNative,
        data: encodeFunctionData({
          abi: routerAbi,
          functionName: 'addLiquidityETH',
          args: [TOKEN, D.amountToken, D.minToken, D.minNative, ACCOUNT_1, DEADLINE],
        }),
      });
      console.log(`[D] tx ${hash}`);
      check('D 我的 LP', D.liquidity, await read(PAIR, pairAbi, 'balanceOf', [ACCOUNT_1]));
      const after = await pairState();
      check('D reserveToken after', R_A + D.amountToken, after.reserveToken);
      check('D reserveNative after', R_B + D.amountNative, after.reserveNative);
      check('D totalSupply after', S + D.liquidity, after.totalSupply);
    });

    // ── 用例 E：首次建池（空储备） ─────────────────────────────────────────
    await withSnapshot(async () => {
      const testToken = await deployTestToken('TestX', 'TestX');
      console.log(`[E] test token ${testToken}`);
      // WETH9Configurable 的 deposit() 铸出与原生币等额的包装代币。
      await send({
        from: ACCOUNT_8,
        to: testToken,
        value: E.amountToken,
        data: encodeFunctionData({ abi: weth9Abi, functionName: 'deposit' }),
      });
      check('E 测试代币余额', E.amountToken, await tokenBalance(testToken, ACCOUNT_8));
      check('E 建池前存在空 pair', '0x0000000000000000000000000000000000000000', await read(FACTORY, factoryAbi, 'getPair', [testToken, WETH]));

      // 空池时 Hub 单边必须拒绝：页面据此降级为「两侧都填」。
      let hubReverted = false;
      try {
        await client.call({
          account: ACCOUNT_8,
          to: HUB,
          data: encodeFunctionData({
            abi: hubAbi,
            functionName: 'addLiquidityWithToken',
            args: [
              {
                tokenA: testToken,
                tokenB: WETH,
                amountADesired: 1n,
                amountBDesired: 0n,
                amountAMin: 0n,
                amountBMin: 0n,
                to: ACCOUNT_8,
                deadline: DEADLINE,
              },
            ],
          }),
        });
      } catch {
        hubReverted = true;
      }
      check('E 空池单边加池被 Hub 拒绝', true, hubReverted);

      await approve(testToken, ACCOUNT_8, ROUTER, E.amountToken);
      const { hash } = await send({
        from: ACCOUNT_8,
        to: ROUTER,
        value: E.amountNative,
        data: encodeFunctionData({
          abi: routerAbi,
          functionName: 'addLiquidityETH',
          args: [testToken, E.amountToken, E.amountToken, E.amountNative, ACCOUNT_8, DEADLINE],
        }),
      });
      console.log(`[E] tx ${hash}`);
      const newPair = await read(FACTORY, factoryAbi, 'getPair', [testToken, WETH]);
      check('E 我的 LP = sqrt(a·b) − 1000', E.liquidity, await read(newPair, pairAbi, 'balanceOf', [ACCOUNT_8]));
      check('E totalSupply = sqrt(a·b)', E.totalSupply, await read(newPair, pairAbi, 'totalSupply'));
      const [r0, r1] = await read(newPair, pairAbi, 'getReserves');
      const token0 = await read(newPair, pairAbi, 'token0');
      const isToken0 = token0.toLowerCase() === testToken.toLowerCase();
      check('E reserveTestX', E.amountToken, BigInt(isToken0 ? r0 : r1));
      check('E reserveWETH', E.amountNative, BigInt(isToken0 ? r1 : r0));
    });

    // ── 用例 G：失败回滚（amountAMin 高于实际进场额） ──────────────────────
    await withSnapshot(async () => {
      const before = await pairState();
      const beforeToken = await tokenBalance(TOKEN, ACCOUNT_4);
      await approve(TOKEN, ACCOUNT_4, ROUTER, D.amountToken);
      // 标准 Uniswap V2 只在「B 侧成为约束」的分支检查 amountAMin，因此这里让
      // native 期望少于按比例的数量，A 侧被截到 8e20，而最少额要求 8e20+1。
      let receipt;
      let reverted = false;
      try {
        ({ receipt } = await send({
          from: ACCOUNT_4,
          to: ROUTER,
          value: 400000000000000000n,
          data: encodeFunctionData({
            abi: routerAbi,
            functionName: 'addLiquidityETH',
            args: [
              TOKEN,
              D.amountToken,
              800000000000000000001n,
              0n,
              ACCOUNT_4,
              DEADLINE,
            ],
          }),
        }));
      } catch {
        reverted = true;
      }
      check('G 最少额过高时交易回滚', true, reverted || receipt?.status === 'reverted');
      const after = await pairState();
      check('G 回滚后 reserveToken 不变', before.reserveToken, after.reserveToken);
      check('G 回滚后 reserveNative 不变', before.reserveNative, after.reserveNative);
      check('G 回滚后 totalSupply 不变', before.totalSupply, after.totalSupply);
      check('G 回滚后我的代币余额不变', beforeToken, await tokenBalance(TOKEN, ACCOUNT_4));
    });
  } finally {
    await client.revert({ id: snapshot });
  }

  const passed = results.length - failures;
  console.log(`\n[liquidity-contract] ${passed}/${results.length} PASS`);
  if (failures > 0) process.exitCode = 1;
}

await main().catch((error) => {
  console.error(`[liquidity-contract] FAILED: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
