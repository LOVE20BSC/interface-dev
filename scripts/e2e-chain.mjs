#!/usr/bin/env node
// `pnpm e2e` bootstraps the e2e suite's own anvil chain — never the developer's :8545 chain.
//
// 2026-11-11 incident: the suite used to run against the shared local chain on
// http://127.0.0.1:8545. While the product owner was hand-testing a transaction in his browser, an
// automated run bootstrapped/reverted that chain underneath him: his signed approve() could never be
// mined (the account nonce had been reset), the page stayed on "确认中…" forever and
// anvil_getAutomine was left false. Automated runs must therefore own their chain.
//
// This script is the entry point of `pnpm e2e`:
//   1. resolve the suite RPC: E2E_ANVIL_RPC if set, otherwise http://127.0.0.1:8555;
//   2. hard-fail if the resolved endpoint is the human chain on :8545 (read-only or not: we never
//      even connect to it);
//   3. when E2E_ANVIL_RPC is unset, make sure :8555 has a bootstrapped chain: start + bootstrap it
//      on the first run (`make -C ../anvil bootstrap PORT=8555`) and reuse it on later runs;
//   4. run Playwright with E2E_ANVIL_RPC exported. playwright.config.ts forwards it into the build
//      as VITE_ANVIL_RPC, so the page and the specs talk to the same chain.
//
// `make bootstrap` on :8555 deploys from deployer nonce 0 exactly like a fresh :8545 bootstrap, so
// the committed dev address book (src/config/deployments/anvil31337_dev.json) is reused unchanged.
// The anvil repo keeps runtime state per port (`.anvil/8555/`), so the two chains never share a pid
// file or log; `make stop PORT=8555` cannot stop the developer's chain.
//
// Flags (stripped before Playwright sees them):
//   --ensure-only   only ensure/inspect the suite chain, do not run Playwright
//   --reset-chain   stop the suite chain on :8555 (if this repo started it) and bootstrap it again
import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { connect as netConnect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ANVIL_REPO = resolve(process.env.E2E_ANVIL_REPO ?? resolve(ROOT, '..', 'anvil'));
const SUITE_PORT = 8555;
const HUMAN_PORT = 8545;
const EXPECTED_CHAIN_ID = 31337;
const DEFAULT_SUITE_RPC = `http://127.0.0.1:${SUITE_PORT}`;
// One suite at a time: every spec file snapshots/reverts the whole chain, so two
// concurrent runs consume each other's snapshots (`anvil_revert ... returned false`).
const LOCK_FILE_NAME = 'e2e.lock';
const LOCK_POLL_MS = 2_000;
const LOCK_WAIT_TIMEOUT_MS = 15 * 60_000;
const LOCK_STALE_MS = 30 * 60_000;
/**
 * Test-build transaction deadline. The shipped (production) value is the 90 s
 * default in src/shared/lib/tx-watch.ts; the e2e suite must not wait 90 s for the
 * recovery card, so the suite build bakes a short deadline via VITE_*. Defaulting
 * it here keeps `e2e/tx-recovery.spec.ts` from silently skipping on a clean shell.
 */
const DEFAULT_E2E_TX_DEADLINE_MS = '4000';
/** Short probe for "is something alive on :8555?", so a wedged port fails in seconds, not minutes. */
const LIVENESS_PROBE_TIMEOUT_MS = 3_000;
const MAKE_TIMEOUT_MS = 10 * 60_000;
const DEPLOYMENT_FILE = resolve(ROOT, 'src/config/deployments/anvil31337_dev.json');

/** Hostnames that mean "this machine"; only these can be the developer's personal chain. */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

/** Contract keys probed to decide whether :8555 carries the committed clean deployment. */
const PROBE_ADDRESS_KEYS = ['tokenAddress', 'memberNFT', 'airdrop', 'multicall3', 'weth', 'pair'];

function fatal(...lines) {
  for (const line of lines) console.error(`[e2e-chain] ${line}`);
  process.exit(1);
}

// ------------------------------------------------------------------------------------------------
// suite lock: serialise e2e runs (chain-global snapshots cannot overlap)
// ------------------------------------------------------------------------------------------------
let activeLockPath = null;
let activeChild = null;

function lockFilePath() {
  const runtimeDir = resolve(ANVIL_REPO, '.anvil', String(SUITE_PORT));
  if (existsSync(ANVIL_REPO)) {
    try {
      mkdirSync(runtimeDir, { recursive: true });
      return resolve(runtimeDir, LOCK_FILE_NAME);
    } catch {
      // fall through to the OS temp dir
    }
  }
  return resolve(tmpdir(), `love20-e2e-${SUITE_PORT}.lock`);
}

function readLockOwner(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const pid =
      typeof parsed.pid === 'number' ? parsed.pid : Number.parseInt(String(parsed.pid), 10);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    return {
      pid,
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : null,
      cwd: typeof parsed.cwd === 'string' ? parsed.cwd : null,
    };
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error !== null && typeof error === 'object' && error.code === 'EPERM';
  }
}

function clockOf(iso) {
  const parsed = typeof iso === 'string' ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(parsed)) return 'unknown time';
  return new Date(parsed).toLocaleTimeString('en-GB', { hour12: false });
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Atomic lock creation (`openSync(..., 'wx')`). A live owner means wait; a dead
 * owner (or a lock older than 30 min) is taken over with a warning. The bounded
 * 15 min wait then fails with an actionable message instead of hanging forever.
 */
function acquireSuiteLock() {
  const path = lockFilePath();
  const waitStarted = Date.now();
  let announcedWait = false;
  let takeoverAttempts = 0;

  for (;;) {
    try {
      const fd = openSync(path, 'wx');
      writeSync(
        fd,
        `${JSON.stringify(
          { pid: process.pid, startedAt: new Date().toISOString(), cwd: process.cwd() },
          null,
          2,
        )}\n`,
      );
      closeSync(fd);
      activeLockPath = path;
      console.log(`[e2e-chain] acquired e2e lock ${path} (pid ${process.pid})`);
      return;
    } catch (error) {
      const code = error !== null && typeof error === 'object' ? error.code : undefined;
      if (code !== 'EEXIST') {
        fatal(`could not create the e2e lock at ${path}: ${String(error)}`);
      }
    }

    const owner = readLockOwner(path);
    const alive = owner !== null && isPidAlive(owner.pid);
    const age =
      owner?.startedAt !== null && owner?.startedAt !== undefined
        ? Date.now() - Date.parse(owner.startedAt)
        : Number.POSITIVE_INFINITY;
    const stale = owner === null || !alive || age > LOCK_STALE_MS;

    if (stale) {
      takeoverAttempts += 1;
      if (takeoverAttempts > 5) {
        fatal(
          `could not take over the stale e2e lock at ${path}.`,
          'Delete it manually if no e2e run is active.',
        );
      }
      console.warn(
        `[e2e-chain] taking over a stale e2e lock (pid ${owner?.pid ?? '?'} ${
          alive ? `alive but started ${clockOf(owner?.startedAt)}` : 'is not running'
        }) at ${path}`,
      );
      try {
        unlinkSync(path);
      } catch {
        // another waiter removed it first; retry the atomic create
      }
      continue;
    }

    if (!announcedWait) {
      console.log(
        `[e2e-chain] waiting for another e2e run (pid ${owner.pid}, started ${clockOf(owner.startedAt)}) …`,
      );
      console.log(
        '[e2e-chain] e2e runs are serialised because every spec file snapshots/reverts the whole chain',
      );
      announcedWait = true;
    }
    if (Date.now() - waitStarted > LOCK_WAIT_TIMEOUT_MS) {
      fatal(
        `another e2e run (pid ${owner.pid}, started ${clockOf(owner.startedAt)}) has held the lock for more than 15 minutes.`,
        `Stop that run, or delete ${path} if its pid is dead.`,
      );
    }
    sleepSync(LOCK_POLL_MS);
  }
}

/** Releases only a lock this process owns; safe to call more than once. */
function releaseSuiteLock() {
  if (activeLockPath === null) return;
  const path = activeLockPath;
  activeLockPath = null;
  const owner = readLockOwner(path);
  if (owner !== null && owner.pid !== process.pid) {
    console.warn(`[e2e-chain] not releasing ${path}: it belongs to pid ${owner.pid}`);
    return;
  }
  try {
    unlinkSync(path);
    console.log(`[e2e-chain] released e2e lock ${path}`);
  } catch {
    // already gone; nothing to do
  }
}

/** Crash-safe release: normal exit, SIGINT/SIGTERM (and the child they stop). */
function installLockCleanup() {
  process.on('exit', releaseSuiteLock);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (activeChild !== null && !activeChild.killed) activeChild.kill(signal);
      releaseSuiteLock();
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }
}

// ------------------------------------------------------------------------------------------------
// endpoint resolution + the :8545 guard
// ------------------------------------------------------------------------------------------------
function resolveRpc() {
  const raw = (process.env.E2E_ANVIL_RPC ?? '').trim();
  const rpc = (raw === '' ? DEFAULT_SUITE_RPC : raw).replace(/\/+$/, '');
  let url;
  try {
    url = new URL(rpc);
  } catch {
    fatal(`E2E_ANVIL_RPC is not a valid URL: ${JSON.stringify(raw)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    fatal(`E2E_ANVIL_RPC must be http(s), got ${url.protocol}`);
  }
  if (LOCAL_HOSTS.has(url.hostname) && url.port === String(HUMAN_PORT)) {
    fatal(
      `REFUSING TO RUN: E2E_ANVIL_RPC resolves to ${rpc}, the developer's personal chain.`,
      'The e2e suite must never snapshot, revert, bootstrap or send on :8545 — that is what broke',
      'his browser session on 2026-11-11 (signed approve() never mined, page stuck on 确认中…).',
      'Unset E2E_ANVIL_RPC to use the dedicated suite chain on :8555, or point it at another',
      'non-8545 anvil endpoint.',
    );
  }
  return { rpc, managed: raw === '' };
}

// ------------------------------------------------------------------------------------------------
// tiny JSON-RPC client (node 24 has fetch; no cast dependency for the chain check)
// ------------------------------------------------------------------------------------------------
let requestId = 0;

async function rpc(rpcUrl, method, params = [], timeoutMs = 10_000) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const body = await response.json();
  if (body.error !== undefined) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/** A down port is expected (first run); a foreign chain or a wedged listener is not. */
async function probeChain(rpcUrl, timeoutMs = 10_000) {
  try {
    const chainId = Number(await rpc(rpcUrl, 'eth_chainId', [], timeoutMs));
    return { chainId };
  } catch (error) {
    return { error };
  }
}

/** TCP liveness: distinguishes "nothing is listening" from "a process holds :8555 but won't talk". */
function isPortListening(port, timeoutMs = 1_500) {
  return new Promise((resolvePromise) => {
    const socket = netConnect({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolvePromise(value);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function lsofDiagnostics(port) {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`], { encoding: 'utf8' });
  if (result.error !== undefined) return [`(could not run lsof: ${result.error.message})`];
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd();
  return output.length > 0 ? output.split('\n') : ['(lsof reported no process)'];
}

/**
 * A bound port that cannot answer `eth_chainId` is wedged, not absent. Bootstrapping over it used to
 * start a losing anvil (`Address already in use`), leave the pidfile pointing at the failed pid and
 * hang until the 15-minute lock bound. Fail immediately with evidence instead.
 */
function fatalPortBoundWithoutRpc(error) {
  fatal(
    `${DEFAULT_SUITE_RPC} has a listener on :${SUITE_PORT} but no JSON-RPC answer (${error.message}).`,
    `lsof -nP -iTCP:${SUITE_PORT}:`,
    ...lsofDiagnostics(SUITE_PORT).map((line) => `  ${line}`),
    'Refusing to bootstrap over a process that cannot be proven to be our anvil.',
    `If it is a wedged suite anvil, stop it and rebuild with \`pnpm e2e:reset-chain\`;`,
    'otherwise stop the foreign listener yourself or point E2E_ANVIL_RPC at another endpoint.',
  );
}

function processCommand(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (result.error !== undefined || result.status !== 0) return null;
  return result.stdout.trim();
}

/** Proof for kill/stop decisions: the cmdline itself must name anvil and the suite port. */
function isOurAnvil(pid) {
  const command = processCommand(pid);
  if (command === null) return false;
  return /\banvil\b/i.test(command) && command.includes(String(SUITE_PORT));
}

function expectedAddresses() {
  let book;
  try {
    book = JSON.parse(readFileSync(DEPLOYMENT_FILE, 'utf8'));
  } catch (error) {
    fatal(`cannot read the committed dev address book ${DEPLOYMENT_FILE}: ${error.message}`);
  }
  const addresses = book.addresses ?? {};
  const entries = PROBE_ADDRESS_KEYS.flatMap((key) => {
    const value = addresses[key];
    return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) ? [[key, value]] : [];
  });
  if (entries.length === 0) fatal(`${DEPLOYMENT_FILE} has no usable addresses`);
  return entries;
}

/** `cast code` on the MemberNFT address: the explicit on-chain proof that the suite deployment exists. */
function assertMemberNftCodeWithCast(rpcUrl) {
  const memberNft = expectedAddresses().find(([key]) => key === 'memberNFT')?.[1];
  if (memberNft === undefined) fatal(`${DEPLOYMENT_FILE} has no memberNFT address`);
  const result = spawnSync('cast', ['code', memberNft, '--rpc-url', rpcUrl], {
    encoding: 'utf8',
    timeout: 20_000,
  });
  if (result.error !== undefined) {
    if (result.error.code === 'ENOENT') {
      console.warn(
        '[e2e-chain] cast not found on PATH; falling back to the JSON-RPC deployment check',
      );
      return;
    }
    fatal(`cast code ${memberNft} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fatal(`cast code ${memberNft} on ${rpcUrl} failed: ${(result.stderr ?? '').trim()}`);
  }
  const code = (result.stdout ?? '').trim();
  if (code === '' || code === '0x') {
    fatal(
      `${rpcUrl} answers but memberNFT ${memberNft} has no code.`,
      'The suite deployment is missing; refusing to run against it.',
    );
  }
}

/** @returns {Promise<string[]>} human-readable list of expected contracts with no code. */
async function missingDeploymentCode(rpcUrl) {
  const missing = [];
  for (const [key, address] of expectedAddresses()) {
    let code;
    try {
      code = await rpc(rpcUrl, 'eth_getCode', [address, 'latest']);
    } catch (error) {
      fatal(`eth_getCode(${address}) on ${rpcUrl} failed: ${error.message}`);
    }
    if (typeof code !== 'string' || code === '0x' || code.length <= 2) {
      missing.push(`${key} ${address}`);
    }
  }
  return missing;
}

// ------------------------------------------------------------------------------------------------
// the suite chain is only ever started/stopped through the anvil repo's own make targets
// ------------------------------------------------------------------------------------------------
function readSuiteChainOwner() {
  const pidFile = resolve(ANVIL_REPO, '.anvil', String(SUITE_PORT), 'anvil.pid');
  if (!existsSync(pidFile)) return null;
  const [pidRaw = '', host = '', port = ''] = readFileSync(pidFile, 'utf8').trim().split(/\s+/);
  const pid = Number(pidRaw);
  if (!Number.isInteger(pid) || pid <= 0 || port !== String(SUITE_PORT)) return null;
  try {
    process.kill(pid, 0);
  } catch {
    return null;
  }
  // The pidfile alone is not proof: pids are recycled. The cmdline must still be our anvil on :8555.
  if (!isOurAnvil(pid)) return null;
  return { pid, host, pidFile };
}

function runMake(args) {
  if (!existsSync(ANVIL_REPO)) {
    fatal(
      `sibling anvil repo not found at ${ANVIL_REPO}.`,
      '`pnpm e2e` needs it to bootstrap the dedicated suite chain on :8555.',
      'Clone it next to this repo (../anvil) or set E2E_ANVIL_REPO to its path.',
    );
  }
  console.log(`[e2e-chain] $ make -C ${ANVIL_REPO} ${args.join(' ')}`);
  const result = spawnSync('make', ['-C', ANVIL_REPO, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    timeout: MAKE_TIMEOUT_MS,
  });
  if (result.error !== undefined) {
    if (result.error.code === 'ETIMEDOUT') {
      fatal(
        `make ${args.join(' ')} did not finish within ${MAKE_TIMEOUT_MS / 60_000} minutes.`,
        'It may be wedged on a bound :8555. Inspect `lsof -nP -iTCP:8555`, then run',
        '`pnpm e2e:reset-chain` before retrying.',
      );
    }
    fatal(`could not run make: ${result.error.message}`);
  }
  return result.status === 0;
}

async function bootstrapSuiteChain() {
  console.log(
    `[e2e-chain] bootstrapping the dedicated suite chain on ${DEFAULT_SUITE_RPC} ` +
      '(first run; ~1 min). The developer chain on :8545 is not touched.',
  );
  if (!runMake(['bootstrap', `PORT=${SUITE_PORT}`])) {
    fatal(
      'bootstrap failed; the suite chain was not started.',
      `Fix the make output above, then re-run pnpm e2e (or: make -C ../anvil stop PORT=${SUITE_PORT}).`,
    );
  }
  const missing = await missingDeploymentCode(DEFAULT_SUITE_RPC);
  if (missing.length > 0) {
    fatal(
      `bootstrap finished but the committed address book is not deployed on ${DEFAULT_SUITE_RPC}:`,
      ...missing.map((entry) => `  missing code: ${entry}`),
      'A clean bootstrap must reproduce src/config/deployments/anvil31337_dev.json exactly.',
      'Do not hand-edit that file: fix the params/deploy scripts, or run `pnpm sync:anvil` if the',
      'deployment legitimately changed.',
    );
  }
}

async function ensureDedicatedChain({ reset }) {
  const owner = readSuiteChainOwner();
  if (reset) {
    if (owner !== null) {
      if (!runMake(['stop', `PORT=${SUITE_PORT}`])) fatal('could not stop the suite chain');
    } else {
      const probe = await probeChain(DEFAULT_SUITE_RPC, LIVENESS_PROBE_TIMEOUT_MS);
      if (probe.error === undefined) {
        fatal(
          `--reset-chain: ${DEFAULT_SUITE_RPC} answers but was not started by ../anvil`,
          `(no live .anvil/${SUITE_PORT}/anvil.pid). Refusing to kill a foreign process; stop it yourself.`,
        );
      }
      if (await isPortListening(SUITE_PORT)) fatalPortBoundWithoutRpc(probe.error);
    }
  }

  // Probe first, bootstrap only when the port is genuinely free. A bound port with no JSON-RPC is
  // the wedged case (orphan anvil / foreign listener): fail fast, never start a losing bootstrap.
  const probe = await probeChain(DEFAULT_SUITE_RPC, LIVENESS_PROBE_TIMEOUT_MS);
  if (probe.error !== undefined) {
    if (await isPortListening(SUITE_PORT)) fatalPortBoundWithoutRpc(probe.error);
    await bootstrapSuiteChain();
    return;
  }
  if (probe.chainId !== EXPECTED_CHAIN_ID) {
    fatal(
      `${DEFAULT_SUITE_RPC} answers with chain id ${probe.chainId}, expected ${EXPECTED_CHAIN_ID}.`,
      'Refusing to point the dev address book at a foreign chain; stop that process, or set',
      'E2E_ANVIL_RPC to the endpoint you actually mean.',
    );
  }

  // It answers and the chain id is right: validate the committed deployment instead of bootstrapping.
  assertMemberNftCodeWithCast(DEFAULT_SUITE_RPC);
  const missing = await missingDeploymentCode(DEFAULT_SUITE_RPC);
  if (missing.length === 0) {
    console.log(
      `[e2e-chain] reusing the bootstrapped suite chain on ${DEFAULT_SUITE_RPC} ` +
        `(chain ${probe.chainId}, memberNFT code present)`,
    );
    return;
  }

  if (owner === null) {
    fatal(
      `${DEFAULT_SUITE_RPC} answers with chain ${probe.chainId} but does not have the committed`,
      'deployment, and it was not started by ../anvil (no live .anvil/8555/anvil.pid).',
      'Refusing to stop a foreign chain. Stop it yourself, or set E2E_ANVIL_RPC.',
    );
  }
  console.log(
    `[e2e-chain] ${DEFAULT_SUITE_RPC} is a used, non-conforming chain started by ../anvil ` +
      `(pid ${owner.pid}); restarting it from block 0`,
  );
  if (!runMake(['stop', `PORT=${SUITE_PORT}`])) fatal('could not stop the suite chain');
  await bootstrapSuiteChain();
}

// ------------------------------------------------------------------------------------------------
// run Playwright with the resolved endpoint
// ------------------------------------------------------------------------------------------------
async function runPlaywright(rpcUrl, passthrough) {
  const require = createRequire(import.meta.url);
  let cli;
  try {
    cli = require.resolve('@playwright/test/cli');
  } catch {
    fatal('@playwright/test is not installed; run `pnpm install` first.');
  }
  console.log(
    `[e2e-chain] export E2E_ANVIL_RPC=${rpcUrl} && playwright test ${
      passthrough.join(' ') || ''
    }`.trimEnd(),
  );
  const child = spawn(process.execPath, [cli, 'test', ...passthrough], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, E2E_ANVIL_RPC: rpcUrl },
  });
  activeChild = child;
  return await new Promise((resolvePromise) => {
    child.on('error', (error) => {
      fatal(`could not start Playwright: ${error.message}`);
    });
    child.on('exit', (code, signal) => {
      activeChild = null;
      resolvePromise({ code: code ?? 1, signal });
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const ensureOnly = argv.includes('--ensure-only');
  const reset = argv.includes('--reset-chain');
  const passthrough = argv.filter((arg) => arg !== '--ensure-only' && arg !== '--reset-chain');

  // Guard first: refuse :8545 before any chain interaction, managed or not.
  const { rpc: rpcUrl, managed } = resolveRpc();
  console.log(
    `[e2e-chain] suite chain RPC: ${rpcUrl}` +
      (managed ? ' (managed: ensure/bootstrapped)' : ' (E2E_ANVIL_RPC override; not managed)'),
  );
  console.log('[e2e-chain] the developer chain on http://127.0.0.1:8545 is never touched by e2e');

  // Bake the short deadline into the test build unless the caller chose one.
  // Production keeps the 90 s default (VITE_TX_DEADLINE_MS is build-time only).
  if ((process.env.VITE_TX_DEADLINE_MS ?? '').trim() === '') {
    process.env.VITE_TX_DEADLINE_MS = DEFAULT_E2E_TX_DEADLINE_MS;
    console.log(
      `[e2e-chain] VITE_TX_DEADLINE_MS=${DEFAULT_E2E_TX_DEADLINE_MS} (test build only; shipped default is 90 s)`,
    );
  }

  // Serialise before touching the chain or building: snapshots are chain-global.
  acquireSuiteLock();
  installLockCleanup();

  try {
    if (managed) {
      await ensureDedicatedChain({ reset });
    } else {
      const probe = await probeChain(rpcUrl);
      if (probe.error !== undefined) {
        fatal(
          `${rpcUrl} is not reachable (${probe.error.message}).`,
          'E2E_ANVIL_RPC was set explicitly, so this script does not start or bootstrap that chain.',
          'Start it yourself, or unset E2E_ANVIL_RPC to use the managed chain on :8555.',
        );
      }
      if (probe.chainId !== EXPECTED_CHAIN_ID) {
        fatal(`${rpcUrl} answers with chain id ${probe.chainId}, expected ${EXPECTED_CHAIN_ID}.`);
      }
    }

    console.log(`[e2e-chain] export E2E_ANVIL_RPC=${rpcUrl}`);
    if (ensureOnly) return;

    const result = await runPlaywright(rpcUrl, passthrough);
    releaseSuiteLock();
    if (result.signal !== null) {
      process.exit(130);
    }
    process.exit(result.code);
  } finally {
    // Reaches here for --ensure-only, fatal paths and after Playwright is done.
    // If Playwright is still running, the process 'exit' handler / signals own it.
    if (activeChild === null) releaseSuiteLock();
  }
}

main().catch((error) => {
  fatal(error instanceof Error ? error.message : String(error));
});
