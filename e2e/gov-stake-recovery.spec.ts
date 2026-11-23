import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createPublicClient, http } from 'viem';
import {
  anvilRpc,
  isolateChain,
  readMiningMode,
  restoreMining,
  SUITE_MINING,
  suspendMining,
} from './chain';
import {
  CHAIN_HEX,
  connect,
  installWallet,
  seedIdentity,
  type WalletStubSend,
} from './wallet-stub';

/**
 * 治理·质押 · 卡住态纯提示（T004 G3）
 *
 * 真实状态：交易已广播、钱包已返回 hash，但链上迟迟不打包（still in pool）。
 * `suspendMining()` + `sendDelayMs` 复现；卡住态只显示标题/正文/短哈希，无按钮、
 * 无链接；mine 后 watcher 自动更新为回执，不需要任何手动动作。
 */

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/network/anvil31337_dev/network.json'), 'utf8'),
) as {
  chainId: number;
  rpcUrls: string[];
  addresses: { tokenAddress: `0x${string}`; hub: `0x${string}` };
};

const RPC_URL = process.env.E2E_ANVIL_RPC ?? deployment.rpcUrls[0] ?? 'http://127.0.0.1:8555';
const ACCOUNT = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'; // anvil #4, MemberNFT #5
const MEMBER_ID = '5';
const SYMBOL = 'TestLOVE20';
const APPROVE_AMOUNT = '1000000000000000000000'; // 1000e18
const TOKEN = deployment.addresses.tokenAddress;
const HUB = deployment.addresses.hub;

const publicClient = createPublicClient({ transport: http(RPC_URL) });

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 240_000 });

isolateChain();

test.afterAll(async () => {
  try {
    await restoreMining();
  } finally {
    const mode = await readMiningMode();
    expect(mode.automine).toBe(SUITE_MINING.automine);
    expect(mode.intervalMining).toBe(SUITE_MINING.intervalMining);
  }
});

interface StubState {
  readonly rpcUrl: string;
  readonly chainHex: string;
  readonly account: string;
  readonly sends: WalletStubSend[];
}

async function stubState(page: Page): Promise<StubState> {
  return (await page.evaluate(() => {
    const raw = (window as unknown as { __walletStub?: StubState }).__walletStub;
    if (raw === undefined) throw new Error('wallet stub not installed');
    return raw;
  })) as StubState;
}

async function writesSent(page: Page): Promise<number> {
  return (await stubState(page)).sends.length;
}

function castSend(address: `0x${string}`, signature: string, args: readonly string[]): void {
  execFileSync(
    'cast',
    ['send', address, signature, ...args, '--from', ACCOUNT, '--unlocked', '--rpc-url', RPC_URL],
    { encoding: 'utf8' },
  );
}

async function mine(): Promise<void> {
  await anvilRpc('anvil_mine', []);
}

async function openStakeLiquidity(page: Page): Promise<void> {
  await installWallet(page, ACCOUNT, CHAIN_HEX, { sendDelayMs: 3_000 });
  await seedIdentity(page, ACCOUNT, MEMBER_ID);
  await page.goto(`/stake/liquidity?symbol=${SYMBOL}`);
  await connect(page);
  await expect(page.getByTestId('gov-liquidity-card')).toBeVisible({ timeout: 30_000 });
}

test('质押卡住：纯提示卡无按钮，mine 后自动出回执', async ({ page }) => {
  // 只测主交易；先替账户 #4 授权 Hub，避免把授权步骤混进卡住态用例。
  castSend(TOKEN, 'approve(address,uint256)', [HUB, APPROVE_AMOUNT]);
  await suspendMining();

  await openStakeLiquidity(page);
  await page.getByTestId('gov-liquidity-token-input').fill('1000');
  await expect(page.getByTestId('gov-liquidity-native-input')).not.toHaveValue('', {
    timeout: 20_000,
  });
  await page.getByTestId('gov-liquidity-phases-select').selectOption('10');
  await expect(page.getByTestId('gov-liquidity-submit')).toBeEnabled({ timeout: 30_000 });

  const nonceBefore = await publicClient.getTransactionCount({
    address: ACCOUNT,
    blockTag: 'latest',
  });
  await page.getByTestId('gov-liquidity-submit').click();

  const recovery = page.getByTestId('tx-watch-recovery');
  await expect(recovery).toBeVisible({ timeout: 40_000 });
  await expect(recovery).toContainText('这笔交易还没有确认');
  await expect(recovery).toContainText('请在钱包或区块浏览器里查看');
  // 纯提示卡：没有按钮、没有链接；主按钮保持禁用，不能开第二笔。
  await expect(recovery.getByRole('button')).toHaveCount(0);
  await expect(recovery.getByRole('link')).toHaveCount(0);
  await expect(page.getByTestId('gov-liquidity-submit')).toBeDisabled();

  const first = (await stubState(page)).sends[0];
  expect(first).toBeDefined();
  if (first === undefined) return;
  expect(first.pinnedNonce).toBe(nonceBefore);
  expect(await writesSent(page)).toBe(1);

  const queued = await publicClient.getTransaction({ hash: first.hash as `0x${string}` });
  expect(queued.nonce).toBe(nonceBefore);
  expect(
    await publicClient
      .getTransactionReceipt({ hash: first.hash as `0x${string}` })
      .catch(() => null),
  ).toBeNull();

  await mine();
  await expect(page.getByTestId('gov-receipt')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('tx-watch-recovery')).toHaveCount(0);

  const receipt = await publicClient.getTransactionReceipt({ hash: first.hash as `0x${string}` });
  expect(receipt.status).toBe('success');
  expect(receipt.transactionHash).toBe(first.hash);

  console.log(
    `gov stake stuck hint: nonce=${nonceBefore} hash=${first.hash} ` +
      `receipt block=${receipt.blockNumber} pure hint`,
  );
});
