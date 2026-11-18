import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  parseAbiItem,
  parseEventLogs,
} from 'viem';
import { anvilRpc, isolateChain, revertChain, snapshotChain } from './chain';
import { connect, installWallet } from './wallet-stub';

// Independent theory values: docs/product/three-line/airdrop.md §1.

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/network/anvil31337_dev/network.json'), 'utf8'),
) as {
  rpcUrls: string[];
  addresses: {
    airdropDistributor: `0x${string}`;
    firstTokenAddress: `0x${string}`;
    phase: `0x${string}`;
  };
};

const snapshot = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/network/anvil31337_dev/airdrop.json'), 'utf8'),
) as {
  entries: Array<{ account: `0x${string}`; share: string; proof: `0x${string}`[] }>;
};

const RPC_URL = process.env.E2E_ANVIL_RPC ?? deployment.rpcUrls[0] ?? 'http://127.0.0.1:8545';
const AIRDROP = deployment.addresses.airdropDistributor;
const TOKEN = deployment.addresses.firstTokenAddress;

const CLAIMER = '0x976EA74026E726554dB657fA54763abd0C3a0aa9'; // #6
const DONOR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // #0
const POOL = 500000000000000000000000000n;
const REMAINING_SHARE = 500000000000000000n;
const SHARE = 100000000000000000n;
const NORMAL_AMOUNT = 100000000000000000000000000n;
const TOP_UP = 1234567890123456789n;

const ALREADY_CLAIMED = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'; // #7
const OUTSIDER = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be5d'; // not in snapshot

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');
const CLAIM_EVENT = parseAbiItem(
  'event AirdropClaimed(address indexed tokenAddress, address indexed claimer, uint256 share, uint256 amount, uint256 remainingShare)',
);
const publicClient = createPublicClient({ transport: http(RPC_URL) });
// token => claimableFromRound is storage mapping slot 2.
const CLAIMABLE_FROM_ROUND_SLOT = keccak256(
  encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [TOKEN, 2n]),
);

let caseSnapshot: string;

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 120_000 });

isolateChain();

function snapshotEntry(account: string) {
  const entry = snapshot.entries.find(
    (item) => item.account.toLowerCase() === account.toLowerCase(),
  );
  if (entry === undefined) throw new Error(`missing snapshot entry ${account}`);
  return entry;
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

function phaseUint(signature: string, ...args: string[]): bigint {
  return parseUint(castCallTo(deployment.addresses.phase, signature, ...args), signature);
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

function send(from: string, to: string, signature: string, ...args: string[]): void {
  execFileSync(
    'cast',
    ['send', to, signature, ...args, '--from', from, '--unlocked', '--rpc-url', RPC_URL],
    { encoding: 'utf8' },
  );
}

async function expectClaimState(account: string, amount = 0n, pool = POOL): Promise<void> {
  const info = await publicClient.readContract({
    address: AIRDROP,
    abi: parseAbi([
      'function airdropInfo(address) view returns ((address tokenAddress,bytes32 merkleRoot,uint256 claimableFromRound,uint256 totalClaimedShare,uint256 totalRemainingShare,uint256 totalClaimedAmount,uint256 remainingAmount,string snapshotUri))',
    ]),
    functionName: 'airdropInfo',
    args: [TOKEN],
  });
  expect({
    pool: info.remainingAmount,
    remainingShare: info.totalRemainingShare,
    claimedShare: info.totalClaimedShare,
    totalClaimedAmount: info.totalClaimedAmount,
    wallet: tokenUint('balanceOf(address)(uint256)', account),
    claimedAmount: castUint('claimedAmount(address,address)(uint256)', TOKEN, account),
    claimed: isClaimed(account),
  }).toEqual({
    pool,
    remainingShare: REMAINING_SHARE - (amount > 0n ? SHARE : 0n),
    claimedShare: REMAINING_SHARE + (amount > 0n ? SHARE : 0n),
    totalClaimedAmount: POOL + amount,
    wallet: amount,
    claimedAmount: amount,
    claimed: amount > 0n,
  });
}

async function setPoolBalance(amount: bigint): Promise<void> {
  await anvilRpc('anvil_impersonateAccount', [AIRDROP]);
  await anvilRpc('anvil_setBalance', [AIRDROP, '0xde0b6b3a7640000']);
  try {
    send(AIRDROP, TOKEN, 'transfer(address,uint256)', DONOR, (POOL - amount).toString());
  } finally {
    await anvilRpc('anvil_stopImpersonatingAccount', [AIRDROP]);
  }
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS, name), animations: 'disabled' });
}

test.beforeEach(async () => {
  caseSnapshot = await snapshotChain();
  expect(BigInt(snapshotEntry(CLAIMER).share)).toBe(SHARE);
  await expectClaimState(CLAIMER);
});

test.afterEach(async () => {
  await revertChain(caseSnapshot);
});

for (const sample of [
  {
    name: 'A normal and local snapshot without Pages',
    topUp: 0n,
    amount: NORMAL_AMOUNT,
    text: '100,000,000',
    poolAfter: 400000000000000000000000000n,
  },
  {
    name: 'B fractional amount after pool top-up',
    topUp: TOP_UP,
    amount: 100000000246913578024691357n,
    // owner 2026-11-19 数字显示规范：量级 ≥1e6 → 0 位小数，所以 100,000,000.246913
    // 在页面上显示为 100,000,000（链上到账仍是完整的小数数量）。
    text: '100,000,000',
    poolAfter: 400000000987654312098765432n,
  },
]) {
  test(`airdrop: ${sample.name}`, async ({ page }) => {
    const entry = snapshotEntry(CLAIMER);
    if (sample.topUp > 0n) {
      send(DONOR, TOKEN, 'transfer(address,uint256)', AIRDROP, sample.topUp.toString());
      await expectClaimState(CLAIMER, 0n, 500000001234567890123456789n);
    }
    expect(claimableAmount(CLAIMER, entry.share, entry.proof)).toBe(sample.amount);
    let remoteRequests = 0;
    await page.route('https://love20bsc.github.io/core/**', async (route) => {
      remoteRequests += 1;
      await route.abort();
    });
    await installWallet(page, CLAIMER);
    await page.goto('/airdrop?symbol=NOT_A_REAL_COMMUNITY');
    await connect(page);
    const expected = page.getByTestId('airdrop-expected-amount');
    // Owner 2026-11-17: the card is two lines — share sentence (with the unit)
    // then the amount alone. The old meta line and the pool-balance note are
    // gone from the whole page.
    await expect(page.getByTestId('airdrop-share-percent')).toHaveText(
      '我的份额 10%，预计可铸造空投 TestLOVE20：',
      { timeout: 20_000 },
    );
    await expect(expected).toHaveText(sample.text);
    // The symbol lives on line 1 only; repeating it beside the amount is a bug.
    await expect(expected).not.toContainText('TestLOVE20');
    await expect(page.getByText('本次空投：TestLOVE20', { exact: true })).toHaveCount(0);
    await expect(
      page.getByText('按铸造时的池子余额与剩余份额计算，别人铸造后金额会变。', { exact: true }),
    ).toHaveCount(0);
    // 规则 defaults to expanded (owner 2026-11-17) with the full paragraph.
    const rules = page.getByTestId('airdrop-rules');
    await expect(rules).toHaveJSProperty('open', true);
    await expect(rules).toContainText(
      '空投资格：从TKM链公平发射开始，参与或部分参与1年多的社群铸币实验，并参与资产销毁锁定活动的社群成员，基于每个人在每个社区的销毁锁定份额计算出本链创世代币的空投份额，具体份额计算规则详见销毁活动：',
    );
    const burnLink = rules.getByRole('link', {
      name: 'https://love20tkm.github.io/interface/apps/burn/',
      exact: true,
    });
    await expect(burnLink).toHaveAttribute(
      'href',
      'https://love20tkm.github.io/interface/apps/burn/',
    );
    await expect(burnLink).toHaveAttribute('target', '_blank');

    if (sample.topUp === 0n) {
      for (const viewport of [
        { name: 'mobile', width: 390, height: 844 },
        { name: 'desktop', width: 1280, height: 800 },
      ]) {
        for (const theme of ['light', 'dark']) {
          await page.setViewportSize(viewport);
          await page.evaluate((value) => window.localStorage.setItem('love20:theme', value), theme);
          await page.reload();
          await connect(page);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await expect(expected).toHaveText('100,000,000', { timeout: 20_000 });
          await shot(page, `airdrop-numbers-${theme}-${viewport.name}.png`);
        }
      }
    }

    await page.getByRole('button', { name: '立即铸造', exact: true }).click();
    await expect(page.getByRole('heading', { name: '铸造成功' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('airdrop-receipt-amount')).toHaveText(
      `${sample.text} TestLOVE20`,
    );
    const hash = (await page.getByTestId('airdrop-receipt-hash').innerText()).trim();
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);
    const receipt = await publicClient.getTransactionReceipt({ hash: hash as `0x${string}` });
    expect(receipt.status).toBe('success');
    const events = parseEventLogs({
      abi: [CLAIM_EVENT],
      logs: receipt.logs,
      eventName: 'AirdropClaimed',
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.args.claimer.toLowerCase()).toBe(CLAIMER.toLowerCase());
    expect(events[0]?.args.tokenAddress.toLowerCase()).toBe(TOKEN.toLowerCase());
    expect(events[0]?.args.amount).toBe(sample.amount);
    expect(events[0]?.args.share).toBe(SHARE);
    expect(events[0]?.args.remainingShare).toBe(400000000000000000n);
    await expectClaimState(CLAIMER, sample.amount, sample.poolAfter);

    await page.getByRole('button', { name: '好的', exact: true }).click();
    const title = `已铸造 ${sample.text} TestLOVE20`;
    await expect(page.getByTestId('airdrop-claimed-title')).toHaveText(title, { timeout: 20_000 });
    await expect(page.getByRole('button', { name: '立即铸造', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: '铸造成功' })).toHaveCount(0);
    await expect(page.getByTestId('airdrop-claimed-title')).toHaveText(title, { timeout: 20_000 });
    expect(remoteRequests).toBe(0);
    console.log(
      `${sample.name}: theory=${sample.amount} chain=${events[0]?.args.amount} page=${sample.text} tx=${hash} Pages=${remoteRequests}`,
    );
  });
}

test('airdrop: F already claimed shows the theoretical amount without a local receipt', async ({
  page,
}) => {
  const entry = snapshotEntry(ALREADY_CLAIMED);
  await expectClaimState(ALREADY_CLAIMED);
  send(
    ALREADY_CLAIMED,
    AIRDROP,
    'claim(address,uint256,bytes32[])',
    TOKEN,
    entry.share,
    proofArg(entry.proof),
  );
  await expectClaimState(ALREADY_CLAIMED, NORMAL_AMOUNT, 400000000000000000000000000n);
  expect(claimableAmount(ALREADY_CLAIMED, entry.share, entry.proof)).toBe(0n);
  await installWallet(page, ALREADY_CLAIMED);
  await page.goto('/airdrop');
  await connect(page);
  const title = page.getByTestId('airdrop-claimed-title');
  await expect(title).toHaveText('已铸造 100,000,000 TestLOVE20', { timeout: 20_000 });
  await expect(page.getByTestId('airdrop-claimed-body')).toHaveCount(0);
  await expect(page.getByTestId('airdrop-receipt-amount')).toHaveCount(0);
  await expect(page.getByTestId('airdrop-receipt-hash')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '立即铸造', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(title).toHaveText('已铸造 100,000,000 TestLOVE20', { timeout: 20_000 });
});

test('airdrop: C before the claim round has zero claimable amount and no mint action', async ({
  page,
}) => {
  const gateRound = phaseUint('currentPhase()(uint256)') + 2n;
  await anvilRpc('anvil_setStorageAt', [
    AIRDROP,
    CLAIMABLE_FROM_ROUND_SLOT,
    `0x${gateRound.toString(16).padStart(64, '0')}`,
  ]);
  const entry = snapshotEntry(CLAIMER);
  expect(claimableAmount(CLAIMER, entry.share, entry.proof)).toBe(0n);
  await expectClaimState(CLAIMER);
  await installWallet(page, CLAIMER);
  await page.goto('/airdrop');
  await connect(page);
  await expect(page.getByTestId('airdrop-round-gate-title')).toHaveText('还没到可铸造轮次', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('airdrop-round-gate-wait')).toHaveText(/^约 \d+ 分钟$/);
  await expect(page.getByRole('button', { name: '立即铸造', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('airdrop-expected-amount')).toHaveCount(0);
});

for (const sample of [
  { name: 'D empty pool', balance: 0n, title: '你有一份空投，但空投池还没有代币。' },
  { name: 'E floor to zero', balance: 1n, title: '可铸造金额暂时为 0。' },
]) {
  test(`airdrop: ${sample.name}`, async ({ page }) => {
    await setPoolBalance(sample.balance);
    const entry = snapshotEntry(CLAIMER);
    expect(claimableAmount(CLAIMER, entry.share, entry.proof)).toBe(0n);
    await expectClaimState(CLAIMER, 0n, sample.balance);
    await installWallet(page, CLAIMER);
    await page.goto('/airdrop');
    await connect(page);
    await expect(page.getByText(sample.title, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: '立即铸造', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('airdrop-expected-amount')).toHaveCount(0);
  });
}

test('airdrop: G a real reverted transaction leaves every token amount and share unchanged', async ({
  page,
}) => {
  let failedHash: `0x${string}` | undefined;
  await page.route(RPC_URL, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const payload = route.request().postDataJSON() as {
      method?: string;
      params?: Array<{ data?: string; gas?: string; to?: string }>;
    };
    const tx = payload.params?.[0];
    if (
      payload.method !== 'eth_sendTransaction' ||
      tx?.data === undefined ||
      tx.to?.toLowerCase() !== AIRDROP.toLowerCase()
    ) {
      await route.continue();
      return;
    }
    // Damage only the wallet's proof; the RPC response and transaction remain real.
    tx.data = tx.data.slice(0, -1) + (tx.data.endsWith('0') ? '1' : '0');
    tx.gas = '0x7a120';
    const response = await route.fetch({ postData: JSON.stringify(payload) });
    failedHash = ((await response.json()) as { result?: `0x${string}` }).result;
    await route.fulfill({ response });
  });
  await installWallet(page, CLAIMER);
  await page.goto('/airdrop');
  await connect(page);
  await expect(page.getByTestId('airdrop-expected-amount')).toHaveText('100,000,000', {
    timeout: 20_000,
  });
  await page.getByRole('button', { name: '立即铸造', exact: true }).click();
  await expect(
    page.getByText('交易上链了，但没有成功。你的份额没有变化。', { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  if (failedHash === undefined) throw new Error('wallet did not submit a real transaction');
  const receipt = await publicClient.getTransactionReceipt({ hash: failedHash });
  expect(receipt.status).toBe('reverted');
  expect(receipt.logs).toHaveLength(0);
  await expectClaimState(CLAIMER);
  await expect(page.getByTestId('airdrop-expected-amount')).toHaveText('100,000,000');
  await expect(page.getByTestId('airdrop-receipt-amount')).toHaveCount(0);
  console.log(
    `G reverted tx=${failedHash}; pool=${POOL} wallet=0 claimedAmount=0 remainingShare=${REMAINING_SHARE}`,
  );
});

test('airdrop: H a wallet outside the snapshot has zero claimable amount and a way out', async ({
  page,
}) => {
  const entry = snapshotEntry(CLAIMER);
  expect(claimableAmount(OUTSIDER, entry.share, entry.proof)).toBe(0n);
  await expectClaimState(OUTSIDER);
  await installWallet(page, OUTSIDER);
  await page.goto('/airdrop');
  await connect(page);
  await expect(page.getByText('这个钱包不在空投名单里。', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const swap = page.getByRole('link', { name: '用 ETH 兑换 TestLOVE20', exact: true });
  await expect(swap).toHaveAttribute('href', '/swap?symbol=TestLOVE20');
  await expect(page.getByRole('button', { name: '立即铸造', exact: true })).toHaveCount(0);
});
