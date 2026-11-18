#!/usr/bin/env node
// 套件链健康检查 / 自愈（2026-11-18 加）：
//
// 背景：anvil 1.8.1 在长时间 interval mining 后会出现「端口还 LISTEN、HTTP 全超时」
// 的假活状态（8555/8566 都复现过，见 docs/product/three-line/gov-stake.md）。
// 这时 `pnpm e2e` 会认为「链还活着」直接开跑，跑十几分钟后整轮报废，然后要人手
// kill + 重载 + 重设挖矿模式。本脚本把这些动作合成一条命令：
//
//   node scripts/e2e-chain-doctor.mjs            # 检查并自愈 8555
//   node scripts/e2e-chain-doctor.mjs --check    # 只检查，不改（脚本/CI 用）
//   node scripts/e2e-chain-doctor.mjs --port 8566 --state /tmp/state.json
//
// 自愈步骤 = kill 监听进程 → `anvil --load-state <state>` → 等 RPC → 恢复
// automine=false + intervalMining=1（与 e2e/chain.ts 的 SUITE_MINING 一致）。
// 硬规则：永远不会碰 8545 人工链。
//
// 环境变量：E2E_ANVIL_STATE（默认 /tmp/state-8566-canonical.json，本地快照）、
//           E2E_ANVIL_RPC（默认 http://127.0.0.1:<port>）。
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const HUMAN_PORT = 8545;
const DEFAULT_PORT = 8555;
const DEFAULT_STATE = process.env.E2E_ANVIL_STATE ?? '/tmp/state-8566-canonical.json';
const PROBE_TIMEOUT_MS = 3_000;
const BOOT_TIMEOUT_MS = 20_000;

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const portArg = args[args.indexOf('--port') + 1];
const stateArg = args[args.indexOf('--state') + 1];
const port = Number(args.includes('--port') ? portArg : DEFAULT_PORT);
const statePath = args.includes('--state') ? stateArg : DEFAULT_STATE;

if (!Number.isInteger(port) || port <= 0) {
  console.error(`[chain-doctor] invalid --port ${JSON.stringify(portArg)}`);
  process.exit(2);
}
if (port === HUMAN_PORT) {
  console.error('[chain-doctor] REFUSING to manage :8545（开发者的人工链，自动化和脚本都不许碰）');
  process.exit(2);
}

function rpcUrl() {
  return process.env.E2E_ANVIL_RPC ?? `http://127.0.0.1:${port}`;
}

async function rpc(method, params = []) {
  const response = await fetch(rpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  const body = await response.json();
  if (body.error !== undefined) throw new Error(`${method}: ${body.error.message ?? 'rpc error'}`);
  return body.result;
}

/** 端口上是否有进程在听（lsof 不可用时返回 null，仅用于提示）。 */
function listeningPid() {
  try {
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const line = out.split('\n')[1] ?? '';
    const pid = Number(line.split(/\s+/)[1]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function main() {
  let chainId;
  let block;
  try {
    chainId = BigInt(await rpc('eth_chainId'));
    block = BigInt(await rpc('eth_blockNumber'));
  } catch (error) {
    console.log(`[chain-doctor] ${rpcUrl()} 无响应：${error.message}`);
    if (checkOnly) {
      console.error('[chain-doctor] --check: unhealthy (not reloading)');
      process.exit(1);
    }
    await heal();
    return;
  }

  console.log(`[chain-doctor] ${rpcUrl()} healthy: chainId=${chainId} block=${block}`);
  if (chainId !== 31337n) {
    console.error(`[chain-doctor] unexpected chainId ${chainId}（期望 31337）`);
    process.exit(1);
  }
}

async function heal() {
  if (!existsSync(statePath)) {
    console.error(`[chain-doctor] state 文件不存在：${statePath}（用 --state 指定或先 bootstrap）`);
    console.error(
      '[chain-doctor] 也可以跑 `pnpm e2e:reset-chain` 重新 bootstrap（需要 ../anvil 仓库）',
    );
    process.exit(1);
  }
  const pid = listeningPid();
  if (pid !== null) {
    console.log(`[chain-doctor] kill 假活进程 pid=${pid}`);
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* 进程可能刚好退出 */
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  console.log(`[chain-doctor] anvil --load-state ${statePath} --port ${port} --chain-id 31337`);
  const child = spawn(
    'anvil',
    ['--load-state', statePath, '--port', String(port), '--chain-id', '31337'],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();

  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  for (;;) {
    try {
      await rpc('eth_blockNumber');
      break;
    } catch {
      if (Date.now() > deadline) {
        console.error('[chain-doctor] anvil 启动超时，看 /tmp/anvil-*.log 或手动 bootstrap');
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // 与 e2e/chain.ts#SUITE_MINING 一致：automine=false + 1 s interval mining。
  await rpc('anvil_setAutomine', [false]);
  await rpc('anvil_setIntervalMining', [1]);
  const mode = {
    automine: await rpc('anvil_getAutomine'),
    interval: await rpc('anvil_getIntervalMining'),
  };
  console.log(
    `[chain-doctor] healed: automine=${String(mode.automine)} intervalMining=${String(mode.interval)}`,
  );
}

await main();
