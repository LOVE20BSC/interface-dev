import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createPublicClient, formatUnits, http, parseAbiItem, parseEventLogs } from 'viem';
import { isolateChain } from './chain';

/**
 * 通用兑换 (UX spec §3.5) against the local anvil chain.
 *
 * Fixtures are idempotent: two child community tokens are launched from the
 * genesis token (TestEMPTY1 with seeded liquidity for a real 2-hop quote,
 * TestEMPTY2 with zero liquidity for the protocol's default empty-pool state).
 * No private key enters the test: anvil accounts are unlocked and writes go
 * through the injected EIP-1193 stub, exactly like the other M0 specs.
 */

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/deployments/anvil31337_dev.json'), 'utf8'),
) as {
  chainId: number;
  rpcUrls: string[];
  nativeCurrency: { symbol: string; decimals: number };
  addresses: {
    tokenAddress: `0x${string}`;
    firstTokenAddress: `0x${string}`;
    router: `0x${string}`;
    factory: `0x${string}`;
    launch: `0x${string}`;
    weth: `0x${string}`;
    pair: `0x${string}`;
    memberNFT: `0x${string}`;
    mint: `0x${string}`;
  };
};

const RPC_URL = process.env.E2E_ANVIL_RPC ?? deployment.rpcUrls[0] ?? 'http://127.0.0.1:8545';
const CHAIN_ID = deployment.chainId;
const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;
const NATIVE = deployment.nativeCurrency.symbol;
const TOKEN = deployment.addresses.firstTokenAddress;
const ROUTER = deployment.addresses.router;
const FACTORY = deployment.addresses.factory;
const LAUNCH = deployment.addresses.launch;
const WETH = deployment.addresses.weth;
const MEMBER_NFT = deployment.addresses.memberNFT;
const GENESIS_PAIR = deployment.addresses.pair;

// anvil's deterministic accounts. Buyer/seller are not touched by the other specs.
const BUYER = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'; // #4: ETH + TestLOVE20
const SELLER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'; // #3: TestLOVE20
const FIXTURE_OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // #1: member #1
const OUTSIDER = '0x8b3a350Cf5C34c9194ca85829a2df0ec3153bE5d'; // 0 ETH, 0 TestLOVE20
const MINT = deployment.addresses.mint;

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');
const pairSwapEvent = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
);
const publicClient = createPublicClient({ transport: http(RPC_URL) });

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 180_000 });

// Snapshot before this file's beforeAll fixtures mutate the chain; afterAll restores it.
isolateChain();

let EMPTY_WITH_LIQUIDITY: `0x${string}` | undefined;
let EMPTY_WITHOUT_LIQUIDITY: `0x${string}` | undefined;
let emptyPoolPair: `0x${string}` | undefined;
let fixturesReady = false;

function cast(args: string[]): string {
  return execFileSync('cast', [...args, '--rpc-url', RPC_URL], { encoding: 'utf8' }).trim();
}

function castCall(address: string, signature: string, ...args: string[]): string {
  return cast(['call', address, signature, ...args]);
}

function parseUint(raw: string): bigint {
  const match = /^\d+/.exec(raw);
  if (match === null) throw new Error(`expected a uint256, got ${raw}`);
  return BigInt(match[0]);
}

function uintOf(address: string, signature: string, ...args: string[]): bigint {
  return parseUint(castCall(address, signature, ...args));
}

function addressOf(address: string, signature: string, ...args: string[]): `0x${string}` {
  const raw = castCall(address, signature, ...args);
  const match = /0x[0-9a-fA-F]{40}/.exec(raw);
  if (match === null) throw new Error(`expected an address from ${signature}, got ${raw}`);
  return match[0] as `0x${string}`;
}

function castSend(
  address: string,
  signature: string,
  args: readonly string[],
  from: string = FIXTURE_OWNER,
): void {
  execFileSync(
    'cast',
    ['send', address, signature, ...args, '--from', from, '--unlocked', '--rpc-url', RPC_URL],
    { encoding: 'utf8' },
  );
}

function tokenSymbolOf(address: `0x${string}`): string {
  return castCall(address, 'symbol()(string)').replaceAll('"', '');
}

function deadline(): string {
  return String(Math.floor(Date.now() / 1000) + 1200);
}

function impersonateMint(): void {
  cast(['rpc', 'anvil_impersonateAccount', MINT]);
  cast(['rpc', 'anvil_setBalance', MINT, '0xde0b6b3a7640000']);
}

function ensureChildToken(inputSymbol: string, finalSymbol: string): `0x${string}` {
  const existing = addressOf(LAUNCH, 'tokenAddressBySymbol(string)(address)', finalSymbol);
  if (existing !== '0x0000000000000000000000000000000000000000') return existing;

  impersonateMint();
  castSend(LAUNCH, 'addLaunchCount(address,uint256,uint256)', [TOKEN, '1', '1'], MINT);
  castSend(LAUNCH, 'launchToken(string,address,uint256,address,uint8,bytes[])', [
    inputSymbol,
    TOKEN,
    '1',
    FIXTURE_OWNER,
    '0',
    '[]',
  ]);
  return addressOf(LAUNCH, 'tokenAddressBySymbol(string)(address)', finalSymbol);
}

function ensureLiquidity(child: `0x${string}`): void {
  const pair = addressOf(FACTORY, 'getPair(address,address)(address)', child, TOKEN);
  if (pair === '0x0000000000000000000000000000000000000000') {
    throw new Error('Launch did not create the child/genesis pair');
  }
  const reserves = castCall(pair, 'getReserves()(uint112,uint112,uint32)');
  const first = parseUint(reserves);
  if (first !== 0n) return;

  const amount = 1_000n * 10n ** 18n;
  castSend(child, 'approve(address,uint256)', [ROUTER, amount.toString()]);
  castSend(TOKEN, 'approve(address,uint256)', [ROUTER, amount.toString()]);
  castSend(
    ROUTER,
    'addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)',
    [child, TOKEN, amount.toString(), amount.toString(), '0', '0', FIXTURE_OWNER, deadline()],
  );
}

function ensureFixtures(): void {
  if (
    addressOf(MEMBER_NFT, 'ownerOf(uint256)(address)', '1').toLowerCase() !==
    FIXTURE_OWNER.toLowerCase()
  ) {
    throw new Error('fixture owner does not own member #1');
  }

  EMPTY_WITH_LIQUIDITY = ensureChildToken('EMPTY1', 'TestEMPTY1');
  EMPTY_WITHOUT_LIQUIDITY = ensureChildToken('EMPTY2', 'TestEMPTY2');
  ensureLiquidity(EMPTY_WITH_LIQUIDITY);

  emptyPoolPair = addressOf(
    FACTORY,
    'getPair(address,address)(address)',
    EMPTY_WITHOUT_LIQUIDITY,
    TOKEN,
  );
  const emptyReserves = castCall(emptyPoolPair, 'getReserves()(uint112,uint112,uint32)');
  if (parseUint(emptyReserves) !== 0n) {
    throw new Error('TestEMPTY2 pair unexpectedly has liquidity');
  }
  fixturesReady = true;
  console.log(
    `swap fixtures: ${tokenSymbolOf(EMPTY_WITH_LIQUIDITY)}=${EMPTY_WITH_LIQUIDITY} ` +
      `${tokenSymbolOf(EMPTY_WITHOUT_LIQUIDITY)}=${EMPTY_WITHOUT_LIQUIDITY} ` +
      `emptyPair=${emptyPoolPair}`,
  );
}

function displayAmount(value: bigint, decimals = 18, digits = 6): string {
  const raw = formatUnits(value, decimals);
  const [whole = '0', fraction = ''] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const trimmed = fraction.slice(0, digits).replace(/0+$/, '');
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
  const menu = page.getByRole('button', { name: '打开钱包与身份 NFT 菜单' });
  if (await menu.isVisible().catch(() => false)) return;
  const button = page.getByRole('button', { name: '连接钱包' }).first();
  await expect(button).toBeEnabled({ timeout: 5_000 });
  await button.click();
  await expect(menu).toBeVisible({ timeout: 15_000 });
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS, name), animations: 'disabled' });
}

async function waitForQuote(page: Page, symbol: string): Promise<string> {
  const amount = page.getByTestId('swap-to-amount');
  await expect(amount).toContainText(symbol, { timeout: 30_000 });
  await expect(amount).not.toHaveText(`— ${symbol}`);
  return (await amount.innerText()).trim();
}

interface SwapLedger {
  readonly amountIn: bigint;
  readonly amountOut: bigint;
}

async function ledgerFromReceipt(
  hash: `0x${string}`,
  pairAddress: `0x${string}`,
  inputToken: `0x${string}`,
): Promise<SwapLedger> {
  const receipt = await publicClient.getTransactionReceipt({ hash });
  const events = parseEventLogs({
    abi: [pairSwapEvent],
    logs: receipt.logs,
    eventName: 'Swap',
  });
  const event = events.find(
    (candidate) => candidate.address.toLowerCase() === pairAddress.toLowerCase(),
  );
  if (event === undefined) throw new Error('Swap event not found in receipt');
  const token0 = addressOf(pairAddress, 'token0()(address)');
  const args = event.args;
  return inputToken.toLowerCase() === token0.toLowerCase()
    ? { amountIn: args.amount0In, amountOut: args.amount1Out }
    : { amountIn: args.amount1In, amountOut: args.amount0Out };
}

test.beforeAll(() => {
  ensureFixtures();
});

test('swap: ETH → TestLOVE20 shows path/min-out and a receipt from the pair Swap event', async ({
  page,
}) => {
  const pairToken0 = addressOf(GENESIS_PAIR, 'token0()(address)');
  const tokenIsToken0 = pairToken0.toLowerCase() === TOKEN.toLowerCase();
  const before = uintOf(TOKEN, 'balanceOf(address)(uint256)', BUYER);

  await installWallet(page, BUYER);
  await page.goto('/swap?symbol=TestLOVE20&from=ETH&to=TestLOVE20');
  await connect(page);

  await expect(page.getByTestId('swap-from-token')).toContainText(NATIVE, { timeout: 20_000 });
  await expect(page.getByTestId('swap-to-token')).toContainText('TestLOVE20');
  await expect(page.getByTestId('swap-path')).toContainText(`${NATIVE} → TestLOVE20`);
  await expect(page.getByTestId('swap-fee')).toContainText('以链上费率为准');
  await expect(page.getByRole('button', { name: '0.5%' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('swap-from-amount').fill('0.01');
  const quotedText = await waitForQuote(page, 'TestLOVE20');
  await expect(page.getByTestId('swap-min-out')).toContainText('TestLOVE20');
  const minOutText = (await page.getByTestId('swap-min-out').innerText()).trim();

  await shot(page, 'swap-form.png');

  await page.getByTestId('swap-submit').click();
  await expect(page.getByRole('heading', { name: '兑换完成' })).toBeVisible({ timeout: 30_000 });

  const actualText = (await page.getByTestId('swap-receipt-amount').innerText()).trim();
  const hash = (await page.getByTestId('swap-receipt-hash').innerText()).trim() as `0x${string}`;
  expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);
  await expect(page.getByTestId('swap-receipt-path')).toContainText(`${NATIVE} → TestLOVE20`);
  await expect(page.getByTestId('swap-receipt-min-check')).not.toContainText(
    '实际到账不低于最少到账',
  );

  const ledger = await ledgerFromReceipt(hash, GENESIS_PAIR, WETH);
  expect(actualText).toBe(`${displayAmount(ledger.amountOut)} TestLOVE20`);
  expect(ledger.amountIn).toBe(10n ** 16n);
  // The quote is an estimate; the receipt must show the actual Swap amount.
  expect(quotedText).toContain('TestLOVE20');

  await expect
    .poll(() => uintOf(TOKEN, 'balanceOf(address)(uint256)', BUYER), { timeout: 15_000 })
    .toBe(before + ledger.amountOut);

  await shot(page, 'swap-receipt.png');

  // 留在此页 is the only receipt button (owner 2026-11-14): the receipt
  // collapses into a success strip and the route stays /swap.
  await page.getByRole('button', { name: '留在此页' }).click();
  await expect(page).toHaveURL(/\/swap/);
  const strip = page.getByTestId('swap-success-strip');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText(actualText);

  // §4.3 / owner 2026-11-14: the receipt is a one-time page state. Revisiting
  // (reload included) must not replay it — the form comes back instead.
  await page.reload();
  await expect(page.getByRole('heading', { name: '兑换完成' })).toHaveCount(0);
  await expect(page.getByTestId('swap-from-amount')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('swap-success-strip')).toHaveCount(0);

  console.log(
    `swap ETH→token: tx=${hash} quote=${quotedText} minOut=${minOutText} actual=${actualText} ` +
      `balanceBefore=${before} balanceAfter=${before + ledger.amountOut} token0Is=${tokenIsToken0 ? 'TOKEN' : 'WETH'}`,
  );
});

test('swap: TestLOVE20 → ETH requires the exact approve, then settles native out', async ({
  page,
}) => {
  // Make the approve step reproducible on a reused chain.
  castSend(TOKEN, 'approve(address,uint256)', [ROUTER, '0'], SELLER);
  const before = uintOf(TOKEN, 'balanceOf(address)(uint256)', SELLER);
  const amountIn = 100n * 10n ** 18n;

  await installWallet(page, SELLER);
  await page.goto('/swap?symbol=TestLOVE20&from=TestLOVE20&to=ETH');
  await connect(page);

  await expect(page.getByTestId('swap-from-token')).toContainText('TestLOVE20', {
    timeout: 20_000,
  });
  await page.getByTestId('swap-from-amount').fill('100');
  const quotedText = await waitForQuote(page, NATIVE);

  // The 授权 step sits inside the swap card, before 兑换 (owner 2026-11-14),
  // and uses the global label `授权 {symbol}`.
  const approve = page.getByTestId('swap-approve');
  await expect(approve).toBeVisible({ timeout: 20_000 });
  await expect(approve).toContainText('授权 TestLOVE20');
  await approve.click();
  await expect(page.getByText('已授权', { exact: true })).toBeVisible({ timeout: 30_000 });
  // §4.1/§3.5: the approval is exactly amountIn, never infinite and never a quote.
  expect(uintOf(TOKEN, 'allowance(address,address)(uint256)', SELLER, ROUTER)).toBe(amountIn);
  const submit = page.getByTestId('swap-submit');
  await expect(submit).toBeEnabled({ timeout: 20_000 });
  await submit.click();

  await expect(page.getByRole('heading', { name: '兑换完成' })).toBeVisible({ timeout: 30_000 });
  const actualText = (await page.getByTestId('swap-receipt-amount').innerText()).trim();
  const hash = (await page.getByTestId('swap-receipt-hash').innerText()).trim() as `0x${string}`;
  expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);

  const ledger = await ledgerFromReceipt(hash, GENESIS_PAIR, TOKEN);
  expect(ledger.amountIn).toBe(amountIn);
  expect(actualText).toBe(`${displayAmount(ledger.amountOut)} ${NATIVE}`);
  expect(quotedText).toContain(NATIVE);

  await expect
    .poll(() => uintOf(TOKEN, 'balanceOf(address)(uint256)', SELLER), { timeout: 15_000 })
    .toBe(before - amountIn);
  expect(uintOf(TOKEN, 'allowance(address,address)(uint256)', SELLER, ROUTER)).toBe(0n);

  console.log(
    `swap token→ETH: tx=${hash} quote=${quotedText} actual=${actualText} ` +
      `tokenBefore=${before} tokenAfter=${before - amountIn}`,
  );
});

test('swap: insufficient balance explains the shortfall and disables the action', async ({
  page,
}) => {
  await installWallet(page, OUTSIDER);
  await page.goto('/swap?symbol=TestLOVE20&from=ETH&to=TestLOVE20');
  await connect(page);

  await page.getByTestId('swap-from-amount').fill('1');
  await expect(page.getByTestId('swap-amount-error')).toContainText('ETH 不够，还差约 1', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('swap-submit')).toBeDisabled();
  await expect(page.getByText('需要预留一点 ETH 支付网络手续费。')).toBeVisible();
});

test('swap: deep link preselects the pair and keeps ?symbol= independent', async ({ page }) => {
  await installWallet(page, BUYER);
  await page.goto('/swap?from=ETH&to=TestLOVE20&symbol=TestLOVE20');
  await connect(page);

  await expect(page.getByTestId('swap-from-token')).toContainText(NATIVE, { timeout: 20_000 });
  await expect(page.getByTestId('swap-to-token')).toContainText('TestLOVE20');
  const url = new URL(page.url());
  expect(url.searchParams.get('from')).toBe('ETH');
  expect(url.searchParams.get('to')).toBe('TestLOVE20');
  expect(url.searchParams.get('symbol')).toBe('TestLOVE20');

  // A 2-hop route on the seeded child token: path, slippage and price impact.
  await page.goto(`/swap?from=ETH&to=TestEMPTY1&symbol=TestLOVE20`);
  await connect(page);
  await expect(page.getByTestId('swap-to-token')).toContainText('TestEMPTY1', {
    timeout: 20_000,
  });
  await page.getByTestId('swap-from-amount').fill('0.01');
  await waitForQuote(page, 'TestEMPTY1');
  await expect(page.getByTestId('swap-path')).toHaveText('ETH → TestLOVE20 → TestEMPTY1');
  await expect(page.getByTestId('swap-price-impact')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('swap-min-out')).toContainText('TestEMPTY1');
  expect(new URL(page.url()).searchParams.get('symbol')).toBe('TestLOVE20');
  await shot(page, 'swap-info.png');

  // Changing the tolerance immediately recomputes 最少到账.
  const minAtHalf = (await page.getByTestId('swap-min-out').innerText()).trim();
  await page.getByRole('button', { name: '1.0%' }).click();
  await expect(page.getByTestId('swap-min-out')).not.toHaveText(minAtHalf);
  await page.getByRole('button', { name: '0.5%' }).click();

  console.log(
    `swap 2-hop info: path=${(await page.getByTestId('swap-path').innerText()).trim()} ` +
      `impact=${(await page.getByTestId('swap-price-impact').innerText()).trim()}`,
  );
});

test('swap: unknown deep-link symbol shows a neutral pair error', async ({ page }) => {
  await installWallet(page, BUYER);
  await page.goto('/swap?from=ETH&to=NOT_A_REAL_TOKEN&symbol=TestLOVE20');
  await connect(page);

  await expect(page.getByText('这个兑换对不可用。')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('链接里的代币符号可能不存在，或者这个代币还没发射。')).toBeVisible();
  await expect(page.getByRole('button', { name: '选择代币' })).toBeVisible();
  await expect(page.getByRole('link', { name: '回首页' })).toBeVisible();
  await expect(page.getByTestId('swap-submit')).toHaveCount(0);
});

test('swap: zero-liquidity child pair shows the dedicated empty-pool state', async ({ page }) => {
  expect(fixturesReady).toBe(true);
  expect(EMPTY_WITHOUT_LIQUIDITY).toBeDefined();
  expect(emptyPoolPair).toBeDefined();
  if (EMPTY_WITHOUT_LIQUIDITY === undefined || emptyPoolPair === undefined) return;

  await installWallet(page, BUYER);
  await page.goto(`/swap?from=ETH&to=${tokenSymbolOf(EMPTY_WITHOUT_LIQUIDITY)}&symbol=TestLOVE20`);
  await connect(page);

  await expect(page.getByText('这个兑换对还没有可兑换的流动性。')).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByText('发射代币时只创建了交易对，没有注入资金，所以现在换不了。'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '换个代币' })).toBeVisible();
  await expect(page.getByRole('link', { name: '回首页' })).toBeVisible();
  await expect(page.getByTestId('swap-submit')).toHaveCount(0);

  // The advanced fold was removed: contract addresses live on /about only.
  await expect(page.getByText('技术详情')).toHaveCount(0);
  await expect(page.getByText(new RegExp(emptyPoolPair, 'i'))).toHaveCount(0);
  await shot(page, 'swap-empty-pool.png');
});

test('swap: a >10% price impact requires an explicit second confirmation', async ({ page }) => {
  await installWallet(page, BUYER);
  await page.goto('/swap?from=ETH&to=TestEMPTY1&symbol=TestLOVE20');
  await connect(page);

  await page.getByTestId('swap-from-amount').fill('0.5');
  await waitForQuote(page, 'TestEMPTY1');
  const impact = page.getByTestId('swap-price-impact');
  await expect(impact).toContainText('约', { timeout: 20_000 });
  await expect(page.getByTestId('swap-submit')).toBeDisabled();
  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.getByTestId('swap-submit')).toBeEnabled({ timeout: 10_000 });
  // Do not submit: this is a shallow fixture pool used by the other tests.
});

test('swap: native ↔ wrapped is a 1:1 wrap/unwrap with its own receipt', async ({ page }) => {
  const wethBefore = uintOf(WETH, 'balanceOf(address)(uint256)', BUYER);

  await installWallet(page, BUYER);
  await page.goto('/swap?symbol=TestLOVE20&from=ETH&to=TestWETH');
  await connect(page);

  await expect(page.getByTestId('swap-from-token')).toContainText(NATIVE, { timeout: 20_000 });
  await expect(page.getByTestId('swap-to-token')).toContainText('TestWETH');
  await expect(page.getByTestId('swap-path')).toHaveText(`${NATIVE} → TestWETH`);
  await expect(page.getByTestId('swap-rate')).toContainText('包装/解包');
  await expect(page.getByTestId('swap-fee')).toContainText('无手续费');

  await page.getByTestId('swap-from-amount').fill('0.01');
  await expect(page.getByTestId('swap-to-amount')).toContainText(`0.01 TestWETH`, {
    timeout: 20_000,
  });
  await expect(page.getByTestId('swap-submit')).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId('swap-submit').click();
  await expect(page.getByRole('heading', { name: '兑换完成' })).toBeVisible({ timeout: 30_000 });
  expect((await page.getByTestId('swap-receipt-amount').innerText()).trim()).toBe('0.01 TestWETH');
  const wrapHash = (await page.getByTestId('swap-receipt-hash').innerText()).trim();
  await expect
    .poll(() => uintOf(WETH, 'balanceOf(address)(uint256)', BUYER), { timeout: 15_000 })
    .toBe(wethBefore + 10n ** 16n);

  // 留在此页 is the only receipt button (owner 2026-11-14); the form is back.
  await page.getByRole('button', { name: '留在此页' }).click();
  await page.getByRole('button', { name: '交换方向' }).click();
  await expect(page.getByTestId('swap-from-token')).toContainText('TestWETH');
  await expect(page.getByTestId('swap-to-token')).toContainText(NATIVE);
  await page.getByTestId('swap-from-amount').fill('0.01');
  await expect(page.getByTestId('swap-to-amount')).toContainText(`0.01 ${NATIVE}`, {
    timeout: 20_000,
  });
  await expect(page.getByTestId('swap-submit')).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId('swap-submit').click();
  await expect(page.getByRole('heading', { name: '兑换完成' })).toBeVisible({ timeout: 30_000 });
  expect((await page.getByTestId('swap-receipt-amount').innerText()).trim()).toBe(`0.01 ${NATIVE}`);
  const unwrapHash = (await page.getByTestId('swap-receipt-hash').innerText()).trim();
  await expect
    .poll(() => uintOf(WETH, 'balanceOf(address)(uint256)', BUYER), { timeout: 15_000 })
    .toBe(wethBefore);

  console.log(`swap wrap: tx=${wrapHash} unwrap: tx=${unwrapHash} wethBefore=${wethBefore}`);
});

test.describe('desktop selector', () => {
  test.use({ viewport: { width: 1100, height: 900 }, isMobile: false, hasTouch: false });

  test('swap: md+ opens the token picker as a popover and search resolves a symbol', async ({
    page,
  }) => {
    await installWallet(page, BUYER);
    await page.goto('/swap?from=ETH&to=TestLOVE20&symbol=TestLOVE20');
    await connect(page);

    await page.getByTestId('swap-to-token').click();
    const search = page.getByPlaceholder('搜索代币符号');
    await expect(search).toBeVisible({ timeout: 10_000 });
    await search.fill('TestEMPTY1');
    const option = page.getByTestId('swap-token-option-TestEMPTY1');
    await expect(option).toBeVisible({ timeout: 20_000 });
    await option.click();

    await expect(page.getByTestId('swap-to-token')).toContainText('TestEMPTY1', {
      timeout: 10_000,
    });
    const url = new URL(page.url());
    expect(url.searchParams.get('to')).toBe('TestEMPTY1');
    expect(url.searchParams.get('symbol')).toBe('TestLOVE20');
  });
});
