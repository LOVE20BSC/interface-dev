import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * M0 identity-first pages against the local anvil chain.
 *
 * The wallet is an injected EIP-1193 stub backed by the anvil RPC: reads go
 * through the app's HTTP transport, writes through eth_sendTransaction. The
 * anvil accounts are unlocked, so no private key ever enters the test.
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

const RPC_URL = process.env.E2E_ANVIL_RPC ?? deployment.rpcUrls[0] ?? 'http://127.0.0.1:8545';
const CHAIN_ID = deployment.chainId;
const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;
const MEMBER_NFT = deployment.addresses.memberNFT;
const MULTICALL3 = deployment.addresses.multicall3;

// anvil's deterministic accounts (mnemonic "test test ... junk").
const ACCOUNTS = {
  withIdentity: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // #1, claimed its airdrop
  eligible: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', // in snapshot, unclaimed, no NFT
  outsider: '0x8b3a350Cf5C34c9194ca85829a2df0ec3153bE5d', // not in snapshot, no NFT
} as const;

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

function identityCacheKey(account: string): string {
  return `love20:v1:${CHAIN_ID}:${MEMBER_NFT.toLowerCase()}:${account.toLowerCase()}:identity`;
}

/**
 * Installs window.ethereum before any app code runs. Methods the wallet spec
 * owns (accounts / chain / switching) are answered locally; everything else is
 * forwarded verbatim to the anvil RPC.
 */
async function installWallet(page: Page, account: string): Promise<void> {
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
    { accountAddress: account, chainHex: CHAIN_HEX, rpcUrl: RPC_URL },
  );
}

async function seedIdentity(page: Page, account: string, tokenId: string): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: identityCacheKey(account), value: JSON.stringify({ tokenId }) },
  );
}

async function connect(page: Page): Promise<void> {
  // The provider check settles asynchronously; the header pill stays disabled
  // for a beat before eth_requestAccounts is possible.
  const button = page.getByRole('button', { name: '连接钱包' }).first();
  await expect(button).toBeEnabled({ timeout: 5_000 });
  await button.click();
  await expect(page.getByRole('button', { name: '打开钱包与身份菜单' })).toBeVisible({
    timeout: 15_000,
  });
}

/** Primary buttons are the only solid brand-color controls; count the visible ones. */
async function countSolidButtons(page: Page): Promise<number> {
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

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS, name), animations: 'disabled' });
}

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });
});

test('home: disconnected shows connect and no identity yet', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await page.goto('/');

  await expect(page.getByRole('button', { name: '连接钱包' })).toHaveCount(2);
  await expect(page.getByText('一个钱包可以拥有多个身份，身份才是参与凭证。')).toBeVisible();
  await expect(page.getByText('你还没有身份')).toHaveCount(0);
  await expect(page.getByText('无需操作')).toHaveCount(0);
  expect(await countSolidButtons(page)).toBe(1);

  await shot(page, 'home-disconnected.png');
});

test('home: connected without identity offers 我的 NFT only', async ({ page }) => {
  await installWallet(page, ACCOUNTS.outsider);
  await page.goto('/');
  await connect(page);

  await expect(page.getByText('你还没有身份')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: '去我的 NFT' })).toBeVisible();
  await expect(page.getByRole('button', { name: '铸造身份' })).toHaveCount(0);
  await expect(page.getByText('无需操作')).toHaveCount(0);
  await expect(page.getByText('你参与了销毁活动，获得空投铸造资格')).toHaveCount(0);
  expect(await countSolidButtons(page)).toBe(0);

  await shot(page, 'home-connected-no-identity.png');
});

test('home: identity greeting persists across reload', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/');
  await connect(page);

  await expect(page.getByText('你好，Testdev-member-0')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('身份 #1').first()).toBeVisible();
  await expect(page.getByRole('link', { name: '切换身份' })).toBeVisible();
  await expect(page.getByText('无需操作')).toHaveCount(0);
  expect(await countSolidButtons(page)).toBe(0);

  await shot(page, 'home-connected-with-identity.png');

  await page.reload();
  await expect(page.getByText('你好，Testdev-member-0')).toBeVisible({ timeout: 15_000 });
});

test('home: eligible wallet sees the airdrop card', async ({ page }) => {
  await installWallet(page, ACCOUNTS.eligible);
  await page.goto('/');
  await connect(page);

  const title = page.getByText('你参与了销毁活动，获得空投铸造资格');
  await expect(title).toBeVisible({ timeout: 20_000 });
  const card = page.locator('section[aria-labelledby="airdrop-eligibility-title"]');
  await expect(card.getByRole('link', { name: '铸造空投份额' })).toBeVisible();
  // The card has a title and one CTA; no subtitle, no explanation sentence.
  await expect(card.locator('p')).toHaveCount(0);
  expect(await countSolidButtons(page)).toBe(1);
  await shot(page, 'home-airdrop-eligible.png');
});

test('home: a non-eligible account never sees the airdrop card', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity); // claimed its share during seeding
  const snapshotLoaded = page.waitForResponse(
    (response) => response.url().includes('/airdrop/anvil31337_dev.json'),
    { timeout: 20_000 },
  );
  await page.goto('/');
  await connect(page);
  await snapshotLoaded;
  await expect(page.getByText('你参与了销毁活动，获得空投铸造资格')).toHaveCount(0);
  await expect(page.getByText('无需操作')).toHaveCount(0);
});

test('my-nft: card list and local selection without a transaction', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await page.goto('/');
  await connect(page);
  await page
    .getByRole('link', { name: /我的 NFT/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/my-nft/);

  await expect(page.getByText('持有 1 个身份')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('当前：未选择')).toBeVisible();
  await expect(page.getByRole('button', { name: '使用此身份' })).toBeVisible();
  await shot(page, 'my-nft-list.png');

  await page.getByRole('button', { name: '使用此身份' }).click();
  await expect(page.getByText('当前：Testdev-member-0')).toBeVisible();
  await expect(page.getByRole('button', { name: '当前身份' })).toBeDisabled();
  // No wallet confirmation appeared: selection is a local cache write.
  await expect(page.getByRole('button', { name: '打开钱包与身份菜单' })).toBeVisible();
  await shot(page, 'my-nft-selected.png');

  await page.reload();
  await expect(page.getByText('当前：Testdev-member-0')).toBeVisible({ timeout: 15_000 });
});

test('identity cache is cleared when ownerOf belongs to someone else', async ({ page }) => {
  // Account #5 has no NFT, but a tokenId owned by account #0 is cached.
  await installWallet(page, ACCOUNTS.eligible);
  await seedIdentity(page, ACCOUNTS.eligible, '1');
  await page.goto('/');
  await connect(page);

  await expect(page.getByText('这个身份已不属于当前钱包')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('你还没有身份')).toBeVisible();
  await expect(page.getByText('你好，Testdev-member-0')).toHaveCount(0);
  const stored = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    identityCacheKey(ACCOUNTS.eligible),
  );
  expect(stored).toBeNull();
});

test('my-nft: empty wallet gets the mint identity next step', async ({ page }) => {
  await installWallet(page, ACCOUNTS.outsider);
  await page.goto('/my-nft');
  await connect(page);

  await expect(page.getByText('持有 0 个身份')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('你还没有身份。')).toBeVisible();
  await expect(page.getByRole('link', { name: '铸造身份' })).toHaveAttribute('href', '/mint');
});

test('my-nft: md+ renders the 编号/名称/操作 table', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/my-nft');
  await connect(page);

  await expect(page.getByRole('columnheader', { name: '编号' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('columnheader', { name: '名称' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '操作' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Testdev-member-0' })).toBeVisible();
});

test('my-nft: transfer drawer warns and rejects the current wallet', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/my-nft');
  await connect(page);

  await page.getByRole('button', { name: '转让' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByText(
      '转让会改变这个身份的控制者。身份的历史与质押仍留在身份上，不随钱包转走；转让不可撤销。',
    ),
  ).toBeVisible();
  await page.getByPlaceholder('0x 开头的 40 位地址').fill(ACCOUNTS.withIdentity);
  await expect(page.getByText('不能转让给自己。')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认转让' })).toBeDisabled();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('reads are batched through Multicall3, never one RPC per list item', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().startsWith(RPC_URL)) return;
    const body = request.postData();
    if (body !== null) calls.push(body.toLowerCase());
  });

  await installWallet(page, ACCOUNTS.withIdentity);
  await page.goto('/my-nft');
  await connect(page);
  await expect(page.getByText('持有 1 个身份')).toBeVisible({ timeout: 15_000 });

  // aggregate3((address,bool,bytes)[]) selector 0x82ad56cb, sent to the
  // Multicall3 address from the address book.
  const batched = calls.some(
    (body) => body.includes(MULTICALL3.toLowerCase()) && body.includes('0x82ad56cb'),
  );
  expect(batched).toBe(true);
});
