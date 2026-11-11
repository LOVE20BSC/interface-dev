import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_PATH = process.env.E2E_BASE_PATH ?? '/';
const ORIGIN = `http://127.0.0.1:${PORT}`;

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
    // Never reuse a preview that may have been built with a different VITE_ANVIL_RPC: the suite
    // must prove its own build is wired to the resolved E2E_ANVIL_RPC. Opt in with
    // E2E_REUSE_PREVIEW=1 only when you know the running preview was built from the same endpoint.
    reuseExistingServer: process.env.E2E_REUSE_PREVIEW === '1',
    timeout: 180_000,
    env: {
      VITE_BASE: BASE_PATH,
      // 首页 / 我的 NFT 验收必须跑在本地 anvil 地址簿上。
      VITE_ENV: 'dev',
      // Bake the resolved suite endpoint into the bundle; e2e/chain.ts uses the same value.
      VITE_ANVIL_RPC: E2E_ANVIL_RPC,
    },
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
