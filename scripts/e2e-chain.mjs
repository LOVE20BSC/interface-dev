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
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ANVIL_REPO = resolve(process.env.E2E_ANVIL_REPO ?? resolve(ROOT, '..', 'anvil'));
const SUITE_PORT = 8555;
const HUMAN_PORT = 8545;
const EXPECTED_CHAIN_ID = 31337;
const DEFAULT_SUITE_RPC = `http://127.0.0.1:${SUITE_PORT}`;
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

async function rpc(rpcUrl, method, params = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const body = await response.json();
  if (body.error !== undefined) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/** A down port is expected (first run); a foreign chain is not. */
async function probeChain(rpcUrl) {
  try {
    const chainId = Number(await rpc(rpcUrl, 'eth_chainId'));
    return { chainId };
  } catch (error) {
    return { error };
  }
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
  const result = spawnSync('make', ['-C', ANVIL_REPO, ...args], { cwd: ROOT, stdio: 'inherit' });
  if (result.error !== undefined) fatal(`could not run make: ${result.error.message}`);
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
      const probe = await probeChain(DEFAULT_SUITE_RPC);
      if (probe.error === undefined) {
        fatal(
          `--reset-chain: ${DEFAULT_SUITE_RPC} answers but was not started by ../anvil`,
          `(no live .anvil/${SUITE_PORT}/anvil.pid). Refusing to kill a foreign process; stop it yourself.`,
        );
      }
    }
  }

  const probe = await probeChain(DEFAULT_SUITE_RPC);
  if (probe.error !== undefined) {
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

  const missing = await missingDeploymentCode(DEFAULT_SUITE_RPC);
  if (missing.length === 0) {
    console.log(
      `[e2e-chain] reusing the bootstrapped suite chain on ${DEFAULT_SUITE_RPC} ` +
        `(chain ${probe.chainId})`,
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
function runPlaywright(rpcUrl, passthrough) {
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
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  }
  child.on('exit', (code, signal) => {
    if (signal !== null) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
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
  runPlaywright(rpcUrl, passthrough);
}

main().catch((error) => {
  fatal(error instanceof Error ? error.message : String(error));
});
