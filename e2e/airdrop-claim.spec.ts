import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createPublicClient, http, parseAbiItem, parseEventLogs, formatUnits } from 'viem';
import { isolateChain } from './chain';

/**
 * 空投铸造 (UX spec §3.4) against the local anvil chain.
 *
 * The wallet is the same injected EIP-1193 stub the other M0 specs use: reads go
 * through the app's HTTP transport, writes through eth_sendTransaction. Anvil
 * accounts are unlocked, so no private key enters the test.
 *
 * Chain mutations:
 *   - the eligible test claims the first unclaimed snapshot account among #6/#8/#9
 *     (never #5, which the home/mint specs read as their eligible wallet);
 *   - the already-claimed test pre-claims #7 outside the browser, then opens the
 *     page with no local record and expects the real chain-derived amount
 *     (「已铸造 {X} TestLOVE20」), never a fabricated or cached-as-chain number.
 */

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/deployments/anvil31337_dev.json'), 'utf8'),
) as {
  chainId: number;
  rpcUrls: string[];
  addresses: {
    airdrop: `0x${string}`;
    firstTokenAddress: `0x${string}`;
  };
};

const snapshot = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/airdrop/anvil31337_dev.json'), 'utf8'),
) as {
  merkleRoot: `0x${string}`;
  totalShare: string;
  entries: Array<{ account: `0x${string}`; share: string; proof: `0x${string}`[] }>;
};

const RPC_URL = process.env.E2E_ANVIL_RPC ?? deployment.rpcUrls[0] ?? 'http://127.0.0.1:8545';
const CHAIN_ID = deployment.chainId;
const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;
const AIRDROP = deployment.addresses.airdrop;
const TOKEN = deployment.addresses.firstTokenAddress;

// anvil's deterministic accounts (mnemonic "test test ... junk").
const CANDIDATE_CLAIMERS = [
  '0x976EA74026E726554dB657fA54763abd0C3a0aa9', // #6
  '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f', // #8
  '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720', // #9
] as const;
const ALREADY_CLAIMED = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'; // #7
const OUTSIDER = '0x8b3a350Cf5C34c9194ca85829a2df0ec3153bE5d'; // not in snapshot

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');
const CLAIM_EVENT = parseAbiItem(
  'event AirdropClaimed(address indexed token, address indexed account, uint256 share, uint256 amount, uint256 remainingShare)',
);
const publicClient = createPublicClient({ transport: http(RPC_URL) });

let claimer: `0x${string}` = CANDIDATE_CLAIMERS[0];
/** Set by beforeAll from the fixture claim's cast receipt (independent of the app). */
let alreadyClaimedAmount: bigint | undefined;

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 120_000 });

// Snapshot before this file's beforeAll fixtures mutate the chain; afterAll restores it.
isolateChain();

function snapshotEntry(account: string) {
  return snapshot.entries.find((entry) => entry.account.toLowerCase() === account.toLowerCase());
}

function castCallTo(address: string, signature: string, ...args: string[]): string {
  return execFileSync('cast', ['call', address, signature, ...args, '--rpc-url', RPC_URL], {
    encoding: 'utf8',
  }).trim();
}

function castCall(signature: string, ...args: string[]): string {
  return castCallTo(AIRDROP, signature, ...args);
}

function isClaimed(account: string): boolean {
  return castCall('isClaimed(address,address)(bool)', TOKEN, account) === 'true';
}

function proofArg(proof: readonly string[]): string {
  return `[${proof.join(',')}]`;
}

function parseUint(raw: string, label: string): bigint {
  // `cast call` appends a human-readable annotation (e.g. ` [1e26]`); the value
  // itself is always the leading decimal string.
  const match = /^\d+/.exec(raw);
  if (match === null) throw new Error(`expected a uint256 from ${label}, got ${raw}`);
  return BigInt(match[0]);
}

function castUint(signature: string, ...args: string[]): bigint {
  return parseUint(castCall(signature, ...args), signature);
}

function tokenUint(signature: string, ...args: string[]): bigint {
  return parseUint(castCallTo(TOKEN, signature, ...args), signature);
}

function claimableAmount(account: string, share: string, proof: readonly string[]): bigint {
  return castUint(
    'claimableAmount(address,address,uint256,bytes32[])(uint256)',
    TOKEN,
    account,
    share,
    proofArg(proof),
  );
}

function claimOutsideBrowser(account: `0x${string}`): void {
  const entry = snapshotEntry(account);
  if (entry === undefined) throw new Error(`account ${account} is not in the snapshot`);
  execFileSync(
    'cast',
    [
      'send',
      AIRDROP,
      'claim(address,address,uint256,bytes32[])',
      TOKEN,
      account,
      entry.share,
      proofArg(entry.proof),
      '--from',
      account,
      '--unlocked',
      '--rpc-url',
      RPC_URL,
    ],
    { encoding: 'utf8' },
  );
}

/**
 * Independent read of the already-minted amount: the CI-014 contract view via
 * `cast call` (not the app's adapter, not a local record). This is the same
 * value the page must show in S6.
 */
function castClaimedAmount(account: string): bigint {
  return castUint('claimedAmount(address,address)(uint256)', TOKEN, account);
}

/** Mirrors formatTokenAmount's grouping for the 18-decimals genesis token (6 digits). */
function displayAmount(value: bigint): string {
  const raw = formatUnits(value, 18);
  const [whole = '0', fraction] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmed = (fraction ?? '').slice(0, 6).replace(/0+$/, '');
  return trimmed.length > 0 ? `${grouped}.${trimmed}` : grouped;
}

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

async function connect(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: '连接钱包' }).first();
  await expect(button).toBeEnabled({ timeout: 5_000 });
  await button.click();
  await expect(page.getByRole('button', { name: '打开钱包与身份菜单' })).toBeVisible({
    timeout: 15_000,
  });
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS, name), animations: 'disabled' });
}

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });

  const fresh = CANDIDATE_CLAIMERS.find((account) => !isClaimed(account));
  if (fresh === undefined) {
    throw new Error(
      'no unclaimed airdrop account among #6/#8/#9; run `make -C ../anvil bootstrap` for a clean chain',
    );
  }
  claimer = fresh;

  if (!isClaimed(ALREADY_CLAIMED)) claimOutsideBrowser(ALREADY_CLAIMED);
  alreadyClaimedAmount = castClaimedAmount(ALREADY_CLAIMED);
});

test('airdrop: eligible wallet sees the estimate, claims, and gets a real receipt', async ({
  page,
}) => {
  const entry = snapshotEntry(claimer);
  expect(entry).toBeDefined();
  if (entry === undefined) return;

  await installWallet(page, claimer);
  // ?symbol= must not affect eligibility or the distributed token (CI-005).
  await page.goto('/airdrop?symbol=NOT_A_REAL_COMMUNITY');
  await connect(page);

  await expect(page.getByRole('heading', { name: '空投铸造' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('本次空投：TestLOVE20')).toBeVisible({ timeout: 20_000 });
  const expected = page.getByTestId('airdrop-expected-amount');
  await expect(expected).toContainText('预计可得');
  await expect(expected).toContainText('TestLOVE20');
  await expect(page.getByTestId('airdrop-share-percent')).toHaveText('你的份额 10%');

  const estimate = claimableAmount(claimer, entry.share, entry.proof);
  await expect(expected).toContainText(displayAmount(estimate));

  await shot(page, 'airdrop-eligible.png');

  await page.getByRole('button', { name: '空投铸造' }).click();
  await expect(page.getByRole('heading', { name: '铸造成功' })).toBeVisible({
    timeout: 30_000,
  });

  const receiptAmountText = (await page.getByTestId('airdrop-receipt-amount').innerText()).trim();
  const hash = (await page.getByTestId('airdrop-receipt-hash').innerText()).trim();
  expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);

  // The UI amount must match the AirdropClaimed event, not the pre-computed estimate.
  const onChainReceipt = await publicClient.getTransactionReceipt({
    hash: hash as `0x${string}`,
  });
  const events = parseEventLogs({
    abi: [CLAIM_EVENT],
    logs: onChainReceipt.logs,
    eventName: 'AirdropClaimed',
  });
  const event = events.find(
    (candidate) =>
      candidate.args.account.toLowerCase() === claimer.toLowerCase() &&
      candidate.args.token.toLowerCase() === TOKEN.toLowerCase(),
  );
  expect(event).toBeDefined();
  if (event === undefined) return;
  const eventAmount = event.args.amount;
  expect(eventAmount).toBe(estimate);
  expect(receiptAmountText).toBe(`${displayAmount(eventAmount)} TestLOVE20`);

  // Outside the browser: the claim flipped isClaimed and moved exactly this amount.
  expect(isClaimed(claimer)).toBe(true);
  expect(tokenUint('balanceOf(address)(uint256)', claimer)).toBe(eventAmount);

  // §4.3: the receipt survives a refresh instead of falling back to the CTA.
  await page.reload();
  await expect(page.getByRole('heading', { name: '铸造成功' })).toBeVisible({
    timeout: 30_000,
  });
  expect((await page.getByTestId('airdrop-receipt-amount').innerText()).trim()).toBe(
    receiptAmountText,
  );
  expect((await page.getByTestId('airdrop-receipt-hash').innerText()).trim()).toBe(hash);
  await expect(page.getByRole('link', { name: '用这些代币铸造身份' })).toHaveAttribute(
    'href',
    '/mint',
  );
  await expect(page.getByRole('link', { name: '回首页' })).toBeVisible();

  await shot(page, 'airdrop-receipt.png');

  console.log(
    `airdrop claim: account=${claimer} tx=${hash} amount=${receiptAmountText} isClaimed=${isClaimed(claimer)}`,
  );
});

test('airdrop: already claimed on-chain shows the real minted amount, not a local cache', async ({
  page,
}) => {
  expect(isClaimed(ALREADY_CLAIMED)).toBe(true);
  expect(alreadyClaimedAmount).toBeDefined();
  if (alreadyClaimedAmount === undefined) return;

  await installWallet(page, ALREADY_CLAIMED);
  await page.goto('/airdrop');
  await connect(page);

  // No local record in this context: the adapter reads the chain (CI-014 view on
  // a redeployed chain, dev AirdropClaimed logs on the current one), so S6 must
  // equal the amount cast read independently in beforeAll.
  const expectedTitle = `已铸造 ${displayAmount(alreadyClaimedAmount)} TestLOVE20`;
  const title = page.getByTestId('airdrop-claimed-title');
  await expect(title).toBeVisible({ timeout: 20_000 });
  await expect(title).toHaveText(expectedTitle);
  await expect(page.getByTestId('airdrop-claimed-body')).toHaveText(
    '金额来自链上这笔交易的记录，不依赖本机缓存。',
  );
  // The old 「这台设备没有留下这次的铸造记录」 dead end must be gone.
  await expect(page.getByText('这台设备没有留下这次的铸造记录', { exact: false })).toHaveCount(0);
  await expect(page.getByTestId('airdrop-receipt-amount')).toHaveCount(0);
  await expect(page.getByTestId('airdrop-receipt-hash')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '空投铸造' })).toHaveCount(0);

  await shot(page, 'airdrop-already-claimed-amount.png');

  // Reload keeps the same chain-derived amount (still no local receipt).
  await page.reload();
  await expect(page.getByTestId('airdrop-claimed-title')).toHaveText(expectedTitle, {
    timeout: 20_000,
  });
});

test('airdrop: a wallet outside the snapshot gets the reason and a way out', async ({ page }) => {
  await installWallet(page, OUTSIDER);
  await page.goto('/airdrop');
  await connect(page);

  await expect(page.getByText('这个钱包不在空投名单里。')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('空投只面向快照时的参与者，不影响你现在参与。')).toBeVisible();
  const swap = page.getByRole('link', { name: '用 ETH 兑换 TestLOVE20' });
  await expect(swap).toBeVisible();
  await expect(swap).toHaveAttribute('href', '/swap?symbol=TestLOVE20');
  await expect(page.getByRole('button', { name: '空投铸造' })).toHaveCount(0);

  await shot(page, 'airdrop-no-eligibility.png');
});
