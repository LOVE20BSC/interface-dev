import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_PATH = process.env.E2E_BASE_PATH ?? '/';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ROOT = dirname(fileURLToPath(import.meta.url));

const DEFAULT_E2E_ANVIL_RPC = 'http://127.0.0.1:8555';
const HUMAN_ANVIL_PORT = '8545';

/** Hostnames that mean "this machine"; only these can be the developer's personal chain. */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

/**
 * The suite runs on its own anvil chain, never the developer's personal chain on :8545.
 * scripts/e2e-chain.mjs ensures that chain exists and exports E2E_ANVIL_RPC; this function is the
 * last line of defense for a direct `playwright test` and the single source of the build-time RPC.
 * See e2e/README.md for the 2026-11-11 incident this prevents.
 */
function resolveE2eAnvilRpc(): string {
  const raw = (process.env.E2E_ANVIL_RPC ?? '').trim();
  const rpc = (raw === '' ? DEFAULT_E2E_ANVIL_RPC : raw).replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(rpc);
  } catch {
    throw new Error(`[playwright] E2E_ANVIL_RPC is not a valid URL: ${JSON.stringify(raw)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`[playwright] E2E_ANVIL_RPC must be http(s), got ${url.protocol}`);
  }
  if (LOCAL_HOSTS.has(url.hostname) && url.port === HUMAN_ANVIL_PORT) {
    throw new Error(
      `[playwright] REFUSING TO RUN: E2E_ANVIL_RPC resolves to ${rpc}, the developer's personal ` +
        'chain. Unset it to use the dedicated suite chain on :8555.',
    );
  }
  return rpc;
}

const E2E_ANVIL_RPC = resolveE2eAnvilRpc();

// Workers inherit the runner's environment; pin the resolved endpoint so a direct `playwright test`
// can never fall back to the address book's :8545 RPC. `pnpm e2e` (scripts/e2e-chain.mjs) already
// exports the same value.
process.env.E2E_ANVIL_RPC = E2E_ANVIL_RPC;

// ------------------------------------------------------------------------------------------------
// stale-preview guard: only reuse a `vite preview` whose served build id matches this run
// ------------------------------------------------------------------------------------------------
// Files whose content can change the bundle. The generated build id itself is ignored by git and
// never part of the hash (it would feed back into the next id).
const BUILD_INPUT_PATHS = [
  'index.html',
  'vite.config.ts',
  'package.json',
  'pnpm-lock.yaml',
  'src',
  'public',
];

function gitBytes(args: string[]): Buffer {
  const result = spawnSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout;
}

/**
 * The id this run will bake into the bundle. It is deliberately deterministic (sources + build
 * environment + endpoint): a preview left over from an identical earlier run is genuinely the same
 * bundle and may be reused, while a preview built from different sources, RPC or deadline is stale.
 * scripts/gen-build-id.mjs honours E2E_BUILD_ID, so the id is identical here and in the build.
 */
function computeRunBuildId(): string {
  try {
    const head = gitBytes(['rev-parse', 'HEAD']).toString('utf8').trim();
    const hash = createHash('sha256');
    hash.update(`love20-e2e-build-v1\0node=${process.version}\0head=${head}\0`);
    hash.update(gitBytes(['diff', 'HEAD', '--', ...BUILD_INPUT_PATHS]));
    const untracked = gitBytes([
      'ls-files',
      '-z',
      '--others',
      '--exclude-standard',
      '--',
      ...BUILD_INPUT_PATHS,
    ])
      .toString('utf8')
      .split('\0')
      .filter((file) => file.length > 0);
    for (const file of untracked) {
      hash.update(`untracked:${file}\0`);
      hash.update(readFileSync(resolve(ROOT, file)));
    }
    hash.update(
      `env=${JSON.stringify({
        basePath: BASE_PATH,
        port: PORT,
        variant: 'dev',
        anvilRpc: E2E_ANVIL_RPC,
        txDeadlineMs: process.env.VITE_TX_DEADLINE_MS ?? '',
        siteOrigin: process.env.VITE_SITE_ORIGIN ?? '',
      })}\0`,
    );
    return `e2e-${head.slice(0, 10)}-${hash.digest('hex').slice(0, 10)}`;
  } catch (error) {
    // Not fatal: a non-git checkout still runs, but every pre-existing preview is treated as stale.
    const fallback = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
    console.warn(
      `[playwright] could not fingerprint the build (${String(error)}); any existing preview will be restarted (id ${fallback})`,
    );
    return fallback;
  }
}

const E2E_BUILD_ID = computeRunBuildId();
// Both direct children (pnpm build -> gen-build-id) and any tooling spawned from the runner see it.
process.env.E2E_BUILD_ID = E2E_BUILD_ID;

function listenerPids(port: number): number[] {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    encoding: 'utf8',
  });
  if (result.error !== undefined || result.status !== 0) return [];
  return [
    ...new Set(
      result.stdout
        .split(/\s+/)
        .filter(Boolean)
        .map(Number)
        .filter((pid) => Number.isInteger(pid) && pid > 0),
    ),
  ];
}

function commandOf(pid: number): string | null {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (result.error !== undefined || result.status !== 0) return null;
  return result.stdout.trim();
}

/** A listener may only be killed when its own cmdline proves it is the `vite preview` on our port. */
function isOurPreview(pid: number): boolean {
  const command = commandOf(pid);
  if (command === null) return false;
  return (
    /\bvite\b/i.test(command) &&
    /\bpreview\b/i.test(command) &&
    new RegExp(`(^|[^0-9])${PORT}([^0-9]|$)`).test(command)
  );
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (
      error !== null &&
      typeof error === 'object' &&
      (error as NodeJS.ErrnoException).code === 'EPERM'
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

async function stopProvenPreview(pid: number): Promise<void> {
  // Re-check immediately before signalling: pids can be recycled between lsof and kill.
  if (!isOurPreview(pid)) {
    throw new Error(
      `[playwright] refusing to kill pid ${pid}: its cmdline is not our vite preview`,
    );
  }
  process.kill(pid, 'SIGTERM');
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (!isPidAlive(pid)) return;
    await sleep(200);
  }
  console.warn(`[playwright] vite preview pid ${pid} ignored SIGTERM; sending SIGKILL`);
  process.kill(pid, 'SIGKILL');
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (!isPidAlive(pid)) return;
    await sleep(200);
  }
  throw new Error(`[playwright] could not stop stale vite preview pid ${pid} on :${PORT}`);
}

async function waitForPortFree(port: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (listenerPids(port).length === 0) return;
    await sleep(200);
  }
  throw new Error(`[playwright] stale preview still holds :${port} after the restart`);
}

/** @returns `undefined` when nothing answers, `null` when something answers without a usable id. */
async function readServedBuildId(): Promise<string | null | undefined> {
  const url = `${ORIGIN}${BASE_PATH}build-id.json?t=${Date.now().toString()}`;
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(2_000) });
  } catch {
    return undefined;
  }
  if (!response.ok) return null;
  try {
    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null) return null;
    const buildId = (payload as { buildId?: unknown }).buildId;
    return typeof buildId === 'string' && buildId.length > 0 ? buildId : null;
  } catch {
    return null;
  }
}

/**
 * Decide `reuseExistingServer` instead of trusting whatever is already listening on :4173. A
 * preview from an earlier run may serve an old bundle (2026-11-11: phantom failures then a false
 * 49/49 once it was killed). If the served build id matches this run, reuse; if it differs, restart
 * the process only when lsof + ps prove it is our `vite preview` on this port, otherwise fail fast.
 */
async function preparePreviewServer(): Promise<boolean> {
  const reuseAllowed = process.env.CI !== 'true' && (process.env.E2E_REUSE_PREVIEW ?? '') !== '0';
  if (!reuseAllowed) return false;

  const served = await readServedBuildId();
  if (served === undefined) return false; // nothing there; Playwright starts its own preview
  if (served === E2E_BUILD_ID) {
    console.log(`[playwright] reusing preview on ${ORIGIN} (build id ${served} matches this run)`);
    return true;
  }

  const servedLabel = served ?? 'unknown';
  const pids = listenerPids(PORT);
  const proven = pids.filter((pid) => isOurPreview(pid));
  if (pids.length === 0 || proven.length !== pids.length) {
    const detail =
      pids.length === 0
        ? `no listener on :${PORT} could be identified with lsof`
        : `pid(s) ${pids.filter((pid) => !proven.includes(pid)).join(', ')} on :${PORT} are not our vite preview`;
    throw new Error(
      `[playwright] :${PORT} 上是旧构建（${servedLabel} ≠ ${E2E_BUILD_ID}），拒绝复用。` +
        ` ${detail}. Stop that process or run with E2E_REUSE_PREVIEW=0.`,
    );
  }

  console.warn(
    `[playwright] :${PORT} serves stale build ${servedLabel} ≠ ${E2E_BUILD_ID}; ` +
      `restarting proven vite preview pid(s) ${proven.join(', ')}`,
  );
  for (const pid of proven) await stopProvenPreview(pid);
  await waitForPortFree(PORT);
  return false;
}

const reuseExistingServer = await preparePreviewServer();

/**
 * E2E runs the production build through `vite preview`, never the dev server
 * (ADR-0001 §3.4). Set E2E_BASE_PATH=/repo/ to exercise a project-pages build.
 */
export default defineConfig({
  testDir: './e2e',
  /**
   * One worker, one file at a time. Every spec file wraps itself in an anvil snapshot/revert pair
   * (e2e/chain.ts). That isolation is chain-global, so two files mutating the dedicated suite chain
   * concurrently would revert each other's writes. The chain belongs to this suite now, so serial
   * runs are a repeatability choice, not a safety measure for the developer's chain.
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI === 'true',
  retries: process.env.CI === 'true' ? 2 : 0,
  reporter: process.env.CI === 'true' ? 'github' : 'list',
  use: {
    baseURL: `${ORIGIN}${BASE_PATH}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT}`,
    url: `${ORIGIN}${BASE_PATH}`,
    // Reuse stays on for local runs, but only after preparePreviewServer() proved the served build
    // id matches the bundle this run is about to build. CI always builds from scratch.
    reuseExistingServer,
    timeout: 180_000,
    env: {
      VITE_BASE: BASE_PATH,
      // 首页 / 我的 NFT 验收必须跑在本地 anvil 地址簿上。
      VITE_ENV: 'dev',
      // Bake the resolved suite endpoint into the bundle; e2e/chain.ts uses the same value.
      VITE_ANVIL_RPC: E2E_ANVIL_RPC,
      // Make gen-build-id deterministic so the id served by a preview and the id this run builds
      // are comparable. See computeRunBuildId().
      E2E_BUILD_ID,
    },
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
