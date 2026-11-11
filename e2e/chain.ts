import { test } from '@playwright/test';

/**
 * Chain-state isolation for the e2e suite.
 *
 * The suite owns a dedicated anvil chain: http://127.0.0.1:8555 by default, never the developer's
 * personal chain on :8545. `pnpm e2e` (scripts/e2e-chain.mjs) bootstraps that chain on the first run
 * and exports E2E_ANVIL_RPC for this process; playwright.config.ts forwards the same endpoint into
 * the build as VITE_ANVIL_RPC, so the page and the specs use one chain. The address book is
 * unchanged because a clean bootstrap from deployer nonce 0 reproduces the committed addresses.
 *
 * Every spec file mutates the suite chain (claims, mints, swaps, approvals, fixtures). Anvil 1.8.1
 * exposes `anvil_snapshot` / `anvil_revert` (the `evm_*` aliases work too); a snapshot per test file
 * plus a revert in `afterAll` restores the exact pre-file chain state, so a second `pnpm e2e` on the
 * same chain starts where the first one did.
 *
 * This is a per-file fixture on purpose: tests inside a file share fixtures (e.g. the mint receipt is
 * read by the following my-nft test), so reverting per test would break them. Files must not overlap,
 * which is why playwright.config.ts runs the suite on one worker; two workers taking snapshots at
 * the same time would revert each other's writes.
 */

const DEFAULT_ANVIL_RPC = 'http://127.0.0.1:8555';
const HUMAN_ANVIL_PORT = '8545';

/** Hostnames that mean "this machine"; only these can be the developer's personal chain. */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

function resolveAnvilRpc(): string {
  const raw = (process.env.E2E_ANVIL_RPC ?? '').trim();
  const rpc = (raw === '' ? DEFAULT_ANVIL_RPC : raw).replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(rpc);
  } catch {
    throw new Error(`[chain] E2E_ANVIL_RPC is not a valid URL: ${JSON.stringify(raw)}`);
  }
  if (LOCAL_HOSTS.has(url.hostname) && url.port === HUMAN_ANVIL_PORT) {
    // Defense in depth: scripts/e2e-chain.mjs already refuses before Playwright starts. Tests may
    // never snapshot/revert/bootstrap the developer's chain - see e2e/README.md for the incident.
    throw new Error(
      `[chain] refusing to run against ${rpc}: that is the developer's personal chain. ` +
        'Unset E2E_ANVIL_RPC to use the dedicated suite chain on :8555.',
    );
  }
  return rpc;
}

export const ANVIL_RPC = resolveAnvilRpc();

interface JsonRpcResponse {
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
}

let requestId = 0;

export async function anvilRpc<T>(method: string, params: readonly unknown[] = []): Promise<T> {
  const response = await fetch(ANVIL_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
  });
  if (!response.ok) {
    throw new Error(`anvil ${method} failed: HTTP ${response.status} from ${ANVIL_RPC}`);
  }
  const body = (await response.json()) as JsonRpcResponse;
  if (body.error !== undefined) {
    throw new Error(`anvil ${method} failed: ${body.error.message} (${body.error.code})`);
  }
  return body.result as T;
}

export async function snapshotChain(): Promise<string> {
  // `anvil_snapshot` is anvil's documented name; `evm_snapshot` is the same call.
  const id = await anvilRpc<string>('anvil_snapshot');
  return String(id);
}

export async function revertChain(snapshotId: string): Promise<void> {
  const reverted = await anvilRpc<boolean>('anvil_revert', [snapshotId]);
  if (!reverted) {
    throw new Error(
      `anvil_revert ${snapshotId} returned false; the chain was restarted or the snapshot was already consumed`,
    );
  }
}

/**
 * Registers a file-scoped snapshot before every hook declared after this call
 * and reverts it after the file's tests. Call it once at the top level of a
 * spec file, before that file's own `test.beforeAll` mutations.
 */
export function isolateChain(): void {
  let snapshotId: string | undefined;

  test.beforeAll(async () => {
    snapshotId = await snapshotChain();
    console.log(`[chain] snapshot ${snapshotId} (${ANVIL_RPC})`);
  });

  test.afterAll(async () => {
    if (snapshotId === undefined) return;
    await revertChain(snapshotId);
    console.log(`[chain] reverted ${snapshotId} (${ANVIL_RPC})`);
  });
}
