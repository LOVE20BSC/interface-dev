import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Bounded transaction wait — the P0 /mint dead end (UX spec §4.2).
 *
 * The owner signed 「1. 授权」 while his wallet carried nonce 68 from the previous
 * chain epoch while anvil was at nonce 3. The transaction sat in the queued pool
 * forever, `eth_getTransactionReceipt` never resolved, the page stayed on
 * 「确认中…」 with the button disabled, and there was no error or escape.
 *
 * This spec reproduces the same dead end without touching the chain: the injected
 * wallet answers `eth_sendTransaction` with a syntactically valid hash that no
 * node has ever seen (nothing is submitted). On a normal receipt poll that is an
 * eternal 确认中; the bounded watcher must instead show the recovery alert and
 * re-enable the primary action after the deadline.
 *
 * DEADLINE — production ships the 90 s default from `tx-watch.ts`. The 4 s value
 * is a TEST-BUILD override only: `VITE_TX_DEADLINE_MS` is baked into the bundle at
 * build time, so users never wait 4 s. `pnpm e2e` supplies it automatically
 * (scripts/e2e-chain.mjs); a direct `playwright test` without it fails loudly
 * instead of silently losing this P0 coverage, unless `E2E_ALLOW_DEFAULT_DEADLINE=1`
 * opts into the skip (the skip message reports that the coverage was skipped).
 */

const SHORT_DEADLINE_MS = Number(process.env.VITE_TX_DEADLINE_MS ?? '');
const HAS_SHORT_DEADLINE =
  Number.isFinite(SHORT_DEADLINE_MS) && SHORT_DEADLINE_MS > 0 && SHORT_DEADLINE_MS <= 20_000;
const ALLOW_DEFAULT_DEADLINE = process.env.E2E_ALLOW_DEFAULT_DEADLINE === '1';

// Explicit escape hatch only: a plain run without the override fails loudly
// below, so the recovery coverage cannot disappear silently.
test.skip(
  !HAS_SHORT_DEADLINE && ALLOW_DEFAULT_DEADLINE,
  'VITE_TX_DEADLINE_MS is not set and E2E_ALLOW_DEFAULT_DEADLINE=1: tx recovery coverage was skipped (a 90 s build would outlast the test).',
);

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/deployments/anvil31337_dev.json'), 'utf8'),
) as {
  chainId: number;
  rpcUrls: string[];
  addresses: { memberNFT: `0x${string}` };
};

/** The endpoint `playwright.config.ts` bakes into the build and e2e/chain.ts uses. */
const RPC_URL = process.env.E2E_ANVIL_RPC ?? deployment.rpcUrls[0] ?? 'http://127.0.0.1:8555';
const CHAIN_ID = deployment.chainId;
const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;

// anvil account #2: funded with the genesis token, holds no MemberNFT yet.
const ACCOUNT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const;

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');
const RUN_ID = Math.random().toString(36).slice(2, 8);
const NAME = `Teste2e-txwatch-${RUN_ID}`;

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 120_000 });

/**
 * Injected EIP-1193 wallet whose writes are fabricated. Reads are proxied to the
 * real suite chain, so the mint page renders its normal form (price, balance,
 * name check) — only the submitted transaction is a ghost.
 *
 * Each `eth_sendTransaction` returns a different valid 32-byte hash so a
 * resubmission starts a fresh watch instead of reusing the stuck one.
 */
async function installGhostWallet(page: Page, account: string): Promise<void> {
  await page.addInitScript(
    ({ accountAddress, chainHex, rpcUrl }) => {
      let sent = 0;
      const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
      const rpc = async (method: string, params: unknown): Promise<unknown> => {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? [] }),
        });
        const body = (await response.json()) as {
          result?: unknown;
          error?: { code?: number; message?: string; data?: unknown };
        };
        if (body.error !== undefined) {
          const error = new Error(body.error.message ?? 'rpc error') as Error & {
            code?: number;
            data?: unknown;
          };
          if (body.error.code !== undefined) error.code = body.error.code;
          if (body.error.data !== undefined) error.data = body.error.data;
          throw error;
        }
        return body.result;
      };

      const provider = {
        isMetaMask: true,
        isConnected: () => true,
        request: async ({ method, params }: { method: string; params?: unknown }) => {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
            return [accountAddress];
          }
          if (method === 'eth_chainId') return chainHex;
          if (method === 'net_version') return String(parseInt(chainHex, 16));
          if (method === 'wallet_switchEthereumChain') return null;
          if (method === 'wallet_addEthereumChain') return null;
          if (method === 'eth_sendTransaction') {
            // A valid hash for a transaction that will never exist: the exact
            // shape of the owner's nonce-gapped approve().
            sent += 1;
            return `0x${sent.toString(16).padStart(64, '0')}`;
          }
          return rpc(method, params);
        },
        on: (event: string, handler: (...args: unknown[]) => void) => {
          (listeners[event] ??= []).push(handler);
          return provider;
        },
        removeListener: (event: string, handler: (...args: unknown[]) => void) => {
          listeners[event] = (listeners[event] ?? []).filter((entry) => entry !== handler);
          return provider;
        },
        removeAllListeners: () => {
          for (const key of Object.keys(listeners)) delete listeners[key];
          return provider;
        },
      };

      Object.defineProperty(window, 'ethereum', { configurable: true, value: provider });
    },
    { accountAddress: account, chainHex: CHAIN_HEX, rpcUrl: RPC_URL },
  );
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS, name), animations: 'disabled' });
}

async function connect(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: '连接钱包' }).first();
  await expect(button).toBeEnabled({ timeout: 10_000 });
  await button.click();
  // Wait for the pill's steady state: the connected wallet trigger, never the wrong-network pill.
  await expect(page.getByRole('button', { name: '打开钱包与身份 NFT 菜单' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: '网络不对，点此切换' })).toHaveCount(0);
  const walletChainId = await page.evaluate(async () => {
    const provider = (
      window as unknown as {
        ethereum?: { request: (args: { method: string }) => Promise<unknown> };
      }
    ).ethereum;
    return await provider?.request({ method: 'eth_chainId' });
  });
  expect(String(walletChainId).toLowerCase()).toBe(CHAIN_HEX.toLowerCase());
}

test(
  HAS_SHORT_DEADLINE
    ? '幽灵授权哈希在截止后给出恢复卡，主按钮重新可点'
    : 'tx-recovery: short deadline build required',
  async ({ page }) => {
    if (!HAS_SHORT_DEADLINE) {
      throw new Error(
        'This build has no short VITE_TX_DEADLINE_MS, so the bounded-wait path cannot be exercised. ' +
          'Run `pnpm e2e` (it exports VITE_TX_DEADLINE_MS=4000), or set E2E_ALLOW_DEFAULT_DEADLINE=1 ' +
          'to skip the P0 recovery coverage explicitly.',
      );
    }
    await installGhostWallet(page, ACCOUNT);
    await page.goto('/mint');
    await connect(page);

    const nameInput = page.getByLabel('给身份 NFT 起个名字');
    await expect(nameInput).toBeVisible({ timeout: 20_000 });
    await nameInput.fill(NAME);
    // The name check is debounced + on-chain; the approve CTA enables after 可以用.
    await expect(page.getByText('✓ 可以用')).toBeVisible({ timeout: 20_000 });

    const approve = page.getByRole('button', { name: '1. 授权' });
    await expect(approve).toBeEnabled({ timeout: 20_000 });
    // Evidence for the ladder reading order: `1 授权` above `2 铸造身份`.
    await shot(page, 'mint-approve-needed.png');
    await approve.click();

    // The wallet returned a hash, so the page enters the bounded pending state
    // (this is where the old code stayed forever). The countdown is the bounded
    // wait: a raw millisecond value must never be rendered.
    const pending = page.getByTestId('tx-watch-pending');
    await expect(pending).toBeVisible({ timeout: 15_000 });
    await expect(pending).toContainText('等待上链');

    // Past the deadline: the ghost hash is unknown to the node -> dropped. The
    // recovery alert explains it and the primary action is clickable again.
    const recovery = page.getByTestId('tx-watch-recovery');
    await expect(recovery).toBeVisible({ timeout: 30_000 });
    await expect(recovery).toContainText('这笔交易还没有被确认');
    await expect(recovery.getByRole('button', { name: '重新查询' })).toBeVisible();
    await expect(recovery.getByRole('button', { name: '重新提交' })).toBeVisible();
    await expect(approve).toBeEnabled({ timeout: 10_000 });
    // No explorer link on anvil (the environment package has none).
    await expect(recovery.getByRole('link', { name: '在区块链浏览器查看' })).toHaveCount(0);

    // Screenshot the whole recovery card (its actions must not hide behind the
    // fixed primary-action dock on a 390×844 phone).
    await recovery.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await shot(page, 'tx-recovery-card.png');

    // 「重新提交」 sends a new (ghost) hash with an explicit on-chain nonce; the
    // watcher restarts from pending instead of staying stuck on the old hash.
    // (Only the mint hash is persisted across reloads by design; an approval is
    // recovered from allowance(), so there is intentionally nothing to resume
    // for the approve step documented here.)
    await recovery.getByRole('button', { name: '重新提交' }).click();
    await expect(page.getByTestId('tx-watch-pending')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('tx-watch-recovery')).toHaveCount(0);
  },
);
