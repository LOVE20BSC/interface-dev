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
 * The mining mode the suite chain must be in between spec files.
 *
 * `make bootstrap` enables 1 s interval mining after `make verify` (and leaves
 * automine off, because `--block-time` is not passed at startup). Every other spec
 * relies on it: without interval mining a submitted transaction never mines and
 * the whole file times out. See 「挖矿模式」 in e2e/README.md for the 2026-11-16 flake.
 */
export const SUITE_MINING = Object.freeze({ automine: false, intervalMining: 1 });

export interface MiningMode {
  readonly automine: boolean;
  readonly intervalMining: number;
}

export async function readMiningMode(): Promise<MiningMode> {
  const [automine, intervalMining] = await Promise.all([
    anvilRpc<boolean>('anvil_getAutomine'),
    anvilRpc<number>('anvil_getIntervalMining'),
  ]);
  return { automine, intervalMining };
}

/**
 * Turns interval + automine mining off so a submitted transaction stays in the
 * pool (the slow-chain window a real wallet sees while the transaction is
 * broadcast but not mined).
 */
export async function suspendMining(): Promise<void> {
  await anvilRpc('anvil_setIntervalMining', [0]);
  await anvilRpc('anvil_setAutomine', [false]);
}

/**
 * Puts the chain back into `SUITE_MINING` and ASSERTS the read-back.
 *
 * This is the fix for the 「链挖矿模式泄漏」 flake: a spec that disables mining and
 * never restores it (a failed `afterAll`, a killed worker, a stray `return`) makes
 * every following spec on the same chain wait forever, which showed up as two
 * full-suite failures. The assertion fails the tearing-down spec instead of the
 * innocent next one.
 */
export async function restoreMining(): Promise<void> {
  try {
    await anvilRpc('anvil_setAutomine', [SUITE_MINING.automine]);
    await anvilRpc('anvil_setIntervalMining', [SUITE_MINING.intervalMining]);
  } catch (error) {
    // Keep going: the read-back below is the assertion that matters, and it says
    // what the chain is actually left in.
    console.error('[chain] restoring the mining mode failed; verifying by read-back', error);
  }
  const mode = await readMiningMode();
  if (
    mode.automine !== SUITE_MINING.automine ||
    mode.intervalMining !== SUITE_MINING.intervalMining
  ) {
    throw new Error(
      `[chain] mining mode not restored: automine=${mode.automine} intervalMining=${mode.intervalMining}, ` +
        `expected automine=${SUITE_MINING.automine} intervalMining=${SUITE_MINING.intervalMining}. ` +
        'Every later spec will hang without 1 s interval mining — run `pnpm e2e:reset-chain`.',
    );
  }
}

/**
 * Registers a file-scoped snapshot before every hook declared after this call
 * and reverts it after the file's tests. Call it once at the top level of a
 * spec file, before that file's own `test.beforeAll` mutations.
 *
 * Mining mode is restored on BOTH ends: before the snapshot (so a leak left by a
 * crashed previous file cannot poison this one) and after the revert (so a spec
 * that suspended mining cannot poison the next one, even when its own `afterAll`
 * did not run).
 */
export function isolateChain(): void {
  let snapshotId: string | undefined;

  test.beforeAll(async () => {
    await restoreMining();
    snapshotId = await snapshotChain();
    console.log(`[chain] snapshot ${snapshotId} (${ANVIL_RPC})`);
  });

  test.afterAll(async () => {
    try {
      if (snapshotId !== undefined) {
        await revertChain(snapshotId);
        console.log(`[chain] reverted ${snapshotId} (${ANVIL_RPC})`);
      }
    } finally {
      await restoreMining();
    }
  });
}
