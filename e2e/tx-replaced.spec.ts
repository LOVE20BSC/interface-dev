import { expect, test, type Page } from '@playwright/test';
import { anvilRpc, isolateChain, restoreMining, suspendMining } from './chain';
import { connect, installWallet } from './wallet-stub';

/**
 * 交易被「同 nonce 替换」时的用户可见行为（2026-11-27）。
 *
 * 背景：钱包把已广播的交易用另一笔同 nonce 的交易顶掉，是真实链上最常见的
 * 「交易不见了」成因之一（用户自己加速/取消、或钱包自动重发）。我们的 R2 已知风险
 * 记录里就有一条「同 nonce 替换缺 gas bump」。`use-tx-watch` 为此写了 `replaced`
 * 判定：等不到收据、且钱包 nonce 已经越过这笔 → 回看最近 16 个块找同 nonce 的已上链
 * 交易。这条分支此前**只有单测**（mock client），没有在真节点上跑过。
 *
 * 这个 spec 补的正是它：
 *   1. 冻结挖矿 → 让页面提交一笔真实交易（哈希 h1、nonce N 留在 pool 里）
 *   2. 用账户 #6 直接发一笔**同 nonce、更高 gas price** 的交易把它顶掉，然后恢复挖矿
 *   3. 断言：h1 永远不会出收据；页面在截止时间内给出「纯提示卡」（无按钮无链接）、
 *      主按钮保持禁用、且**没有**发生第二次提交
 *
 * 用户可见契约（owner 2026-11-23 Q1123-4）：卡住态只解释「去哪里看」，不提供任何
 * 重试/取消按钮；确认或失败后自动更新。
 */

const NATIVE = 'ETH';
/** anvil 固定账户 #6：只有原生币，10,000 ETH。 */
const SENDER = '0x976EA74026E726554dB657fA54763abd0C3a0aa9';
/** #7，随便一个收款方；本用例要验证的是"交易没上链"，不关心它收到多少。 */
const RECIPIENT = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955';
const SYMBOL = 'TestLOVE20';

const SHORT_DEADLINE_MS = Number(process.env.VITE_TX_DEADLINE_MS ?? '');
const HAS_SHORT_DEADLINE =
  Number.isFinite(SHORT_DEADLINE_MS) && SHORT_DEADLINE_MS > 0 && SHORT_DEADLINE_MS <= 20_000;

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 180_000 });
isolateChain();

interface StubSend {
  readonly hash: string;
  readonly pinnedNonce: number | null;
}

async function stubSends(page: Page): Promise<readonly StubSend[]> {
  return (await page.evaluate(() => {
    const raw = (window as unknown as { __walletStub?: { sends: StubSend[] } }).__walletStub;
    if (raw === undefined) throw new Error('wallet stub not installed');
    return raw.sends;
  })) as readonly StubSend[];
}

async function waitForReceipt(hash: string, timeoutMs = 20_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const receipt = await anvilRpc<unknown>('eth_getTransactionReceipt', [hash]);
    if (receipt !== null) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`replacement transaction ${hash} was not mined within ${timeoutMs} ms`);
}

test('交易被同 nonce 替换：页面给纯提示卡、不重复提交、旧哈希永不出收据', async ({ page }) => {
  test.skip(
    !HAS_SHORT_DEADLINE,
    'VITE_TX_DEADLINE_MS 未设置：生产版 90 秒截止会超出测试时长（`pnpm e2e` 会自动注入 4 秒测试值）。',
  );

  await installWallet(page, SENDER);
  await page.goto(`/transfer?symbol=${SYMBOL}`);
  await connect(page);
  await expect(page.getByTestId('transfer-token')).toContainText(NATIVE, { timeout: 20_000 });
  await expect(page.getByTestId('transfer-balance')).toHaveText(`余额 10,000 ${NATIVE}`, {
    timeout: 20_000,
  });

  // 冻结挖矿：提交后交易留在 pool 里，才有机会被替换。
  await suspendMining();

  await page.getByTestId('transfer-amount').fill('0.1');
  await page.getByTestId('transfer-recipient').fill(RECIPIENT);
  await expect(page.getByTestId('transfer-submit')).toBeEnabled({ timeout: 20_000 });
  const nonceBefore = Number(await anvilRpc<string>('eth_getTransactionCount', [SENDER, 'latest']));
  await page.getByTestId('transfer-submit').click();

  // 等钱包把哈希交回来，并确认这笔带的是我们认为的那个 nonce。
  await expect.poll(async () => (await stubSends(page)).length, { timeout: 20_000 }).toBe(1);
  const first = (await stubSends(page))[0];
  expect(first).toBeDefined();
  if (first === undefined) return;
  expect(first.pinnedNonce).toBe(nonceBefore);

  // 顶掉它：同 nonce、更高 gas price、转 0 给自己的一笔"空"交易。
  const replacementHash = await anvilRpc<string>('eth_sendTransaction', [
    {
      from: SENDER,
      to: SENDER,
      value: '0x0',
      nonce: `0x${nonceBefore.toString(16)}`,
      gas: '0x5208',
      gasPrice: '0xba43b7400', // 50 gwei：远高于原交易的 effective gas price，确保能替换
    },
  ]);
  expect(replacementHash.toLowerCase()).not.toBe(first.hash.toLowerCase());

  // 恢复挖矿：替换交易上链，原交易（同 nonce）被 evict，永远不会出收据。
  await restoreMining();
  await waitForReceipt(replacementHash);

  // 页面必须从「确认中」转到纯提示卡，而不是一直转圈。
  const recovery = page.getByTestId('tx-watch-recovery');
  await expect(recovery).toBeVisible({ timeout: 40_000 });
  // 必须是 replaced（而不是截止后自然落成的 dropped/slow）：同一个卡片，内部成因不同。
  await expect(recovery).toHaveAttribute('data-status', 'replaced');
  await expect(recovery).toContainText('这笔交易还没有确认');
  await expect(recovery).toContainText('请在钱包或区块浏览器里查看');
  // 卡里带的是被顶掉那笔的短哈希（用户拿它去区块浏览器查）。
  await expect(recovery).toContainText(first.hash.slice(0, 10));
  // 纯提示卡：0 按钮 0 链接（owner Q1123-4）。
  await expect(recovery.getByRole('button')).toHaveCount(0);
  await expect(recovery.getByRole('link')).toHaveCount(0);
  await expect(page.getByTestId('tx-watch-pending')).toHaveCount(0);
  // 在途/卡住期间不能开第二笔。
  await expect(page.getByTestId('transfer-submit')).toBeDisabled();
  expect((await stubSends(page)).length).toBe(1);

  // 被替换的那笔确实永远没有收据（这正是 replaced 与 confirmed 的分界）。
  expect(await anvilRpc<unknown>('eth_getTransactionReceipt', [first.hash])).toBeNull();
  // 替换交易真实上链且成功，链上 nonce 已经越过原交易。
  const receipt = await anvilRpc<{ status: string } | null>('eth_getTransactionReceipt', [
    replacementHash,
  ]);
  expect(receipt?.status).toBe('0x1');
  expect(Number(await anvilRpc<string>('eth_getTransactionCount', [SENDER, 'latest']))).toBe(
    nonceBefore + 1,
  );

  console.log(
    `tx replaced: nonce=${nonceBefore} abandoned=${first.hash} replacement=${replacementHash} pure hint`,
  );
});
