import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

/**
 * Shared injected-wallet stub for the home/我的 specs.
 *
 * The wallet is an injected EIP-1193 stub backed by the dedicated e2e anvil
 * RPC: reads go through the app's HTTP transport, writes through
 * eth_sendTransaction. The anvil accounts are unlocked, so no private key ever
 * enters the test. `pnpm e2e` (scripts/e2e-chain.mjs) guarantees :8555.
 */

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/deployments/anvil31337_dev.json'), 'utf8'),
) as {
  chainId: number;
  rpcUrls: string[];
  addresses: {
    memberNFT: `0x${string}`;
    firstTokenAddress: `0x${string}`;
    multicall3: `0x${string}`;
  };
};

export const RPC_URL =
  process.env.E2E_ANVIL_RPC ?? deployment.rpcUrls[0] ?? 'http://127.0.0.1:8545';
export const CHAIN_ID = deployment.chainId;
export const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;
export const MEMBER_NFT = deployment.addresses.memberNFT;
export const MULTICALL3 = deployment.addresses.multicall3;

// anvil's deterministic accounts (mnemonic "test test ... junk").
export const ACCOUNTS = {
  withIdentity: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // #1, claimed its airdrop
  eligible: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', // in snapshot, unclaimed, no NFT
  outsider: '0x8b3a350Cf5C34c9194ca85829a2df0ec3153bE5d', // not in snapshot, no NFT
} as const;

/**
 * The seed mints `Testdev-member-0` verbatim (anvil
 * params/anvil31337_dev/seed.params SEED_MEMBER_NAME_PREFIX=Testdev-member-).
 * core@72a1604 no longer adds `Test` on chain, so this is the fixture string.
 */
export const SEEDED_NAME = 'Testdev-member-0';

export function identityCacheKey(account: string): string {
  return `love20:v1:${CHAIN_ID}:${MEMBER_NFT.toLowerCase()}:${account.toLowerCase()}:identity`;
}

/**
 * Installs window.ethereum before any app code runs. Methods the wallet spec
 * owns (accounts / chain / switching) are answered locally; everything else is
 * forwarded verbatim to the anvil RPC.
 */
export async function installWallet(
  page: Page,
  account: string,
  chainHex: string = CHAIN_HEX,
): Promise<void> {
  await page.addInitScript(
    ({ accountAddress, chainHex, rpcUrl }) => {
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

      Object.defineProperty(window, 'ethereum', {
        configurable: true,
        value: provider,
      });
    },
    { accountAddress: account, chainHex, rpcUrl: RPC_URL },
  );
}

export async function seedIdentity(page: Page, account: string, tokenId: string): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: identityCacheKey(account), value: JSON.stringify({ tokenId }) },
  );
}

export async function connect(page: Page): Promise<void> {
  // The provider check settles asynchronously; the header pill stays disabled
  // for a beat before eth_requestAccounts is possible.
  const button = page.getByRole('button', { name: '连接钱包' }).first();
  await expect(button).toBeEnabled({ timeout: 5_000 });
  await button.click();
  await expect(page.getByRole('button', { name: '打开钱包与身份 NFT 菜单' })).toBeVisible({
    timeout: 15_000,
  });
}

/** Primary buttons are the only solid brand-color controls; count the visible ones. */
export async function countSolidButtons(page: Page): Promise<number> {
  return page.evaluate(() => {
    const solid = new Set(['rgb(37, 99, 235)', 'rgb(29, 78, 216)', 'rgb(220, 38, 38)']);
    const nodes = Array.from(document.querySelectorAll('button, a'));
    return nodes.filter((node) => {
      const element = node as HTMLElement;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      const style = window.getComputedStyle(element);
      return style.visibility !== 'hidden' && solid.has(style.backgroundColor);
    }).length;
  });
}

/**
 * UX spec §1.3 (owner 2026-11-11): the mobile home wordmark is visible only
 * while the wallet is disconnected. Connected (and wrong-chain) home relies on
 * the top-right chip as the single community name.
 */
export async function expectHomeWordmark(page: Page, visible: boolean): Promise<void> {
  const wordmark = page.getByTestId('home-wordmark');
  if (visible) {
    await expect(wordmark).toBeVisible({ timeout: 15_000 });
    await expect(wordmark).toHaveText('TestLOVE20');
  } else {
    await expect(wordmark).toHaveCount(0);
  }
  // The wordmark is a label, never a second home link.
  await expect(page.getByRole('banner').getByRole('link')).toHaveCount(0);
}
