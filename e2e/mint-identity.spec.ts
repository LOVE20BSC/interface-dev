import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { isolateChain } from './chain';

/**
 * 铸造身份 (UX spec §3.3) against the local anvil chain.
 *
 * The wallet is the same injected EIP-1193 stub the other M0 specs use: reads go
 * through the app's HTTP transport, writes through eth_sendTransaction. Anvil
 * accounts are unlocked, so no private key enters the test.
 *
 * This file mutates chain state (approve + mint), so it runs serially and uses a
 * freshly generated name per run.
 */

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/network/anvil31337_dev/network.json'), 'utf8'),
) as {
  chainId: number;
  rpcUrls: string[];
  nativeCurrency: { symbol: string };
  addresses: {
    memberNFT: `0x${string}`;
    firstTokenAddress: `0x${string}`;
  };
};

const RPC_URL = process.env.E2E_ANVIL_RPC ?? deployment.rpcUrls[0] ?? 'http://127.0.0.1:8545';
const CHAIN_ID = deployment.chainId;
const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;
const MEMBER_NFT = deployment.addresses.memberNFT;
const FIRST_TOKEN = deployment.addresses.firstTokenAddress;
const NATIVE = deployment.nativeCurrency.symbol;

// anvil's deterministic accounts (mnemonic "test test ... junk").
const ACCOUNTS = {
  funded: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // #2: ~99.9M TestLOVE20, no NFT yet
  eligible: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', // #5: in snapshot, unclaimed, 0 LOVE20
  outsider: '0x8b3a350Cf5C34c9194ca85829a2df0ec3153bE5d', // not in snapshot, 0 LOVE20
} as const;

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');

const RUN_ID = Math.random().toString(36).slice(2, 8);
/** Dev builds block names without `Test`; the chain then stores them verbatim. */
const BRANCH_NAME = `Teste2e-branch-${RUN_ID}`;
const NEW_NAME = `Teste2e-mint-${RUN_ID}`;
/** 走查用例（owner 2026-11-21）用的第二个名字：确定性新人账户 #6 首次铸造。 */
const FIRST_NFT_NAME = `Teste2e-first-${RUN_ID}`;
const HANDOFF_NAME = `Teste2e-handoff-${RUN_ID}`;
const NON_TEST_NAME = `e2e-noprefix-${RUN_ID}`;
/** anvil seed: params/anvil31337_dev/seed.params SEED_MEMBER_NAME_PREFIX=Testdev-member- */
const SEEDED_NAME = 'Testdev-member-0';

let mintedMemberId = '';
let mintedName = '';
let mintedHash = '';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 120_000 });

// Snapshot before this file's beforeAll fixtures mutate the chain; afterAll restores it.
isolateChain();

function identityCacheKey(account: string): string {
  return `love20:v1:${CHAIN_ID}:${MEMBER_NFT.toLowerCase()}:${account.toLowerCase()}:identity`;
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
  await expect(page.getByRole('button', { name: '打开钱包与身份 NFT 菜单' })).toBeVisible({
    timeout: 15_000,
  });
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS, name), animations: 'disabled' });
}

function castSend(signature: string, ...args: string[]): void {
  execFileSync(
    'cast',
    [
      'send',
      FIRST_TOKEN,
      signature,
      ...args,
      '--from',
      ACCOUNTS.funded,
      '--unlocked',
      '--rpc-url',
      RPC_URL,
    ],
    { encoding: 'utf8' },
  );
}

function castCall(signature: string, ...args: string[]): string {
  return execFileSync('cast', ['call', MEMBER_NFT, signature, ...args, '--rpc-url', RPC_URL], {
    encoding: 'utf8',
  }).trim();
}

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });
  // The seed fixture must be live: core@72a1604 stores this name verbatim, so a
  // chain that still auto-prefixes (or still seeds `dev-member-0`) fails loudly.
  expect(castCall('memberName(uint256)(string)', '1')).toBe(`"${SEEDED_NAME}"`);
});

test('mint: dev blocks a name that does not start with Test', async ({ page }) => {
  await installWallet(page, ACCOUNTS.funded);
  await page.goto('/mint');
  await connect(page);

  const input = page.getByRole('textbox', { name: '给身份 NFT 起个名字' });
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(NON_TEST_NAME);

  await expect(page.getByText('✗ 还没加 Test 前缀')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('为了让测试身份 NFT 和真实身份 NFT 一眼能分开。')).toBeVisible();
  // The rule line is dev/test copy, and the old "contract adds Test" note is gone.
  await expect(page.getByText('名称必须以 Test 开头', { exact: true })).toBeVisible();
  await expect(page.getByText(/测试环境会在链上名字前加 Test/)).toHaveCount(0);
  // The byte budget is the full MAX_NAME_LENGTH (32), not 28.
  await expect(page.locator('#mint-name-bytes')).toContainText('/32 字节');
  await expect(page.getByRole('button', { name: /^(2\. )?铸造身份 NFT$/ })).toBeDisabled();
  await expect(page.getByText('✓ 可以用')).toHaveCount(0);

  // Once the name satisfies the rule the local error disappears and the quote runs.
  await input.fill(`Test${NON_TEST_NAME}`);
  await expect(page.getByText('✗ 还没加 Test 前缀')).toHaveCount(0);
  await expect(page.getByText('✓ 可以用')).toBeVisible({ timeout: 10_000 });
});

test('mint: a taken name blocks the CTA and shows the existing #id', async ({ page }) => {
  await installWallet(page, ACCOUNTS.funded);
  await page.goto('/mint');
  await connect(page);

  const input = page.getByRole('textbox', { name: '给身份 NFT 起个名字' });
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(SEEDED_NAME);

  // The quote sends the raw name, and the seed minted exactly this string.
  await expect(page.getByText('这个名字已经被用了（#1）')).toBeVisible({ timeout: 10_000 });

  const mintButton = page.getByRole('button', { name: /^(2\. )?铸造身份 NFT$/ });
  await expect(mintButton).toBeDisabled();
  await expect(page.getByText('✓ 可以用')).toHaveCount(0);
});

test('mint: insufficient balance with airdrop eligibility goes to 铸造空投份额', async ({
  page,
}) => {
  await installWallet(page, ACCOUNTS.eligible);
  await page.goto('/mint');
  await connect(page);

  const input = page.getByRole('textbox', { name: '给身份 NFT 起个名字' });
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(BRANCH_NAME);

  await expect(page.getByText('✓ 可以用')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/余额不足，还需要/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('你还有空投份额可以铸造', { exact: false })).toBeVisible({
    timeout: 20_000,
  });

  const airdropCta = page.getByRole('link', { name: '空投铸造' });
  await expect(airdropCta).toBeVisible();
  await expect(airdropCta).toHaveAttribute('href', /\/airdrop\?symbol=TestLOVE20$/);
  // The mint ladder is replaced by the branch CTA: no second solid action.
  await expect(page.getByRole('button', { name: /^(2\. )?铸造身份 NFT$/ })).toHaveCount(0);

  await shot(page, 'mint-insufficient.png');
});

test('mint: insufficient balance without airdrop eligibility goes to 用 ETH 兑换', async ({
  page,
}) => {
  await installWallet(page, ACCOUNTS.outsider);
  await page.goto('/mint');
  await connect(page);

  const input = page.getByRole('textbox', { name: '给身份 NFT 起个名字' });
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(BRANCH_NAME);

  await expect(page.getByText('✓ 可以用')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('可以用 ETH 换一些，再回来铸造。')).toBeVisible({
    timeout: 20_000,
  });

  const swapCta = page.getByRole('link', { name: '用 ETH 兑换' });
  await expect(swapCta).toBeVisible();
  // The branch pins both sides of the pair, not just the community context.
  await expect(swapCta).toHaveAttribute(
    'href',
    `/swap?symbol=TestLOVE20&from=${NATIVE}&to=TestLOVE20`,
  );
});

test('mint: approve → mint produces a real receipt with MemberMinted data', async ({ page }) => {
  // Deterministic stage 1: clear any allowance a previous run left behind.
  castSend('approve(address,uint256)', MEMBER_NFT, '0');
  await installWallet(page, ACCOUNTS.funded);
  await page.goto('/mint');
  await connect(page);

  const input = page.getByRole('textbox', { name: '给身份 NFT 起个名字' });
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(NEW_NAME);
  await expect(page.getByText('✓ 可以用')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/预计 .*TestLOVE20/)).toBeVisible({ timeout: 10_000 });

  await shot(page, 'mint-form.png');

  // Stage 1 must be visible after the allowance reset (global `授权 {symbol}`
  // label, owner 2026-11-14), then turn into the read-only 已授权 state.
  const approveButton = page.getByTestId('mint-approve');
  await expect(approveButton).toBeVisible({ timeout: 30_000 });
  await expect(approveButton).toContainText('授权 TestLOVE20');
  await approveButton.click();
  await expect(approveButton).toContainText('已授权', { timeout: 30_000 });
  await expect(page).toHaveURL(/\/mint/);

  const mintButton = page.getByRole('button', { name: '铸造身份 NFT' });
  await expect(mintButton).toBeEnabled({ timeout: 30_000 });
  await mintButton.click();

  await expect(page.getByRole('heading', { name: '铸造成功' })).toBeVisible({
    timeout: 30_000,
  });

  const memberIdText = (await page.getByTestId('mint-receipt-member-id').innerText()).trim();
  mintedMemberId = memberIdText.replace(/[^0-9]/g, '');
  mintedName = (await page.getByTestId('mint-receipt-name').innerText()).trim();
  mintedHash = (await page.getByTestId('mint-receipt-hash').innerText()).trim();
  const burned = (await page.getByTestId('mint-receipt-burned').innerText()).trim();

  expect(mintedMemberId).toMatch(/^[0-9]+$/);
  expect(mintedName).toBe(NEW_NAME);
  expect(mintedHash).toMatch(/^0x[0-9a-f]{64}$/i);
  expect(burned).toMatch(/TestLOVE20$/);
  expect(burned).toMatch(/[1-9]/);

  // The identity must not be auto-selected (selection is local, on 我的 NFT).
  expect(
    await page.evaluate(
      (key) => window.localStorage.getItem(key),
      identityCacheKey(ACCOUNTS.funded),
    ),
  ).toBeNull();

  await shot(page, 'mint-receipt.png');

  // The receipt's #id is a real on-chain token that cast agrees exists.
  // core@72a1604 stores the raw input; the chain did not add or strip a prefix.
  expect(castCall('memberName(uint256)(string)', mintedMemberId)).toBe(`"${NEW_NAME}"`);
  expect(castCall('ownerOf(uint256)(address)', mintedMemberId).toLowerCase()).toBe(
    ACCOUNTS.funded.toLowerCase(),
  );

  // 「好的」is the only receipt button (owner 2026-11-16). Not clicking it
  // leaves the user on /mint: the receipt is a page state, never an auto-jump.
  await expect(page.getByRole('button', { name: '好的' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /去我的 NFT|再铸造|回首页/ })).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/mint/);

  // Owner 2026-11-16: 点「好的」→ 自动回到 /my-nft，新铸造的身份可见且高亮。
  await page.getByRole('button', { name: '好的' }).click();
  await expect(page).toHaveURL(/\/my-nft/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: '铸造成功' })).toHaveCount(0);

  const justMintedStrip = page.getByTestId('my-nft-just-minted-strip');
  await expect(justMintedStrip).toBeVisible({ timeout: 20_000 });
  await expect(justMintedStrip).toContainText(`#${mintedMemberId}`);
  await expect(justMintedStrip).toContainText(mintedName);

  const identityList = page.getByRole('list', { name: '我的 NFT' });
  await expect(identityList.getByText(mintedName, { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(identityList.getByTestId('identity-just-minted')).toBeVisible();
  const justMintedRow = identityList.getByTestId('identity-just-minted-row');
  await expect(justMintedRow).toContainText(`#${mintedMemberId}`);
  // Highlight is not selection: the local identity cache is still empty and the
  // new row keeps its 「使用此身份 NFT」 action (the wallet may own other
  // identities, so scope the assertion to the just-minted row).
  expect(
    await page.evaluate(
      (key) => window.localStorage.getItem(key),
      identityCacheKey(ACCOUNTS.funded),
    ),
  ).toBeNull();
  await expect(justMintedRow.getByRole('button', { name: '使用此身份 NFT' })).toBeVisible();
  await shot(page, 'my-nft-after-mint.png');

  // §4.3: the receipt is a one-time page state, never replayed when /mint is
  // revisited (reload included).
  await page.goto('/mint');
  await expect(page.getByRole('heading', { name: '铸造成功' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: '铸造成功' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /起个名字/ })).toBeVisible({
    timeout: 30_000,
  });

  console.log(`mint receipt: #${mintedMemberId} ${mintedName} tx=${mintedHash} burned=${burned}`);
});

test('my-nft: the list survives the refetch that follows the mint handoff', async ({ page }) => {
  // Regression (owner 2026-11-17): 「好的」landed on /my-nft, the handoff effect
  // refetched ownerOf() while nothing was selected, and the list flipped to
  // 「身份 NFT 列表暂时读不到。」 1~2 s later (重试 re-ran the same refetch).
  castSend('approve(address,uint256)', MEMBER_NFT, '0');
  await installWallet(page, ACCOUNTS.funded);
  await page.goto('/mint');
  await connect(page);

  const input = page.getByRole('textbox', { name: '给身份 NFT 起个名字' });
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(HANDOFF_NAME);
  await expect(page.getByText('✓ 可以用')).toBeVisible({ timeout: 10_000 });

  const approveButton = page.getByTestId('mint-approve');
  await expect(approveButton).toBeVisible({ timeout: 30_000 });
  await approveButton.click();
  await expect(approveButton).toContainText('已授权', { timeout: 30_000 });

  const mintButton = page.getByRole('button', { name: '铸造身份 NFT' });
  await expect(mintButton).toBeEnabled({ timeout: 30_000 });
  await mintButton.click();
  await expect(page.getByRole('heading', { name: '铸造成功' })).toBeVisible({ timeout: 30_000 });

  const memberId = (await page.getByTestId('mint-receipt-member-id').innerText()).replace(
    /[^0-9]/g,
    '',
  );
  expect(memberId).toMatch(/^[0-9]+$/);
  expect(castCall('memberName(uint256)(string)', memberId)).toBe(`"${HANDOFF_NAME}"`);

  await page.getByRole('button', { name: '好的' }).click();
  await expect(page).toHaveURL(/\/my-nft/, { timeout: 15_000 });

  const identityList = page.getByRole('list', { name: '我的 NFT' });
  await expect(identityList.getByText(HANDOFF_NAME, { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  // The list showed before the failure surfaced, so the assertion has to outlive
  // the handoff refetch (React Query retry included), not race it.
  await page.waitForTimeout(5_000);
  await expect(page.getByText('身份 NFT 列表暂时读不到。')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '重试' })).toHaveCount(0);
  await expect(identityList.getByText(HANDOFF_NAME, { exact: true })).toBeVisible();
  await expect(identityList.getByTestId('identity-just-minted-row')).toContainText(`#${memberId}`);
});

test('my-nft: the freshly minted identity is listed on the next page', async ({ page }) => {
  expect(mintedName).not.toBe('');
  await installWallet(page, ACCOUNTS.funded);
  await page.goto('/my-nft');
  await connect(page);

  await expect(page.getByText(mintedName, { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(`#${mintedMemberId}`).first()).toBeVisible();

  // Its chain ownership (not a local cache) is what makes it appear.
  expect(castCall('ownerOf(uint256)(address)', mintedMemberId).toLowerCase()).toBe(
    ACCOUNTS.funded.toLowerCase(),
  );

  /**
   * owner 2026-11-21：钱包**原本没有身份 NFT** 时，铸造成功后的回执要能一键
   * 「设为当前身份 NFT」，不用再绕到「我的 NFT」手动选。
   *
   * 用确定性账户 #6（种子不铸造 NFT 给它）当「真新人」：先由 #2 转给它足够的
   * TestLOVE20，再走完整「授权 → 铸造」。链上 NFT 属于一次性状态，所以这条用例
   * 任何一次跑都在「钱包无 NFT」的前提下开始。
   */
});

test('mint: 首个身份铸造成功后，回执可直接把新 NFT 设为当前身份', async ({ page }) => {
  const newcomer = '0x976EA74026E726554dB657fA54763abd0C3a0aa9'; // #6：无 NFT、无代币
  const priceHeadroom = 5_000n * 10n ** 18n;
  // #2 转给新人足够的 TestLOVE20（#2 持种子分配，余额远大于此）
  castSend('transfer(address,uint256)', newcomer, priceHeadroom.toString());
  castSend('approve(address,uint256)', MEMBER_NFT, '0');

  await installWallet(page, newcomer);
  await page.goto('/mint');
  await connect(page);
  const input = page.getByRole('textbox', { name: '给身份 NFT 起个名字' });
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(FIRST_NFT_NAME);
  await expect(page.getByText('✓ 可以用')).toBeVisible({ timeout: 10_000 });

  await expect(page.getByTestId('mint-approve')).toContainText('授权 TestLOVE20', {
    timeout: 30_000,
  });
  await page.getByTestId('mint-approve').click();
  await expect(page.getByTestId('mint-approve')).toContainText('已授权', { timeout: 30_000 });
  const mintButton = page.getByTestId('mint-submit');
  await expect(mintButton).toBeEnabled({ timeout: 30_000 });
  await mintButton.click();

  await expect(page.getByRole('heading', { name: '铸造成功' })).toBeVisible({ timeout: 30_000 });
  const setIdentity = page.getByTestId('mint-receipt-set-identity');
  await expect(setIdentity).toBeVisible();
  await expect(setIdentity).toHaveText('设为当前身份 NFT');
  // 有按钮时不再同时显示「还没有设为当前身份 NFT。」这句说明
  await expect(page.getByText('还没有设为当前身份 NFT。')).toHaveCount(0);
  await setIdentity.click();
  await expect(setIdentity).toHaveText('已设为当前身份 NFT');
  await expect(setIdentity).toBeDisabled();
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), identityCacheKey(newcomer)),
  ).not.toBeNull();
});
