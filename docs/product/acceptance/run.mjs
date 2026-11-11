#!/usr/bin/env node
/**
 * M0 acceptance walkthrough (UX spec §6, 14 steps) against the dev build served
 * by `vite preview` on http://127.0.0.1:4400.
 *
 * This file lives under docs/product/acceptance/ on purpose: the acceptance run
 * is evidence, not product code. It reuses the same injected EIP-1193 stub the
 * e2e specs install (anvil accounts are unlocked, so no private key enters the
 * test; the one fresh wallet is funded and impersonated through anvil RPC).
 *
 * Usage:
 *   node docs/product/acceptance/run.mjs            # all 14 steps
 *   ONLY=1,2,3 node docs/product/acceptance/run.mjs # selected steps
 *
 * Writes: docs/product/acceptance/results.json, acceptance/NN-*.png, acceptance.log
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createPublicClient,
  formatUnits,
  http,
  parseAbiItem,
  parseEventLogs,
} from 'viem';

const ROOT = resolve(import.meta.dirname, '../../..');
const HERE = resolve(import.meta.dirname);
const SHOTS = resolve(ROOT, 'docs/product/screenshots');
const BASE = process.env.ACCEPTANCE_BASE_URL ?? 'http://127.0.0.1:4400';
const LOG = resolve(HERE, 'logs/acceptance-run.txt');
const RESULTS = resolve(HERE, 'results.json');
const ONLY = new Set(
  (process.env.ONLY ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value > 0),
);

const deployment = JSON.parse(
  readFileSync(resolve(ROOT, 'src/config/deployments/anvil31337_dev.json'), 'utf8'),
);
const snapshot = JSON.parse(
  readFileSync(resolve(ROOT, 'public/airdrop/anvil31337_dev.json'), 'utf8'),
);

const RPC = process.env.ACCEPTANCE_RPC_URL ?? deployment.rpcUrls[0] ?? 'http://127.0.0.1:8545';
const CHAIN_ID = deployment.chainId;
const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;
const NATIVE = deployment.nativeCurrency.symbol;
const A = deployment.addresses;
const TOKEN = A.firstTokenAddress;
const MEMBER_NFT = A.memberNFT;
const AIRDROP = A.airdrop;
const LAUNCH = A.launch;
const FACTORY = A.factory;
const ROUTER = A.router;
const WETH = A.weth;
const MINT = A.mint;
const GENESIS_PAIR = A.pair;

// anvil's deterministic accounts (mnemonic "test test ... junk").
const ANVIL = {
  deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // #0, member 1
  funded: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // #2, seed member, ~99.99M LOVE20
  swap: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', // #4, ETH + LOVE20
  eligible: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', // #5, snapshot, unclaimed
  eligible2: '0x976EA74026E726554dB657fA54763abd0C3a0aa9', // #6, snapshot, unclaimed
};
// #6/#8/#9 are the snapshot accounts the e2e airdrop spec also draws from. #5 is
// deliberately left alone for e2e/home-my-nft.spec.ts.
const ELIGIBLE_CANDIDATES = [
  ANVIL.eligible2,
  '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f', // #8
  '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720', // #9
];
// Fresh addresses (not in the snapshot, not anvil keyring). Anvil impersonates
// the funded one, exactly like the e2e fixtures impersonate Mint/Stake.
const W_ZERO = '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF'; // 0 ETH, 0 tokens, 0 NFT
const W_MINT = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf'; // funded for the mint step
const W_MINT_FUND_WEI = 5_000n * 10n ** 18n;

const MEMBER_MINTED = parseAbiItem(
  'event MemberMinted(uint256 indexed memberId, address indexed owner, uint256 cost, uint256 totalBurnedForMint, string name, string normalizedName)',
);
const AIRDROP_CLAIMED = parseAbiItem(
  'event AirdropClaimed(address indexed token, address indexed account, uint256 share, uint256 amount, uint256 remainingShare)',
);
const PAIR_SWAP = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
);

const publicClient = createPublicClient({ transport: http(RPC) });
const RUN = Math.random().toString(36).slice(2, 8);

mkdirSync(HERE, { recursive: true });
mkdirSync(resolve(HERE, 'logs'), { recursive: true });
mkdirSync(SHOTS, { recursive: true });

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------

let results = [];
if (ONLY.size > 0) {
  try {
    results = JSON.parse(readFileSync(RESULTS, 'utf8'));
  } catch {
    results = [];
  }
}
let currentStep = 0;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  appendFileSync(LOG, `${line}\n`);
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function persist() {
  writeFileSync(RESULTS, `${JSON.stringify(results, null, 2)}\n`);
}

function record(step, status, summary, evidence = [], notes = '') {
  const row = { step, status, summary, evidence, notes, at: new Date().toISOString() };
  const existing = results.findIndex((entry) => entry.step === step);
  if (existing >= 0) results[existing] = row;
  else results.push(row);
  results.sort((a, b) => a.step - b.step);
  persist();
  log(`STEP ${step} ${status} — ${summary}`);
  for (const item of evidence) log(`  evidence: ${item}`);
}

function cast(args) {
  return execFileSync('cast', [...args, '--rpc-url', RPC], { encoding: 'utf8' }).trim();
}

function castCall(address, signature, ...args) {
  return cast(['call', address, signature, ...args]);
}

function castUint(address, signature, ...args) {
  const raw = castCall(address, signature, ...args);
  const match = /^\d+/.exec(raw);
  if (match === null) throw new Error(`expected uint from ${signature}, got ${raw}`);
  return BigInt(match[0]);
}

function castBool(address, signature, ...args) {
  return castCall(address, signature, ...args).startsWith('true');
}

function castAddress(address, signature, ...args) {
  const raw = castCall(address, signature, ...args);
  const match = /0x[0-9a-fA-F]{40}/.exec(raw);
  if (match === null) throw new Error(`expected address from ${signature}, got ${raw}`);
  return match[0];
}

function castSend(address, signature, args, from, { unlocked = true } = {}) {
  const argv = ['send', address, signature, ...args, '--from', from, '--json'];
  if (unlocked) argv.push('--unlocked');
  argv.push('--rpc-url', RPC);
  const raw = execFileSync('cast', argv, { encoding: 'utf8' });
  return JSON.parse(raw);
}

function rpc(method, ...params) {
  return cast(['rpc', method, ...params.map((value) => String(value))]);
}

function tokenBalance(account) {
  return castUint(TOKEN, 'balanceOf(address)(uint256)', account);
}

function nativeBalance(account) {
  return BigInt(/^\d+/.exec(cast(['balance', account]))?.[0] ?? '0');
}

function identityCacheKey(account) {
  return `love20:v1:${CHAIN_ID}:${MEMBER_NFT.toLowerCase()}:${account.toLowerCase()}:identity`;
}

/** Mirror of src/shared/lib/format.ts formatTokenAmount (6 fraction digits, zh-CN). */
function formatTokenAmount(value, decimals = 18, maxFractionDigits = 6) {
  if (value === undefined || value === null) return '—';
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;
  const fractionText = decimals === 0 ? '' : fraction.toString().padStart(decimals, '0');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (maxFractionDigits <= 0) return `${negative ? '-' : ''}${grouped}`;
  const trimmed = fractionText.slice(0, maxFractionDigits).replace(/0+$/, '');
  return `${negative ? '-' : ''}${grouped}${trimmed.length > 0 ? `.${trimmed}` : ''}`;
}

function formatUnitsLike(value, decimals = 18) {
  return formatUnits(value, decimals);
}

// ---------------------------------------------------------------------------
// browser helpers
// ---------------------------------------------------------------------------

async function installWallet(context, account, { chainHex = CHAIN_HEX, noProvider = false } = {}) {
  if (noProvider) return;
  await context.addInitScript(
    ({ accountAddress, chainHexValue, rpcUrl }) => {
      const listeners = {};
      const rpcCall = async (method, params) => {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? [] }),
        });
        const body = await response.json();
        if (body.error !== undefined) {
          const error = new Error(body.error.message ?? 'rpc error');
          if (body.error.code !== undefined) error.code = body.error.code;
          if (body.error.data !== undefined) error.data = body.error.data;
          throw error;
        }
        return body.result;
      };

      const provider = {
        isMetaMask: true,
        isConnected: () => true,
        request: async ({ method, params }) => {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [accountAddress];
          if (method === 'eth_chainId') return chainHexValue;
          if (method === 'net_version') return String(parseInt(chainHexValue, 16));
          if (method === 'wallet_switchEthereumChain') return null;
          if (method === 'wallet_addEthereumChain') return null;
          return rpcCall(method, params);
        },
        on: (event, handler) => {
          (listeners[event] ??= []).push(handler);
          return provider;
        },
        removeListener: (event, handler) => {
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
    { accountAddress: account, chainHexValue: chainHex, rpcUrl: RPC },
  );
}

async function newPage(browser, options = {}) {
  const {
    account,
    chainHex,
    noProvider = false,
    width = 390,
    height = 844,
    mobile = true,
    seedIdentityTokenId,
  } = options;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: 'zh-CN',
    timezoneId: 'Asia/Taipei',
  });
  await installWallet(context, account, { chainHex: chainHex ?? CHAIN_HEX, noProvider });
  if (seedIdentityTokenId !== undefined && account !== undefined) {
    await context.addInitScript(
      ({ key, value }) => window.localStorage.setItem(key, value),
      {
        key: identityCacheKey(account),
        value: JSON.stringify({ tokenId: String(seedIdentityTokenId) }),
      },
    );
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => log(`  pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') log(`  console.error: ${message.text().slice(0, 300)}`);
  });
  return { context, page };
}

async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
}

async function waitVisible(locator, timeout = 30_000, label = 'element') {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
  } catch (error) {
    throw new Error(`timed out waiting for ${label}: ${error.message}`);
  }
  return locator.first();
}

async function waitText(page, text, { timeout = 30_000, exact = false } = {}) {
  return waitVisible(page.getByText(text, { exact }), timeout, `text "${text}"`);
}

async function waitEnabled(locator, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await locator.isEnabled().catch(() => false)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error('button never became enabled');
}

async function connect(page, { wrongChain = false } = {}) {
  await goto(page, '/');
  const mainButton = page.locator('main').getByRole('button', { name: '连接钱包' });
  const button = (await mainButton.count()) > 0 ? mainButton : page.getByRole('button', { name: '连接钱包' });
  await waitEnabled(button.first(), 10_000);
  await button.first().click();
  if (wrongChain) {
    await waitVisible(
      page.getByRole('button', { name: '网络不对，点此切换' }),
      20_000,
      'wrong-network button',
    );
  } else {
    await waitVisible(
      page.getByRole('button', { name: '打开钱包与身份菜单' }),
      20_000,
      'connected wallet pill',
    );
  }
}

async function shot(page, name) {
  const path = resolve(HERE, name);
  await page.screenshot({ path, animations: 'disabled' });
  return `docs/product/acceptance/${name}`;
}

async function shotMain(page, name) {
  await page.screenshot({ path: resolve(SHOTS, name), animations: 'disabled' });
  return `docs/product/screenshots/${name}`;
}

async function countSolidButtons(page) {
  return page.evaluate(() => {
    const solid = new Set(['rgb(37, 99, 235)', 'rgb(29, 78, 216)', 'rgb(220, 38, 38)']);
    const nodes = Array.from(document.querySelectorAll('button, a'));
    return nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      const style = window.getComputedStyle(node);
      return style.visibility !== 'hidden' && solid.has(style.backgroundColor);
    }).length;
  });
}

async function txReceipt(hash) {
  const receipt = await publicClient.getTransactionReceipt({ hash });
  check(receipt.status === 'success', `transaction ${hash} status ${receipt.status}`);
  return receipt;
}

async function waitReceipt(page, testId, timeout = 180_000) {
  const locator = page.getByTestId(testId);
  await waitVisible(locator, timeout, `receipt ${testId}`);
  return (await locator.innerText()).trim();
}

async function localIdentity(page, account) {
  return page.evaluate((key) => window.localStorage.getItem(key), identityCacheKey(account));
}

function pickEligibleAccount() {
  for (const account of ELIGIBLE_CANDIDATES) {
    if (!castBool(AIRDROP, 'isClaimed(address,address)(bool)', TOKEN, account)) return account;
  }
  throw new Error('no unclaimed snapshot account left among #6/#8/#9');
}

function snapshotEntry(account) {
  return snapshot.entries.find(
    (entry) => entry.account.toLowerCase() === account.toLowerCase(),
  );
}

// ---------------------------------------------------------------------------
// chain setup (test fixtures, never product code)
// ---------------------------------------------------------------------------

function ensureMintWallet() {
  const balance = tokenBalance(W_MINT);
  if (balance < W_MINT_FUND_WEI) {
    const topUp = W_MINT_FUND_WEI - balance;
    castSend(
      TOKEN,
      'transfer(address,uint256)',
      [W_MINT, topUp.toString()],
      ANVIL.funded,
    );
    log(`funded ${W_MINT} with ${formatUnitsLike(topUp)} TestLOVE20 from #2`);
  }
  if (nativeBalance(W_MINT) < 10n ** 18n) {
    rpc('anvil_setBalance', W_MINT, '0x8ac7230489e80000');
  }
  rpc('anvil_impersonateAccount', W_MINT);
  log(
    `mint wallet ${W_MINT}: ${formatUnitsLike(tokenBalance(W_MINT))} TestLOVE20, ` +
      `${formatUnitsLike(nativeBalance(W_MINT))} ${NATIVE}, NFT=${castUint(MEMBER_NFT, 'balanceOf(address)(uint256)', W_MINT)}`,
  );
}

function impersonateMint() {
  rpc('anvil_impersonateAccount', MINT);
  rpc('anvil_setBalance', MINT, '0xde0b6b3a7640000');
}

/** Same fixture the swap e2e builds: a launched child token whose pair exists but is empty. */
function ensureEmptyPoolToken() {
  const finalSymbol = 'TestEMPTY2';
  const existing = castAddress(LAUNCH, 'tokenAddressBySymbol(string)(address)', finalSymbol);
  if (existing !== '0x0000000000000000000000000000000000000000') {
    log(`empty-pool token already exists: ${finalSymbol}=${existing}`);
    return existing;
  }
  impersonateMint();
  castSend(LAUNCH, 'addLaunchCount(address,uint256,uint256)', [TOKEN, '1', '1'], MINT);
  castSend(
    LAUNCH,
    'launchToken(string,address,uint256,address,uint8,bytes[])',
    ['EMPTY2', TOKEN, '1', ANVIL.deployer, '0', '[]'],
    ANVIL.deployer,
  );
  const token = castAddress(LAUNCH, 'tokenAddressBySymbol(string)(address)', finalSymbol);
  const pair = castAddress(FACTORY, 'getPair(address,address)(address)', token, TOKEN);
  const reserves = castCall(pair, 'getReserves()(uint112,uint112,uint32)');
  log(`empty-pool fixture: ${finalSymbol}=${token} pair=${pair} reserves=${reserves}`);
  check(/^0+/.test(reserves.split(/\s/)[0]), 'empty-pool fixture pair unexpectedly has reserves');
  return token;
}

/** TestEMPTY1 with liquidity, only used to reproduce the 2-hop swap-info screenshot. */
function ensureLiquidityToken() {
  const finalSymbol = 'TestEMPTY1';
  let token = castAddress(LAUNCH, 'tokenAddressBySymbol(string)(address)', finalSymbol);
  if (token === '0x0000000000000000000000000000000000000000') {
    impersonateMint();
    castSend(LAUNCH, 'addLaunchCount(address,uint256,uint256)', [TOKEN, '1', '1'], MINT);
    castSend(
      LAUNCH,
      'launchToken(string,address,uint256,address,uint8,bytes[])',
      ['EMPTY1', TOKEN, '1', ANVIL.deployer, '0', '[]'],
      ANVIL.deployer,
    );
    token = castAddress(LAUNCH, 'tokenAddressBySymbol(string)(address)', finalSymbol);
  }
  const pair = castAddress(FACTORY, 'getPair(address,address)(address)', token, TOKEN);
  const first = castUint(pair, 'getReserves()(uint112,uint112,uint32)');
  if (first === 0n) {
    const amount = 1_000n * 10n ** 18n;
    const deadline = String(Math.floor(Date.now() / 1000) + 1200);
    castSend(token, 'approve(address,uint256)', [ROUTER, amount.toString()], ANVIL.deployer);
    castSend(TOKEN, 'approve(address,uint256)', [ROUTER, amount.toString()], ANVIL.deployer);
    castSend(
      ROUTER,
      'addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)',
      [token, TOKEN, amount.toString(), amount.toString(), '0', '0', ANVIL.deployer, deadline],
      ANVIL.deployer,
    );
  }
  log(`liquidity fixture: ${finalSymbol}=${token} pair=${pair}`);
  return token;
}

// ---------------------------------------------------------------------------
// steps
// ---------------------------------------------------------------------------

async function step1(browser) {
  const { context, page } = await newPage(browser, { account: W_ZERO });
  try {
    await goto(page, '/');
    await waitVisible(page.getByRole('heading', { name: '先连接钱包' }), 20_000, 'home identity card');
    await waitText(page, '一个钱包可以拥有多个身份，身份才是参与凭证。', { timeout: 10_000 });
    const solid = await countSolidButtons(page);
    const connectButtons = await page.getByRole('button', { name: '连接钱包' }).count();
    const screenshot = await shot(page, '01-home-disconnected.png');
    check(
      solid === 1,
      `expected exactly one solid button on home, found ${solid} (connect buttons: ${connectButtons})`,
    );
    const balanceText = (await page.locator('section[aria-label$="余额"]').innerText()).trim();
    const evidence = [
      screenshot,
      'identity card: 「先连接钱包」 + 「一个钱包可以拥有多个身份，身份才是参与凭证。」',
      `solid brand-coloured controls: ${solid}`,
      `connect-labelled buttons: ${connectButtons} (header pill is secondary, card CTA is primary)`,
      `balance section (disconnected): ${balanceText.replaceAll('\n', ' | ')}`,
    ];
    return {
      status: 'PASS',
      summary: `未连接首页显示「先连接钱包」，整屏仅 ${solid} 个实心按钮`,
      evidence,
    };
  } finally {
    await context.close();
  }
}

async function step2(browser) {
  const { context, page } = await newPage(browser, { account: W_ZERO });
  try {
    await connect(page);
    await waitVisible(page.getByRole('heading', { name: '你还没有身份' }), 30_000, 'empty identity');
    const goMyNft = page.getByRole('link', { name: '去我的 NFT' });
    await waitVisible(goMyNft, 10_000, '去我的 NFT');
    const mintCta = await page
      .getByRole('link', { name: '铸造身份' })
      .or(page.getByRole('button', { name: '铸造身份' }))
      .count();
    const eligibilityCard = await page
      .locator('section[aria-labelledby="airdrop-eligibility-title"]')
      .count();
    const zeroAsset = {
      native: nativeBalance(W_ZERO),
      token: tokenBalance(W_ZERO),
      nft: castUint(MEMBER_NFT, 'balanceOf(address)(uint256)', W_ZERO),
    };
    check(zeroAsset.native === 0n && zeroAsset.token === 0n && zeroAsset.nft === 0n, 'wallet is not zero-asset');
    check(mintCta === 0, `home exposes a mint CTA (${mintCta})`);
    check(eligibilityCard === 0, 'home shows an airdrop eligibility card for an ineligible wallet');
    const screenshot = await shot(page, '02-home-connected-no-identity.png');
    const pill = (await page.getByRole('button', { name: '打开钱包与身份菜单' }).innerText())
      .trim()
      .replaceAll('\n', ' | ');
    return {
      status: 'PASS',
      summary: '已连接、无身份：显示「你还没有身份」+「去我的 NFT」，首页无铸造 CTA、无资格卡',
      evidence: [
        screenshot,
        'identity card: 「你还没有身份」+「去我的 NFT」',
        `home mint CTA count: ${mintCta}`,
        `eligibility card count: ${eligibilityCard} (wallet is not in the snapshot)`,
        `header pill: ${pill}`,
        `on-chain wallet assets: ${zeroAsset.native} wei ${NATIVE}, ${zeroAsset.token} TestLOVE20, ${zeroAsset.nft} NFT`,
      ],
    };
  } finally {
    await context.close();
  }
}

async function step3(browser) {
  const { context, page } = await newPage(browser, { account: W_ZERO });
  try {
    await connect(page);
    await page.getByRole('link', { name: '去我的 NFT' }).first().click();
    await waitVisible(page.getByRole('heading', { name: '我的 NFT' }), 20_000, 'my-nft title');
    await waitText(page, '你还没有身份。', { timeout: 20_000 });
    await waitText(page, '铸造需要一个名字和少量 LOVE20。', { timeout: 10_000 });
    const emptyScreenshot = await shot(page, '03-my-nft-empty.png');
    const mintLink = page.getByRole('link', { name: '铸造身份' });
    await waitVisible(mintLink, 10_000, 'mint link');
    await mintLink.click();
    await page.waitForURL('**/mint**', { timeout: 15_000 });
    await waitVisible(page.getByRole('heading', { name: '铸造身份' }), 20_000, 'mint title');
    const mintScreenshot = await shot(page, '03-mint-from-empty.png');
    return {
      status: 'PASS',
      summary: '空态引导到铸造页：「你还没有身份。」+「铸造身份」→ /mint',
      evidence: [
        emptyScreenshot,
        mintScreenshot,
        `empty state copy: 「你还没有身份。」+「铸造需要一个名字和少量 LOVE20。」+ CTA「铸造身份」`,
        `navigation target: ${new URL(page.url()).pathname}${new URL(page.url()).search}`,
      ],
    };
  } finally {
    await context.close();
  }
}

async function step4(browser) {
  const { context, page } = await newPage(browser, { account: W_ZERO });
  try {
    await connect(page);
    await goto(page, '/mint');
    const input = page.locator('#mint-name');
    await waitVisible(input, 30_000, 'mint name input');
    await waitText(page, '名称必须以 Test 开头', { timeout: 20_000 });
    await waitText(page, '中文 3 字节、英文与数字 1 字节；名字越短，价格越高', { timeout: 10_000 });

    const badName = `nottest-${RUN}`;
    await input.fill(badName);
    await waitVisible(
      page.locator('#mint-name-check', { hasText: '✗ 名称必须以 Test 开头' }),
      20_000,
      'prefix error',
    );
    await waitText(page, '为了让测试身份和真实身份一眼能分开。', { timeout: 10_000 });
    const blockedButtons = await page.getByRole('button', { name: '铸造身份' }).count();
    const allDisabled = await page
      .getByRole('button', { name: '铸造身份' })
      .evaluateAll((nodes) => nodes.every((node) => node.disabled));
    const blockedShot = await shot(page, '04-mint-name-blocked.png');

    const goodName = `Testacc-${RUN}`;
    await input.fill(goodName);
    await waitVisible(
      page.locator('#mint-name-check', { hasText: '✓ 可以用' }),
      30_000,
      'name available',
    );
    const prefixErrors = await page.getByText('✗ 名称必须以 Test 开头').count();
    const validShot = await shot(page, '04-mint-name-valid.png');
    check(blockedButtons > 0, 'no mint button rendered while the name was blocked');
    check(allDisabled, 'mint button was clickable with a non-Test name');
    check(prefixErrors === 0, 'prefix error still visible after a valid Test name');
    return {
      status: 'PASS',
      summary: 'dev 变体规则可见；非 Test 名字被阻断，Test 名字通过校验',
      evidence: [
        blockedShot,
        validShot,
        `rule copy visible: 「名称必须以 Test 开头」+「中文 3 字节、英文与数字 1 字节；名字越短，价格越高」`,
        `name「${badName}」→ 「✗ 名称必须以 Test 开头」+「为了让测试身份和真实身份一眼能分开。」，铸造按钮 ${blockedButtons} 个且全部 disabled`,
        `name「${goodName}」→ 「✓ 可以用」，prefix 错误计数 ${prefixErrors}`,
      ],
    };
  } finally {
    await context.close();
  }
}

async function step5(browser) {
  const evidence = [];
  let both = true;

  // 5a — ineligible, zero balance: the branch must point at swap.
  {
    const { context, page } = await newPage(browser, { account: W_ZERO });
    try {
      await connect(page);
      await goto(page, '/mint');
      const input = page.locator('#mint-name');
      await waitVisible(input, 30_000, 'mint name input');
      await input.fill(`Testacc-${RUN}`);
      await waitVisible(
        page.locator('#mint-name-check', { hasText: '✓ 可以用' }),
        30_000,
        'name available',
      );
      await waitText(page, 'TestLOVE20 不够。可以用 ETH 换一些，再回来铸造。', { timeout: 40_000 });
      const swapCta = page.getByRole('link', { name: '用 ETH 兑换' });
      await waitVisible(swapCta, 10_000, 'swap branch CTA');
      const screenshot = await shot(page, '05-mint-branch-swap.png');
      const href = await swapCta.getAttribute('href');
      await swapCta.click();
      await page.waitForURL('**/swap**', { timeout: 15_000 });
      await page.waitForFunction(
        () => new URL(window.location.href).searchParams.get('to') !== null,
        null,
        { timeout: 30_000 },
      );
      const url = new URL(page.url());
      check(url.pathname === '/swap', `branch landed on ${url.pathname}`);
      check(url.searchParams.get('from') === NATIVE, `from=${url.searchParams.get('from')}`);
      check(
        url.searchParams.get('to') === 'TestLOVE20',
        `to=${url.searchParams.get('to')}`,
      );
      await waitVisible(
        page.getByRole('button', { name: '选择从代币' }),
        20_000,
        'from selector',
      );
      evidence.push(
        screenshot,
        `ineligible wallet #0x2B5A…: branch copy + CTA「用 ETH 兑换」，href=${href}`,
        `landed URL: ${url.pathname}${url.search}`,
        'the swap page wrote the effective pair back into the URL (from=ETH&to=TestLOVE20)',
      );
    } finally {
      await context.close();
    }
  }

  // 5b — snapshot-eligible wallet: the branch must point at the airdrop page.
  {
    const eligible = pickEligibleAccount();
    const { context, page } = await newPage(browser, { account: eligible });
    try {
      await connect(page);
      await goto(page, '/mint');
      const input = page.locator('#mint-name');
      await waitVisible(input, 30_000, 'mint name input');
      await input.fill(`Testacc-${RUN}`);
      await waitVisible(
        page.locator('#mint-name-check', { hasText: '✓ 可以用' }),
        30_000,
        'name available',
      );
      await waitText(page, '你还有空投份额可以铸造', { timeout: 60_000 });
      const airdropCta = page.getByRole('link', { name: '铸造空投份额' });
      await waitVisible(airdropCta, 20_000, 'airdrop branch CTA');
      const href = await airdropCta.getAttribute('href');
      const screenshot = await shot(page, '05-mint-branch-airdrop.png');
      check(
        href?.includes('/airdrop') && href.includes('symbol=TestLOVE20'),
        `unexpected airdrop branch href ${href}`,
      );
      const branchText = (await page.locator('main').innerText()).replaceAll('\n', ' | ');
      evidence.push(
        screenshot,
        `eligible wallet ${eligible}: branch copy contains 你还有空投份额可以铸造，CTA「铸造空投份额」，href=${href}`,
        `branch context: ${branchText.slice(0, 260)}`,
      );
    } finally {
      await context.close();
    }
  }

  if (!both) throw new Error('one branch did not render');
  return {
    status: 'PASS',
    summary: '余额不足分流正确：无资格→兑换、有资格→铸造空投份额',
    evidence,
  };
}

function latestMemberOf(account) {
  const balance = castUint(MEMBER_NFT, 'balanceOf(address)(uint256)', account);
  if (balance === 0n) return null;
  // Enumerable order is not guaranteed to be tokenId order; pick the largest.
  let tokenId = 0n;
  for (let index = 0n; index < balance; index += 1n) {
    const candidate = castUint(
      MEMBER_NFT,
      'tokenOfOwnerByIndex(address,uint256)(uint256)',
      account,
      index.toString(),
    );
    if (candidate > tokenId) tokenId = candidate;
  }
  const name = castCall(MEMBER_NFT, 'memberName(uint256)(string)', tokenId.toString()).replaceAll(
    '"',
    '',
  );
  return { tokenId, name };
}

async function step6(browser) {
  const { context, page } = await newPage(browser, { account: W_MINT });
  try {
    await connect(page);
    await goto(page, '/mint');
    const input = page.locator('#mint-name');
    await waitVisible(input, 30_000, 'mint name input');
    const name = `Testaccept-${RUN}`;
    await input.fill(name);
    await waitVisible(
      page.locator('#mint-name-check', { hasText: '✓ 可以用' }),
      30_000,
      'name available',
    );
    await waitText(page, '预计', { timeout: 30_000 });
    const formText = (await page.locator('main').innerText()).replaceAll('\n', ' | ');

    const approve = page.getByRole('button', { name: '1. 授权' });
    if ((await approve.count()) > 0 && (await approve.isEnabled().catch(() => false))) {
      log('  mint: clicking 1. 授权');
      await approve.click();
      await waitVisible(
        page.getByRole('button', { name: '铸造身份' }),
        120_000,
        'mint button after approval',
      );
    }
    const mintButton = page.getByRole('button', { name: '铸造身份' });
    await waitEnabled(mintButton.first(), 120_000);
    log('  mint: clicking 铸造身份');
    await mintButton.first().click();
    const idText = await waitReceipt(page, 'mint-receipt-member-id');
    const receiptName = (await page.getByTestId('mint-receipt-name').innerText()).trim();
    const burned = (await page.getByTestId('mint-receipt-burned').innerText()).trim();
    const hash = (await page.getByTestId('mint-receipt-hash').innerText()).trim();
    const linkHref = await page
      .getByRole('link', { name: '去我的 NFT 使用这个身份' })
      .getAttribute('href');
    const screenshot = await shot(page, '06-mint-receipt.png');
    check(/^0x[0-9a-fA-F]{64}$/.test(hash), `receipt hash looks wrong: ${hash}`);
    const memberId = /^#(\d+)/.exec(idText)?.[1] ?? /(\d+)/.exec(idText)?.[1];
    check(memberId !== undefined, `could not parse member id from "${idText}"`);
    const owner = castAddress(MEMBER_NFT, 'ownerOf(uint256)(address)', memberId);
    const onChainName = castCall(MEMBER_NFT, 'memberName(uint256)(string)', memberId).replaceAll(
      '"',
      '',
    );
    const cacheValue = await localIdentity(page, W_MINT);
    const receipt = await txReceipt(hash);
    const minted = parseEventLogs({ abi: [MEMBER_MINTED], logs: receipt.logs, eventName: 'MemberMinted' });
    check(minted.length === 1, `expected one MemberMinted event, got ${minted.length}`);
    check(minted[0].args.memberId?.toString() === memberId, 'event memberId != receipt memberId');
    check(cacheValue === null, `identity was auto-selected: ${cacheValue}`);
    check(owner.toLowerCase() === W_MINT.toLowerCase(), `ownerOf(${memberId}) = ${owner}`);
    check(onChainName === name, `memberName(${memberId}) = ${onChainName}`);
    return {
      status: 'PASS',
      summary: `铸造成功收据含 #${memberId} 与真实哈希；身份没有被自动选中`,
      evidence: [
        screenshot,
        `receipt: ${idText} / 名称 ${receiptName} / 已销毁 ${burned} / hash ${hash}`,
        `MemberMinted.memberId=${minted[0].args.memberId}, cost=${minted[0].args.cost}, name=${minted[0].args.name}`,
        `on-chain ownerOf(${memberId})=${owner}, memberName=${onChainName}`,
        `identity cache key for ${W_MINT}: ${cacheValue ?? 'null'} (not auto-selected)`,
        `next-step link href=${linkHref}`,
        `form before mint: ${formText.slice(0, 260)}`,
      ],
    };
  } finally {
    await context.close();
  }
}

async function step7(browser) {
  const member = latestMemberOf(W_MINT);
  check(member !== null, 'mint wallet holds no identity; run step 6 first');
  const { context, page } = await newPage(browser, { account: W_MINT });
  try {
    await connect(page);
    await goto(page, '/my-nft');
    await waitVisible(page.getByRole('heading', { name: '我的 NFT' }), 20_000, 'my-nft title');
    const card = page.locator('main li').filter({ hasText: member.name }).first();
    await waitVisible(card, 40_000, 'identity card for the newest member');
    const useButton = card.getByRole('button', { name: '使用此身份' });
    await waitEnabled(useButton, 20_000);
    await useButton.click();
    const currentCard = page.locator('main li').filter({ hasText: member.name }).first();
    await waitVisible(
      currentCard.getByRole('button', { name: '当前身份' }),
      10_000,
      'current badge button in the selected card',
    );
    await waitVisible(
      currentCard.getByText('当前', { exact: true }),
      10_000,
      'current pill',
    );
    const cacheAfter = await localIdentity(page, W_MINT);
    const selectedScreenshot = await shot(page, '07-my-nft-selected.png');
    check(
      cacheAfter !== null && JSON.parse(cacheAfter).tokenId === member.tokenId.toString(),
      `identity cache not written: ${cacheAfter}`,
    );

    await goto(page, '/');
    await waitText(page, `你好，${member.name}`, { timeout: 30_000 });
    await waitText(page, `身份 #${member.tokenId}`, { timeout: 10_000 });
    const homeScreenshot = await shot(page, '07-home-greeting.png');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitText(page, `你好，${member.name}`, { timeout: 30_000 });
    const cacheAfterReload = await localIdentity(page, W_MINT);
    check(cacheAfterReload === cacheAfter, 'identity selection did not survive reload');
    return {
      status: 'PASS',
      summary: `选择身份后首页问候「你好，${member.name}」+ #${member.tokenId}，刷新保持`,
      evidence: [
        selectedScreenshot,
        homeScreenshot,
        `selected tokenId=${member.tokenId}, name=${member.name}`,
        `cache after click: ${cacheAfter}`,
        `cache after reload: ${cacheAfterReload}`,
        `home heading: 你好，${member.name} / 身份 #${member.tokenId}`,
      ],
    };
  } finally {
    await context.close();
  }
}

async function step8(browser) {
  const eligible = pickEligibleAccount();
  const entry = snapshotEntry(eligible);
  check(entry !== undefined, 'eligible wallet is not in the snapshot');
  const { context, page } = await newPage(browser, { account: eligible });
  try {
    await connect(page);
    await goto(page, '/');
    const card = page.locator('section[aria-labelledby="airdrop-eligibility-title"]');
    await waitVisible(card, 60_000, 'home eligibility card');
    await waitText(page, '你参与了销毁活动，获得空投铸造资格', { timeout: 20_000 });
    const cardText = (await card.innerText()).replaceAll('\n', ' | ');
    const homeShot = await shot(page, '08-home-airdrop-eligible.png');
    await card.getByRole('link', { name: '铸造空投份额' }).click();
    await page.waitForURL('**/airdrop**', { timeout: 15_000 });
    const amountLocator = page.getByTestId('airdrop-expected-amount');
    await waitVisible(amountLocator, 60_000, 'expected amount');
    const expectedText = (await amountLocator.innerText()).trim().replaceAll('\n', ' ');
    await waitText(page, '按铸造时的池子余额与剩余份额计算，别人铸造后金额会变。', {
      timeout: 10_000,
    });
    const bodyText = await page.locator('main').innerText();
    const claimWordCount = (bodyText.match(/领取/g) ?? []).length;
    const claimableBefore = castUint(
      AIRDROP,
      'claimableAmount(address,address,uint256,bytes32[])(uint256)',
      TOKEN,
      eligible,
      entry.share,
      `[${entry.proof.join(',')}]`,
    );
    const eligibleShot = await shot(page, '08-airdrop-eligible.png');

    const claimButton = page.getByRole('button', { name: '铸造空投份额' });
    await waitEnabled(claimButton.first(), 60_000);
    await claimButton.first().click();
    const receiptAmount = await waitReceipt(page, 'airdrop-receipt-amount');
    const hash = (await page.getByTestId('airdrop-receipt-hash').innerText()).trim();
    const receiptShot = await shot(page, '08-airdrop-receipt.png');
    const receipt = await txReceipt(hash);
    const claimedEvents = parseEventLogs({
      abi: [AIRDROP_CLAIMED],
      logs: receipt.logs,
      eventName: 'AirdropClaimed',
    });
    check(claimedEvents.length === 1, `expected one AirdropClaimed event, got ${claimedEvents.length}`);
    const claimedAmount = claimedEvents[0].args.amount;
    check(claimedAmount !== undefined, 'AirdropClaimed.amount missing');
    const expectedReceipt = `${formatTokenAmount(claimedAmount)} TestLOVE20`;
    const isClaimed = castBool(AIRDROP, 'isClaimed(address,address)(bool)', TOKEN, eligible);
    check(
      receiptAmount === expectedReceipt,
      `receipt amount "${receiptAmount}" != event amount "${expectedReceipt}"`,
    );
    check(isClaimed, 'isClaimed() is still false after the claim');
    check(claimableBefore.toString() === claimedAmount.toString(), 'claimableAmount != event amount');
    check(claimWordCount === 0, `page copy still contains 领取 (${claimWordCount})`);
    const tokenBalanceAfter = tokenBalance(eligible);
    check(tokenBalanceAfter >= claimedAmount, 'claimed tokens are not in the wallet');
    return {
      status: 'PASS',
      summary: `空投资格卡→预计金额→铸造成功；回执金额与 AirdropClaimed 一致，isClaimed=true`,
      evidence: [
        homeShot,
        eligibleShot,
        receiptShot,
        `home card: ${cardText}`,
        `airdrop page expected amount: ${expectedText}`,
        `amount label carries 预计 + note「按铸造时的池子余额与剩余份额计算，别人铸造后金额会变。」`,
        `claimableAmount before claim: ${claimableBefore}`,
        `AirdropClaimed.amount: ${claimedAmount}; receipt text: ${receiptAmount}; hash: ${hash}`,
        `isClaimed(${eligible}): ${isClaimed}; wallet TestLOVE20 after: ${tokenBalanceAfter}`,
        `「领取」 occurrences on the airdrop page: ${claimWordCount}`,
      ],
    };
  } finally {
    await context.close();
  }
}

async function step9(browser) {
  const { context, page } = await newPage(browser, { account: ANVIL.swap });
  try {
    const balanceBefore = tokenBalance(ANVIL.swap);
    await connect(page);
    await goto(page, '/swap?symbol=TestLOVE20&from=ETH&to=TestLOVE20');
    const fromSelector = page.getByRole('button', { name: '选择从代币' });
    const toSelector = page.getByRole('button', { name: '选择到代币' });
    await waitVisible(fromSelector, 30_000, 'from selector');
    await waitVisible(toSelector, 30_000, 'to selector');
    const fromText = (await fromSelector.innerText()).trim();
    const toText = (await toSelector.innerText()).trim();
    check(fromText.includes(NATIVE), `from selector is "${fromText}"`);
    check(toText.includes('TestLOVE20'), `to selector is "${toText}"`);

    const amountInput = page.getByTestId('swap-from-amount');
    await amountInput.fill('0.01');
    const toAmount = page.getByTestId('swap-to-amount');
    await page.waitForFunction(
      () => {
        const node = document.querySelector('[data-testid="swap-to-amount"]');
        return node !== null && /TestLOVE20/.test(node.textContent ?? '') && !/^—/.test(node.textContent?.trim() ?? '');
      },
      null,
      { timeout: 60_000 },
    );
    const quoted = (await toAmount.innerText()).trim().replaceAll('\n', ' ');
    const infoText = (await page.locator('main').innerText()).replaceAll('\n', ' | ');
    const deepLinkShot = await shot(page, '09-swap-deep-link.png');

    const submit = page.getByTestId('swap-submit');
    await waitEnabled(submit, 60_000);
    await submit.click();
    const receiptAmountText = await waitReceipt(page, 'swap-receipt-amount');
    const receiptPath = (await page.getByTestId('swap-receipt-path').innerText()).trim();
    const receiptMin = (await page.getByTestId('swap-receipt-min').innerText()).trim();
    const hash = (await page.getByTestId('swap-receipt-hash').innerText()).trim();
    const receiptShot = await shot(page, '09-swap-receipt.png');
    const receipt = await txReceipt(hash);
    const swapEvents = parseEventLogs({ abi: [PAIR_SWAP], logs: receipt.logs, eventName: 'Swap' });
    check(swapEvents.length === 1, `expected one pair Swap event, got ${swapEvents.length}`);
    const pairEvent = swapEvents[0];
    const token0 = castAddress(GENESIS_PAIR, 'token0()(address)');
    const token1 = castAddress(GENESIS_PAIR, 'token1()(address)');
    check(
      pairEvent.address.toLowerCase() === GENESIS_PAIR.toLowerCase(),
      `Swap event came from ${pairEvent.address}`,
    );
    const inputIsToken0 = token0.toLowerCase() === WETH.toLowerCase();
    check(
      inputIsToken0 || token1.toLowerCase() === WETH.toLowerCase(),
      'pair does not contain the wrapped native',
    );
    const amountIn = inputIsToken0 ? pairEvent.args.amount0In : pairEvent.args.amount1In;
    const amountOut = inputIsToken0 ? pairEvent.args.amount1Out : pairEvent.args.amount0Out;
    const balanceAfter = tokenBalance(ANVIL.swap);
    const delta = balanceAfter - balanceBefore;
    const expectedDisplay = `${formatTokenAmount(amountOut)} TestLOVE20`;
    check(amountIn !== undefined && amountOut !== undefined, 'Swap event amounts missing');
    check(amountIn === 10n ** 16n, `Swap event amountIn ${amountIn} != 0.01 ETH`);
    check(delta === amountOut, `balance delta ${delta} != Swap.amountOut ${amountOut}`);
    check(
      receiptAmountText === expectedDisplay,
      `receipt shows "${receiptAmountText}" but Swap.amountOut formats to "${expectedDisplay}"`,
    );
    check(
      receiptPath.includes(NATIVE) && receiptPath.includes('TestLOVE20'),
      `path "${receiptPath}"`,
    );
    return {
      status: 'PASS',
      summary: `深链预选 ETH→TestLOVE20；回执到账 = Swap 事件 = 钱包余额增量（${formatUnitsLike(amountOut)}）`,
      evidence: [
        deepLinkShot,
        receiptShot,
        `deep link: /swap?symbol=TestLOVE20&from=ETH&to=TestLOVE20; from="${fromText}", to="${toText}"`,
        `quote shown: ${quoted}; info block: ${infoText.slice(0, 320)}`,
        `receipt: 到账 ${receiptAmountText} | 路径 ${receiptPath} | 最少到账 ${receiptMin} | hash ${hash}`,
        `pair Swap: amountIn=${amountIn} wei (WETH), amountOut=${amountOut} wei (TestLOVE20)`,
        `wallet TestLOVE20: before=${balanceBefore}, after=${balanceAfter}, delta=${delta}`,
        `asserted: UI == Swap.amountOut == balance delta`,
      ],
    };
  } finally {
    await context.close();
  }
}

async function step10(browser) {
  const token = ensureEmptyPoolToken();
  const { context, page } = await newPage(browser, { account: ANVIL.swap });
  try {
    await connect(page);
    await goto(page, `/swap?symbol=TestLOVE20&from=TestEMPTY2&to=TestLOVE20`);
    await waitText(page, '这个兑换对还没有可兑换的流动性。', { timeout: 60_000 });
    await waitText(page, '发射代币时只创建了交易对，没有注入资金，所以现在换不了。', {
      timeout: 10_000,
    });
    await waitText(page, '卡在', { timeout: 10_000 });
    const changeToken = page.getByRole('button', { name: '换个代币' });
    const backHome = page.getByRole('link', { name: '回首页' });
    await waitVisible(changeToken, 10_000, '换个代币');
    await waitVisible(backHome, 10_000, '回首页');
    const bodyText = await page.locator('main').innerText();
    check(!/revert|failed|失败/i.test(bodyText), 'empty-pool state exposes a revert/failure message');
    const screenshot = await shot(page, '10-swap-empty-pool.png');
    const pair = castAddress(FACTORY, 'getPair(address,address)(address)', token, TOKEN);
    const reserves = castCall(pair, 'getReserves()(uint112,uint112,uint32)');
    return {
      status: 'PASS',
      summary: '零流动性交易对显示专门说明与两条出路，没有 revert/失败文案',
      evidence: [
        screenshot,
        `fixture: TestEMPTY2=${token}, pair=${pair}, reserves=${reserves}`,
        `copy: 「这个兑换对还没有可兑换的流动性。」+「发射代币时只创建了交易对，没有注入资金，所以现在换不了。」`,
        `next steps: 「换个代币」+「回首页」; 卡在… 行可见`,
        `页面无 revert / 失败 文案`,
      ],
      notes: 'TestEMPTY2 is a harness fixture created through Launch.launchToken (same shape as e2e/swap.spec.ts), not product code.',
    };
  } finally {
    await context.close();
  }
}


async function step11(browser) {
  const evidence = [];

  // 11a — disconnected (wallet installed, not connected).
  {
    const { context, page } = await newPage(browser, { account: W_ZERO });
    try {
      await goto(page, '/swap?symbol=TestLOVE20&from=ETH&to=TestLOVE20');
      await waitText(page, '连接钱包后兑换。', { timeout: 30_000 });
      await waitText(page, '兑换需要钱包确认。连接后先读取余额与报价。', { timeout: 10_000 });
      const connectButton = page.locator('main').getByRole('button', { name: '连接钱包' });
      await waitVisible(connectButton, 10_000, 'connect CTA');
      await waitEnabled(connectButton, 10_000);
      const screenshot = await shot(page, '11-swap-disconnected.png');
      evidence.push(screenshot, 'swap 未连接：「连接钱包后兑换。」+ 可用主按钮「连接钱包」');
    } finally {
      await context.close();
    }
  }

  // 11b — connected to the wrong chain.
  {
    const { context, page } = await newPage(browser, { account: ANVIL.swap, chainHex: '0x1' });
    try {
      await connect(page, { wrongChain: true });
      await goto(page, '/swap?symbol=TestLOVE20&from=ETH&to=TestLOVE20');
      await waitText(page, '当前钱包连接的网络不对。', { timeout: 20_000 });
      await waitText(page, '切换到这个应用使用的网络后再兑换。', { timeout: 10_000 });
      const switchButton = page.getByRole('button', { name: '网络不对，点此切换' });
      const count = await switchButton.count();
      check(count > 0, 'no network-switch control on the wrong-chain state');
      await waitEnabled(switchButton.last(), 10_000);
      const screenshot = await shot(page, '11-swap-wrong-network.png');
      evidence.push(
        screenshot,
        `swap 链不对：「当前钱包连接的网络不对。」+ ${count} 个「网络不对，点此切换」按钮（header pill 与页内各一）`,
      );
    } finally {
      await context.close();
    }
  }

  // 11c — no injected wallet at all.
  {
    const { context, page } = await newPage(browser, { noProvider: true });
    try {
      await goto(page, '/');
      const connectButton = page.locator('main').getByRole('button', { name: '连接钱包' });
      await waitVisible(connectButton, 20_000, 'connect CTA');
      await waitEnabled(connectButton, 10_000);
      await connectButton.click();
      await waitText(page, '没有检测到钱包', { timeout: 10_000 });
      await waitText(page, '当前浏览器没有可用的钱包。你可以换一个入口打开本页。', { timeout: 10_000 });
      await waitText(page, '在手机钱包 App 的内置浏览器中打开本页。', { timeout: 10_000 });
      await waitVisible(
        page.getByRole('button', { name: '复制本页链接' }),
        10_000,
        'copy link fallback',
      );
      const dialogText = (await page.getByRole('dialog').innerText()).replaceAll('\n', ' | ');
      const screenshot = await shot(page, '11-home-no-wallet.png');
      evidence.push(
        screenshot,
        'home 无注入钱包：点「连接钱包」打开兜底抽屉「没有检测到钱包」+ 三条出路 +「复制本页链接」',
        `drawer text: ${dialogText.slice(0, 300)}`,
      );
    } finally {
      await context.close();
    }
  }

  return {
    status: 'PASS',
    summary: '未连接 / 链不对 / 无钱包三种状态都给出了明确下一步',
    evidence,
  };
}

async function measureDock(page, button) {
  return button.evaluate((el) => {
    let dock = el;
    while (dock !== null && getComputedStyle(dock).position !== 'fixed') dock = dock.parentElement;
    const rect = el.getBoundingClientRect();
    const nav = document.querySelector('nav[aria-label="主导航"]');
    const dockRect = dock?.getBoundingClientRect() ?? null;
    const style = dock !== null ? getComputedStyle(dock) : null;
    const hitX = dockRect !== null ? dockRect.left + dockRect.width / 2 : 0;
    const hitY = dockRect !== null ? Math.min(dockRect.top + 4, rect.top - 3) : 0;
    const hit = document.elementFromPoint(hitX, hitY);
    const bg = style?.backgroundColor ?? '';
    const alphaMatch = /rgba\([^)]*,\s*([0-9.]+)\)/.exec(bg);
    const alpha = alphaMatch === null ? 1 : Number(alphaMatch[1]);
    return {
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollY: window.scrollY,
      navTop: nav !== null ? nav.getBoundingClientRect().top : null,
      dock: dockRect === null ? null : { top: dockRect.top, bottom: dockRect.bottom, height: dockRect.height },
      dockPosition: style?.position ?? null,
      dockZIndex: style?.zIndex ?? null,
      dockBackground: bg,
      dockAlpha: alpha,
      hitInsideDock: dock !== null && hit !== null ? dock.contains(hit) : false,
      hitTag: hit?.tagName ?? null,
      hitText: (hit?.textContent ?? '').trim().slice(0, 40),
    };
  });
}

function assertDock(info, label) {
  check(info.rect.y >= 0, `${label}: CTA starts above the viewport (${info.rect.y})`);
  check(
    info.rect.bottom <= info.viewport.height,
    `${label}: CTA bottom ${info.rect.bottom} exceeds viewport ${info.viewport.height}`,
  );
  check(info.navTop !== null, `${label}: mobile nav not found`);
  check(
    info.rect.bottom <= info.navTop + 0.5,
    `${label}: CTA bottom ${info.rect.bottom} overlaps the tab bar top ${info.navTop}`,
  );
  check(info.dockPosition === 'fixed', `${label}: dock is ${info.dockPosition}, expected fixed`);
  check(info.dockAlpha === 1, `${label}: dock background ${info.dockBackground} is translucent`);
  check(info.hitInsideDock, `${label}: point above the CTA resolves outside the dock (${info.hitTag} ${info.hitText})`);
}

async function step12(browser) {
  const evidence = [];
  const measurements = {};

  // swap
  {
    const { context, page } = await newPage(browser, { account: ANVIL.swap });
    try {
      await connect(page);
      await goto(page, '/swap?symbol=TestLOVE20&from=ETH&to=TestLOVE20');
      await page.getByTestId('swap-from-amount').fill('0.01');
      await page.waitForFunction(
        () => {
          const node = document.querySelector('[data-testid="swap-to-amount"]');
          return node !== null && /TestLOVE20/.test(node.textContent ?? '') && !/^—/.test(node.textContent?.trim() ?? '');
        },
        null,
        { timeout: 60_000 },
      );
      const button = page.getByTestId('swap-submit');
      await waitEnabled(button, 30_000);
      const info = await measureDock(page, button);
      assertDock(info, 'swap');
      measurements.swap = info;
      evidence.push(await shot(page, '12-swap-sticky.png'));
    } finally {
      await context.close();
    }
  }

  // mint
  {
    const { context, page } = await newPage(browser, { account: W_MINT });
    try {
      await connect(page);
      await goto(page, '/mint');
      await page.locator('#mint-name').fill(`Teststicky-${RUN}`);
      await waitVisible(
        page.locator('#mint-name-check', { hasText: '✓ 可以用' }),
        40_000,
        'name available',
      );
      const button = page
        .getByRole('button', { name: /^(1\. 授权|铸造身份)$/ })
        .first();
      await waitVisible(button, 40_000, 'mint primary CTA');
      await waitEnabled(button, 40_000);
      const info = await measureDock(page, button);
      assertDock(info, 'mint');
      measurements.mint = info;
      evidence.push(await shot(page, '12-mint-sticky.png'));
    } finally {
      await context.close();
    }
  }

  // airdrop
  {
    const { context, page } = await newPage(browser, { account: ANVIL.eligible });
    try {
      await connect(page);
      await goto(page, '/airdrop');
      await waitVisible(page.getByTestId('airdrop-expected-amount'), 60_000, 'expected amount');
      const button = page.getByRole('button', { name: '铸造空投份额' }).first();
      await waitVisible(button, 30_000, 'airdrop CTA');
      await waitEnabled(button, 30_000);
      const info = await measureDock(page, button);
      assertDock(info, 'airdrop');
      measurements.airdrop = info;
      evidence.push(await shot(page, '12-airdrop-sticky.png'));
    } finally {
      await context.close();
    }
  }

  for (const [name, info] of Object.entries(measurements)) {
    evidence.push(
      `${name}: CTA rect y=${Math.round(info.rect.y)}..${Math.round(info.rect.bottom)}, ` +
        `viewport ${info.viewport.width}x${info.viewport.height}, nav top=${Math.round(info.navTop)}, ` +
        `dock position=${info.dockPosition}, z=${info.dockZIndex}, background=${info.dockBackground}, ` +
        `hit-inside-dock=${info.hitInsideDock}`,
    );
  }
  return {
    status: 'PASS',
    summary: '三页主 CTA 均在首屏完整可见、贴着底栏上方，浮层不透明且无内容透底',
    evidence,
    notes: 'Screenshots 12-*.png are viewport captures without scrolling; the dock is fixed above the 64px tab bar.',
  };
}

async function step13(browser) {
  const evidence = [];
  const pages = [
    { slug: 'home', path: '/', title: 'TestLOVE20' },
    { slug: 'my-nft', path: '/my-nft', title: '我的 NFT' },
    { slug: 'mint', path: '/mint', title: '铸造身份' },
    { slug: 'airdrop', path: '/airdrop', title: '铸造空投份额' },
    { slug: 'swap', path: '/swap?symbol=TestLOVE20&from=ETH&to=TestLOVE20', title: '兑换代币' },
  ];
  let failures = 0;
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    const { context, page } = await newPage(browser, {
      account: ANVIL.swap,
      width: viewport.width,
      height: viewport.height,
    });
    try {
      await connect(page);
      for (const entry of pages) {
        await goto(page, entry.path);
        if (entry.slug === 'home') {
          await waitVisible(
            page.locator('header a[aria-label$="首页"] span').first(),
            30_000,
            'home wordmark',
          );
        } else {
          await waitVisible(page.locator('header h1'), 30_000, 'page title');
          await waitVisible(page.getByRole('heading', { name: entry.title, level: 1 }), 30_000, entry.title);
        }
        await page.waitForTimeout(250);
        const measured = await page.evaluate(() => {
          const h1 = document.querySelector('header h1');
          const brand = document.querySelector('header a[aria-label$="首页"] > span');
          const el = h1 ?? brand;
          if (el === null) return null;
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            text: (el.textContent ?? '').trim(),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            truncated: el.scrollWidth > el.clientWidth + 1,
            overflow: style.overflow,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right },
            innerWidth: window.innerWidth,
            docScrollWidth: document.documentElement.scrollWidth,
            bodyScrollWidth: document.body.scrollWidth,
          };
        });
        check(measured !== null, `${viewport.width}px ${entry.slug}: no header title element`);
        check(
          measured.text === entry.title,
          `${viewport.width}px ${entry.slug}: title text "${measured.text}" != "${entry.title}"`,
        );
        const overflowOk =
          measured.docScrollWidth <= measured.innerWidth &&
          measured.bodyScrollWidth <= measured.innerWidth;
        const fits = measured.rect.right <= measured.innerWidth + 0.5;
        if (measured.truncated || !overflowOk || !fits) failures += 1;
        const screenshot = await shot(page, `13-${viewport.width}-${entry.slug}.png`);
        evidence.push(
          `${viewport.width}x${viewport.height} ${entry.slug}: title「${measured.text}」 ` +
            `scroll=${measured.scrollWidth}/${measured.clientWidth} truncated=${measured.truncated} ` +
            `doc.scrollWidth=${measured.docScrollWidth}/${measured.innerWidth} overflow=${overflowOk} ` +
            `right=${Math.round(measured.rect.right)}`,
        );
        evidence.push(screenshot);
      }
    } finally {
      await context.close();
    }
  }
  return {
    status: failures === 0 ? 'PASS' : 'FAIL',
    summary:
      failures === 0
        ? '五页标题在 390×844 与 360×640 均完整显示，无横向溢出'
        : `${failures} 个「视口×页面」组合出现标题截断或横向溢出`,
    evidence,
  };
}

async function step14(browser) {
  const evidence = [];
  const swapMember = latestMemberOf(ANVIL.swap);
  check(swapMember !== null, 'desktop wallet holds no identity');
  const { context, page } = await newPage(browser, {
    account: ANVIL.swap,
    width: 1100,
    height: 900,
    mobile: false,
    seedIdentityTokenId: swapMember.tokenId,
  });
  try {
    await connect(page);
    await goto(page, '/');
    await waitText(page, '你好，', { timeout: 30_000 });
    const aside = page.locator('aside[aria-label="主导航"]');
    const bottomNav = page.locator('nav[aria-label="主导航"]');
    await waitVisible(aside, 20_000, 'desktop sidebar');
    const asideVisible = await aside.isVisible();
    const bottomVisible = await bottomNav.isVisible().catch(() => false);
    const layout = await page.evaluate(() => {
      const asideNode = document.querySelector('aside[aria-label="主导航"]');
      const main = document.querySelector('main');
      return {
        asideWidth: asideNode?.getBoundingClientRect().width ?? null,
        mainLeft: main?.getBoundingClientRect().left ?? null,
        mainWidth: main?.getBoundingClientRect().width ?? null,
      };
    });
    check(asideVisible, 'sidebar is not visible at 1100px');
    check(!bottomVisible, 'mobile tab bar is still visible at 1100px');
    check(layout.asideWidth !== null && layout.asideWidth >= 200, `sidebar width ${layout.asideWidth}`);
    check(layout.mainLeft !== null && layout.mainLeft >= 200, `main starts at ${layout.mainLeft}`);
    evidence.push(
      await shot(page, '14-desktop-home.png'),
      `1100x900 home: aside visible=${asideVisible}, bottom nav visible=${bottomVisible}, aside width=${layout.asideWidth}, main left=${Math.round(layout.mainLeft)}`,
    );

    await goto(page, '/swap?symbol=TestLOVE20&from=ETH&to=TestLOVE20');
    await page.getByTestId('swap-from-amount').fill('0.01');
    await page.waitForFunction(
      () => {
        const node = document.querySelector('[data-testid="swap-to-amount"]');
        return node !== null && /TestLOVE20/.test(node.textContent ?? '') && !/^—/.test(node.textContent?.trim() ?? '');
      },
      null,
      { timeout: 60_000 },
    );
    const swapState = await page.getByTestId('swap-submit').evaluate((el) => {
      const fixedAncestors = [];
      let node = el.parentElement;
      while (node !== null && node !== document.body) {
        if (getComputedStyle(node).position === 'fixed') fixedAncestors.push(String(node.className));
        node = node.parentElement;
      }
      const rect = el.getBoundingClientRect();
      return {
        fixedAncestors,
        rect: { top: rect.top, bottom: rect.bottom },
        asideVisible: document.querySelector('aside[aria-label="主导航"]') !== null,
      };
    });
    check(swapState.fixedAncestors.length === 0, `swap CTA is still inside a fixed dock: ${swapState.fixedAncestors}`);
    evidence.push(
      await shot(page, '14-desktop-swap.png'),
      `1100x900 swap: fixed ancestors of CTA=${swapState.fixedAncestors.length}, CTA top=${Math.round(swapState.rect.top)}`,
    );

    await goto(page, '/mint');
    await page.locator('#mint-name').fill(`Testdesktop-${RUN}`);
    await waitVisible(
      page.locator('#mint-name-check', { hasText: '✓ 可以用' }),
      40_000,
      'name available',
    );
    const mintCta = page.getByRole('button', { name: /^(1\. 授权|铸造身份)$/ }).first();
    await waitVisible(mintCta, 40_000, 'mint CTA');
    const mintFixed = await mintCta.evaluate((el) => {
      let node = el.parentElement;
      const fixed = [];
      while (node !== null && node !== document.body) {
        if (getComputedStyle(node).position === 'fixed') fixed.push(String(node.className));
        node = node.parentElement;
      }
      return fixed;
    });
    check(mintFixed.length === 0, `mint CTA is still inside a fixed dock: ${mintFixed}`);
    evidence.push(
      await shot(page, '14-desktop-mint.png'),
      `1100x900 mint: fixed ancestors of CTA=${mintFixed.length}`,
    );
  } finally {
    await context.close();
  }
  return {
    status: 'PASS',
    summary: '1100×900 使用左侧栏；兑换/铸造主 CTA 回到文档流，不再吸底',
    evidence,
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const STEPS = {
  1: step1,
  2: step2,
  3: step3,
  4: step4,
  5: step5,
  6: step6,
  7: step7,
  8: step8,
  9: step9,
  10: step10,
  11: step11,
  12: step12,
  13: step13,
  14: step14,
};

async function main() {
  writeFileSync(LOG, '');
  log(`acceptance run against ${BASE} (chain ${CHAIN_ID}, run ${RUN})`);
  log(`deployment: MemberNFT=${MEMBER_NFT} firstToken=${TOKEN} airdrop=${AIRDROP}`);
  log(`chain: ${JSON.stringify({ chainId: cast(['chain-id']), block: cast(['block-number']) })}`);
  ensureMintWallet();

  const browser = await chromium.launch();
  try {
    for (const [key, step] of Object.entries(STEPS)) {
      const number = Number(key);
      if (ONLY.size > 0 && !ONLY.has(number)) continue;
      currentStep = number;
      try {
        const outcome = await step(browser);
        record(number, outcome.status, outcome.summary, outcome.evidence, outcome.notes ?? '');
      } catch (error) {
        log(`STEP ${number} threw: ${error.stack ?? error.message}`);
        record(number, 'FAIL', `执行中断：${error.message}`, [], String(error.stack ?? ''));
      }
    }
  } finally {
    await browser.close();
  }

  const tally = results.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  log(`tally: ${JSON.stringify(tally)}`);
  persist();
}

await main();
