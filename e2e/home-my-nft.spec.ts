import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { anvilRpc, isolateChain, revertChain, snapshotChain } from './chain';
import {
  expectBusyButtonDuringTransition,
  recordSoftTransition,
  transitionPhases,
} from './soft-transition';
import {
  ACCOUNTS,
  MULTICALL3,
  RPC_URL,
  SEEDED_NAME,
  countSolidButtons,
  connect,
  expectHomeWordmark,
  identityCacheKey,
  installWallet,
  seedIdentity,
} from './wallet-stub';

/**
 * M0 identity-first pages against the dedicated anvil chain.
 *
 * Home is greeting + reminder feed (UX spec §3.1, owners 2026-11-11/12): the
 * page h1 greets the current identity NFT, followed by conditional reminder
 * cards; identity and balance details live in 我的. With nothing to do the page
 * is just the greeting (no footer, no filler sentence).
 */

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');

const DEPLOYMENT = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/network/anvil31337_dev/network.json'), 'utf8'),
) as {
  addresses: { pair: string; memberNFT: `0x${string}` };
};

// 地址簿已知合约（交易对）：转让抽屉的 智能资产保护 拦截对象。
const PAIR = DEPLOYMENT.addresses.pair;
const MEMBER_NFT = DEPLOYMENT.addresses.memberNFT;

test.use({
  permissions: ['clipboard-read', 'clipboard-write'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS, name), animations: 'disabled' });
}

/** Mid-transition evidence: the fade must not be fast-forwarded to its end. */
async function shotLive(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS, name), animations: 'allow' });
}

/** The page h1 greeting (never a link). */
function greeting(page: Page) {
  return page.getByRole('heading', { level: 1 });
}

/**
 * owner 2026-11-17: 点「使用此身份 NFT」时被点的卡片从当前位置移动到列表最顶部（不再整页
 * 淡出淡入）。下面的探针就是这件事的证据——300ms 的动画不可能靠一次往返轮询抓到，所以
 * 在页面里包一层 `Element.prototype.animate`，记录「谁被动画了、从哪个位移开始」。
 */
interface CardMoveAnimation {
  readonly kind: 'move' | 'emphasis';
  readonly tag: string;
  readonly tokenId: string | null;
  readonly frames: string;
  readonly durationMs: number | undefined;
  readonly easing: string | undefined;
}

async function recordCardMoves(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const records: unknown[] = [];
    (window as unknown as { __l20CardMoves?: unknown[] }).__l20CardMoves = records;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ): Animation {
      const first = Array.isArray(keyframes)
        ? (keyframes[0] as { transform?: string } | undefined)
        : undefined;
      records.push({
        kind: typeof first?.transform === 'string' ? 'move' : 'emphasis',
        tag: this.tagName,
        tokenId: this.getAttribute('data-identity-id'),
        frames: JSON.stringify(keyframes),
        durationMs: typeof options === 'object' ? options.duration : options,
        easing: typeof options === 'object' ? options.easing : undefined,
      });
      return original.call(this, keyframes, options);
    };
  });
}

async function cardMoveAnimations(page: Page): Promise<CardMoveAnimation[]> {
  return page.evaluate(
    () => (window as unknown as { __l20CardMoves?: CardMoveAnimation[] }).__l20CardMoves ?? [],
  );
}

/**
 * Records one card's `top` on every frame, starting before the click: a FLIP either
 * travels through the space between the two positions or it does not, and this is
 * what tells the two apart.
 */
async function sampleCardTrajectory(
  page: Page,
  tokenId: string,
  frames: number,
): Promise<Array<{ readonly t: number; readonly top: number }>> {
  return page.evaluate(
    ({ tokenId: id, frames: count }) =>
      new Promise<Array<{ t: number; top: number }>>((resolve) => {
        const startedAt = performance.now();
        const samples: Array<{ t: number; top: number }> = [];
        const tick = (): void => {
          const card = document.querySelector(
            `ul[aria-label="我的 NFT"] > li[data-identity-id="${id}"]`,
          );
          if (card !== null) {
            samples.push({
              t: Math.round(performance.now() - startedAt),
              top: Math.round(card.getBoundingClientRect().top),
            });
          }
          if (samples.length >= count || performance.now() - startedAt > 5_000) resolve(samples);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { tokenId, frames },
  );
}

/** Pauses the move at ~1/3 of the 300 ms so a screenshot really shows the crossing. */
async function freezeCardMoveAtMidpoint(page: Page): Promise<number> {
  return page.evaluate(() => {
    const animations = document.getAnimations().filter((animation) => {
      const effect = animation.effect;
      if (!(effect instanceof KeyframeEffect) || effect.target === null) return false;
      return effect
        .getKeyframes()
        .some((frame) => typeof (frame as { transform?: unknown }).transform === 'string');
    });
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 90;
    }
    return animations.length;
  });
}

async function resumeCardMoves(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.playState === 'paused') animation.play();
    }
  });
}

/**
 * owner 2026-11-17: 选择身份 NFT 不再走整页软过渡。The soft-transition probe records
 * every `data-transition` mutation — including plain 「idle」 ones — so the
 * assertion is that neither 「leaving」 nor 「entering」 ever appeared after the tap.
 */
async function expectNoPageFade(page: Page): Promise<void> {
  expect((await transitionPhases(page)).join(',')).not.toMatch(/leaving|entering/);
}

/**
 * The seeded chain gives the wallet under test one identity (#1), so a
 * 「card travels from below to the top」 scenario needs a second one. These anvil
 * accounts hold the rest of the seed; iterating from #4 down keeps #1/#2 — which
 * other tests in this file assert — out of the way.
 */
const SECOND_IDENTITY_DONORS = [
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', // anvil #4
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906', // anvil #3
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // anvil #2
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // anvil #1
] as const;

function padWord(value: string | bigint): string {
  const hex =
    typeof value === 'bigint' ? value.toString(16) : value.toLowerCase().replace(/^0x/, '');
  return hex.padStart(64, '0');
}

async function memberNftCall(data: string): Promise<string> {
  return anvilRpc<string>('eth_call', [{ to: MEMBER_NFT, data }, 'latest']);
}

/** Lends the wallet a second seeded identity (transferFrom on the suite chain). */
async function lendSecondIdentity(owner: string): Promise<void> {
  const balanceOf = `0x70a08231${padWord(owner)}`; // balanceOf(address)
  if (BigInt(await memberNftCall(balanceOf)) >= 2n) return;
  for (const donor of SECOND_IDENTITY_DONORS) {
    if (BigInt(await memberNftCall(`0x70a08231${padWord(donor)}`)) === 0n) continue;
    // tokenOfOwnerByIndex(address,uint256)
    const tokenId = BigInt(await memberNftCall(`0x2f745c59${padWord(donor)}${padWord(0n)}`));
    if (tokenId === 1n || tokenId === 2n) continue;
    await anvilRpc('eth_sendTransaction', [
      {
        from: donor,
        to: MEMBER_NFT,
        // transferFrom(address,address,uint256)
        data: `0x23b872dd${padWord(donor)}${padWord(owner)}${padWord(tokenId)}`,
      },
    ]);
    await expect
      .poll(async () => BigInt(await memberNftCall(balanceOf)), { timeout: 20_000 })
      .toBe(2n);
    return;
  }
  throw new Error('no seeded identity NFT left to give the wallet a second card');
}

/**
 * Runs a test body with the wallet owning two identities, then puts the chain back:
 * the file-level `isolateChain()` snapshot only reverts at the end of the file, and
 * later tests here assert 「持有 1 个身份 NFT」.
 */
async function withSecondIdentity(body: () => Promise<void>): Promise<void> {
  const snapshot = await snapshotChain();
  try {
    await lendSecondIdentity(ACCOUNTS.withIdentity);
    await body();
  } finally {
    await revertChain(snapshot);
  }
}

// Snapshot before any test touches the chain; afterAll restores it.
isolateChain();

test.beforeAll(() => {
  mkdirSync(SHOTS, { recursive: true });
});

test('home: disconnected shows the greeting, connect entry and wordmark', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await page.goto('/');

  await expect(page.getByRole('button', { name: '连接钱包' })).toHaveCount(2);
  await expect(
    page.getByText('一个钱包可以拥有多个身份 NFT，身份 NFT 才是参与凭证。'),
  ).toBeVisible();
  // Not connected still greets, and never names an identity.
  await expect(greeting(page)).toHaveText('你好');
  expect(await greeting(page).locator('a').count()).toBe(0);
  await expect(page.getByText('你还没有身份 NFT')).toHaveCount(0);
  await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
  expect(await countSolidButtons(page)).toBe(1);
  await expectHomeWordmark(page, true);

  // The old navigation rows and thin line are gone.
  await expect(page.getByTestId('home-thin-line')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '我的 NFT' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '兑换代币' })).toHaveCount(0);
  await expect(page).toHaveTitle('TestLOVE20');

  await shot(page, 'home-disconnected.png');
});

test('home: no injected wallet opens the no-wallet sheet, closed with 好的', async ({ page }) => {
  // No installWallet(): the page must offer the fallback sheet instead of a dead
  // connect button (UX spec §4.6), and its close button follows the global
  // 「好的」copy (owner 2026-11-16).
  await page.goto('/');

  const connect = page.getByRole('button', { name: '连接钱包' }).first();
  await expect(connect).toBeEnabled({ timeout: 15_000 });
  await connect.click();

  const sheet = page.getByRole('dialog', { name: '没有检测到钱包' });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByRole('button', { name: '复制本页链接' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '好的' })).toBeVisible();
  await shot(page, 'wallet-no-wallet.png');

  await sheet.getByRole('button', { name: '好的' }).click();
  await expect(sheet).toHaveCount(0);
});

test('home: wrong chain shows the red outlined switch pill, not a solid fill', async ({ page }) => {
  // EIP-1193 stub reports mainnet; the app targets 31337, so the header pill
  // must become the §1.4 outlined switch button instead of a danger fill.
  await installWallet(page, ACCOUNTS.outsider, '0x1');
  await page.goto('/');

  const connect = page.getByRole('button', { name: '连接钱包' }).first();
  await expect(connect).toBeEnabled({ timeout: 15_000 });
  await connect.click();

  const pill = page.getByRole('button', { name: '网络不对，点此切换' }).first();
  await expect(pill).toBeVisible({ timeout: 15_000 });

  const style = await pill.evaluate((node) => {
    const element = node as HTMLElement;
    const computed = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      backgroundColor: computed.backgroundColor,
      borderTopColor: computed.borderTopColor,
      borderTopWidth: computed.borderTopWidth,
      color: computed.color,
      height: rect.height,
      paddingLeft: computed.paddingLeft,
      paddingRight: computed.paddingRight,
    };
  });
  // Transparent fill, 1px red border, red text.
  expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(style.borderTopColor).toBe('rgb(220, 38, 38)');
  expect(style.borderTopWidth).toBe('1px');
  // Text uses the new --color-danger-strong token (#b91c1c in light), not the
  // --color-danger fill (#dc2626): in the dark palette #f6465d as text on the
  // card surface is 4.48:1, so danger TEXT has its own lighter token. The 1px
  // border intentionally keeps --color-danger (decorative, not text).
  expect(style.color).toBe('rgb(185, 28, 28)');
  // The md connect-pill geometry is unchanged, so the header does not jump.
  expect(style.height).toBe(44);
  expect(style.paddingLeft).toBe('16px');
  expect(style.paddingRight).toBe('16px');
  // Wrong chain counts as connected: the wordmark is gone (§1.3).
  await expectHomeWordmark(page, false);

  await shot(page, 'home-wrong-network.png');
});

test('home: connected without identity shows the 铸造身份 NFT reminder only', async ({ page }) => {
  await installWallet(page, ACCOUNTS.outsider);
  await page.goto('/');
  await connect(page);

  await expect(page.getByText('你还没有身份 NFT')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: '铸造身份 NFT' })).toHaveAttribute(
    'href',
    '/mint?symbol=TestLOVE20',
  );
  await expect(page.getByRole('link', { name: '去我的 NFT' })).toHaveCount(0);
  await expect(page.getByText('你参与了销毁活动，获得空投铸造资格')).toHaveCount(0);
  await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
  expect(await countSolidButtons(page)).toBe(1);
  await expectHomeWordmark(page, false);
  // Connected without an identity: plain 你好, no name and no balance.
  await expect(greeting(page)).toHaveText('你好');
  await expect(page.getByText(/99,799,100/)).toHaveCount(0);
  await expect(page.getByTestId('home-thin-line')).toHaveCount(0);
  await expect(page).toHaveTitle('TestLOVE20');

  await shot(page, 'home-no-identity.png');
});

test('home: the greeting names the identity NFT and survives reload', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/');
  await connect(page);

  const heading = greeting(page);
  await expect(heading).toHaveText(`你好，${SEEDED_NAME}`, { timeout: 15_000 });
  // The greeting is not a link and does not carry the balance: that is 我的.
  expect(await heading.locator('a').count()).toBe(0);
  await expect(page.getByText(/99,799,100/)).toHaveCount(0);
  await expect(page.getByText('NFT #1')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '切换身份 NFT' })).toHaveCount(0);
  await expectHomeWordmark(page, false);
  // Single line at 390 px: the h1 must not wrap.
  const box = await heading.boundingBox();
  expect(box?.height ?? 0).toBeLessThan(40);

  await shot(page, 'home-connected-with-identity.png');

  await page.reload();
  await expect(greeting(page)).toHaveText(`你好，${SEEDED_NAME}`, { timeout: 15_000 });
});

test('home: eligible wallet sees the airdrop reminder', async ({ page }) => {
  await installWallet(page, ACCOUNTS.eligible);
  await page.goto('/');
  await connect(page);

  const reminder = page.locator('section[aria-labelledby="home-reminder-airdrop"]');
  await expect(reminder).toBeVisible({ timeout: 20_000 });
  await expect(reminder.getByRole('heading')).toContainText('你有空投资格，可铸造');
  await expect(reminder.getByRole('link', { name: '空投铸造' })).toHaveAttribute(
    'href',
    '/airdrop?symbol=TestLOVE20',
  );
  // No-identity reminder comes first and owns the one filled button.
  await expect(page.getByText('你还没有身份 NFT')).toBeVisible();
  expect(await countSolidButtons(page)).toBe(1);
  await expectHomeWordmark(page, false);
  await shot(page, 'home-airdrop-eligible.png');
});

test('home: a non-eligible account never sees the airdrop reminder', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity); // claimed its share during seeding
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  const snapshotLoaded = page.waitForResponse(
    (response) => /\/assets\/airdrop-[^/]+\.js$/.test(response.url()),
    { timeout: 20_000 },
  );
  await page.goto('/');
  await connect(page);
  await snapshotLoaded;
  await expect(page.getByText('你有空投资格')).toHaveCount(0);
  // Nothing to do: greeting only, no footer and no filler sentence.
  await expect(greeting(page)).toHaveText(`你好，${SEEDED_NAME}`);
  await expect(page.getByText('现在没有需要你处理的事。')).toHaveCount(0);
  await expect(page.locator('section[aria-labelledby^="home-reminder"]')).toHaveCount(0);
});

test('wallet menu: identity row agrees with the pill when the chain is unreachable', async ({
  page,
}) => {
  // Let the identity validate once, then cut the RPC and reload: the persisted
  // tokenId is still cached, but it is not a fact until ownerOf() revalidates.
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/');
  await connect(page);
  await expect(greeting(page)).toHaveText(`你好，${SEEDED_NAME}`, { timeout: 15_000 });

  await page.route(RPC_URL, (route) => route.abort());
  await page.reload();
  await connect(page);

  const pill = page.getByRole('button', { name: '打开钱包与身份 NFT 菜单' });
  // The pill degrades to 「—」 because the identity is unvalidated.
  await expect(pill).toContainText('—', { timeout: 30_000 });
  await expect(pill).not.toContainText(SEEDED_NAME);
  await pill.click();

  const sheet = page.getByRole('dialog', { name: '钱包与身份 NFT' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('身份 NFT 暂时读不到')).toBeVisible({ timeout: 30_000 });
  await expect(sheet.getByText('网络可能不稳，身份 NFT 没有变化。')).toBeVisible();
  // No confident cached name/id and no entry to an NFT page that can only error.
  await expect(sheet.getByText(SEEDED_NAME)).toHaveCount(0);
  await expect(sheet.getByText(/^NFT #/)).toHaveCount(0);
  // The identity row's action is now 「切换」 (was 查看NFT); in the error state it
  // must not render, otherwise the negative assertion above is vacuously true.
  await expect(sheet.getByText('切换')).toHaveCount(0);
  expect(await sheet.locator('a[href^="/my-nft"]').count()).toBe(0);

  await shot(page, 'wallet-menu-identity-error.png');
});

test('my-nft: tapping 使用此身份 NFT moves the card to the top of the list', async ({ page }) => {
  await recordSoftTransition(page);
  await recordCardMoves(page);
  await withSecondIdentity(async () => {
    await installWallet(page, ACCOUNTS.withIdentity);
    await page.goto('/my-nft?symbol=TestLOVE20');
    await connect(page);

    await expect(page.getByText('持有 2 个身份 NFT')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: '当前身份 NFT' })).toHaveCount(0);

    const list = page.getByRole('list', { name: '我的 NFT' });
    const cards = list.locator('li[data-identity-id]');
    await expect(cards).toHaveCount(2);
    // The card that has to travel: the second one (order is memberId ascending until
    // one of them becomes current).
    const movedTokenId = await cards.nth(1).getAttribute('data-identity-id');
    if (movedTokenId === null) throw new Error('the second card has no identity id');
    const listTop = Math.round((await cards.nth(0).boundingBox())?.y ?? -1);
    const cardTop = Math.round((await cards.nth(1).boundingBox())?.y ?? -1);
    expect(cardTop).toBeGreaterThan(listTop);
    await shot(page, 'my-nft-list.png');

    // Start sampling before the click: this trajectory is the proof that the card
    // travels instead of teleporting to the top.
    const trajectory = sampleCardTrajectory(page, movedTokenId, 40);
    await cards.nth(1).getByRole('button', { name: '使用此身份 NFT' }).click();
    // One mid-move frame for the screenshot (the old 整页淡出 frame is gone).
    await expect.poll(() => freezeCardMoveAtMidpoint(page)).toBeGreaterThan(0);
    await shotLive(page, 'my-nft-selecting.png');
    await resumeCardMoves(page);

    // 忙碌态保留：按钮在移动期间 aria-busy（「切换中…」），防重复点击。
    await expectBusyButtonDuringTransition(page);

    // The tapped card was the one animated, and it started from its old offset:
    // translateY(+(old top − new top)) → 0 is exactly FLIP.
    const moves = (await cardMoveAnimations(page)).filter(
      (entry) => entry.kind === 'move' && entry.tokenId === movedTokenId,
    );
    expect(moves).toHaveLength(1);
    const move = moves[0];
    if (move === undefined) throw new Error('the card move animation was not recorded');
    expect(move.tag).toBe('LI');
    expect(move.durationMs).toBe(300);
    expect(move.easing).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
    const delta = Number(/translateY\((-?[\d.]+)px\)/.exec(move.frames)?.[1] ?? 0);
    expect(delta).toBeGreaterThan(40);
    expect(Math.abs(delta - (cardTop - listTop))).toBeLessThanOrEqual(2);

    // The measured trajectory: starts where the card was, never leaves the list,
    // passes through the space in between, and settles on the top position. The
    // elapsed time between the first and the last movement rules out a teleport.
    const samples = await trajectory;
    expect(samples.length).toBeGreaterThan(10);
    expect(samples[0]?.top).toBe(cardTop);
    expect(samples[samples.length - 1]?.top).toBe(listTop);
    const intermediate = samples.filter(
      (sample) => sample.top < cardTop - 2 && sample.top > listTop + 2,
    );
    expect(intermediate.length).toBeGreaterThan(0);
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1]?.top ?? cardTop;
      const current = samples[index]?.top ?? cardTop;
      expect(current).toBeLessThanOrEqual(previous + 1);
      expect(current).toBeGreaterThanOrEqual(listTop - 1);
    }
    const moving = samples.filter((sample) => sample.top < cardTop - 2);
    expect((moving[moving.length - 1]?.t ?? 0) - (moving[0]?.t ?? 0)).toBeGreaterThanOrEqual(100);

    // The moved card is now the first item and carries the current state.
    await expect(cards.first()).toHaveAttribute('data-identity-id', movedTokenId);
    await expect(list.getByText('当前', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '当前身份 NFT' })).toBeDisabled();
    // No page-level fade: the card's own move is the whole transition.
    await expectNoPageFade(page);
    // No wallet confirmation appeared: selection is a local cache write.
    await expect(page.getByRole('button', { name: '打开钱包与身份 NFT 菜单' })).toBeVisible();
    await expect(page.getByText('身份 NFT 暂时读不到')).toHaveCount(0);
    await shot(page, 'my-nft-selected.png');

    await page.reload();
    await expect(
      page.getByRole('list', { name: '我的 NFT' }).getByText('当前', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test('my-nft: 1280×800 dark selection puts the row on top without the page fade', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await recordSoftTransition(page);
  await recordCardMoves(page);
  await withSecondIdentity(async () => {
    await installWallet(page, ACCOUNTS.withIdentity);
    await page.addInitScript(() => {
      window.localStorage.setItem('love20:theme', 'dark');
    });
    await page.goto('/my-nft');
    await connect(page);

    const rows = page.getByRole('table').locator('tbody tr[data-identity-id]');
    await expect(rows).toHaveCount(2, { timeout: 20_000 });
    const movedTokenId = await rows.nth(1).getAttribute('data-identity-id');
    if (movedTokenId === null) throw new Error('the second row has no identity id');
    const listTop = Math.round((await rows.nth(0).boundingBox())?.y ?? -1);
    const rowTop = Math.round((await rows.nth(1).boundingBox())?.y ?? -1);
    expect(rowTop).toBeGreaterThan(listTop);

    await rows.nth(1).getByRole('button', { name: '使用此身份 NFT' }).click();
    await shotLive(page, 'my-nft-selecting-dark-desktop.png');

    // Desktop fallback (documented in the delivery): a `<tr>` cannot be transformed
    // reliably across browsers, so the table never moves — the row re-orders at once
    // and a brand tint pulse carries the emphasis. Both halves are asserted here.
    await expect
      .poll(
        async () =>
          (await cardMoveAnimations(page)).filter(
            (entry) =>
              entry.kind === 'emphasis' && entry.tag === 'TR' && entry.tokenId === movedTokenId,
          ).length,
      )
      .toBe(1);
    expect((await cardMoveAnimations(page)).filter((entry) => entry.kind === 'move')).toEqual([]);
    const [emphasis] = (await cardMoveAnimations(page)).filter(
      (entry) => entry.kind === 'emphasis' && entry.tag === 'TR',
    );
    if (emphasis === undefined) throw new Error('the row highlight animation was not recorded');
    expect(emphasis.frames).toContain('backgroundColor');
    expect(emphasis.durationMs).toBe(620);

    await expect(rows.first()).toHaveAttribute('data-identity-id', movedTokenId);
    const settledTop = Math.round((await rows.first().boundingBox())?.y ?? -1);
    expect(settledTop).toBe(listTop);
    expect(settledTop).toBeLessThan(rowTop);
    // No page-level fade either: the switch is instant for the table, not a blink.
    await expectNoPageFade(page);

    const table = page.getByRole('table');
    await expect(table.getByText('当前', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: '当前身份 NFT' })).toBeDisabled();
  });
});

test('identity cache is cleared when ownerOf belongs to someone else', async ({ page }) => {
  // Account #5 has no NFT, but a tokenId owned by account #0 is cached.
  await installWallet(page, ACCOUNTS.eligible);
  await seedIdentity(page, ACCOUNTS.eligible, '1');
  await page.goto('/');
  await connect(page);

  // Home no longer renders the neutral invalidation notice; it falls back to
  // the no-identity reminder and a plain greeting. The cache is the proof.
  await expect(page.getByText('你还没有身份 NFT')).toBeVisible({ timeout: 15_000 });
  await expect(greeting(page)).toHaveText('你好');
  await expect(page.getByText(`你好，${SEEDED_NAME}`)).toHaveCount(0);
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

  // Empty state: no summary bar above the card (「持有 0 个身份 NFT」 was the same
  // fact as 「你还没有身份 NFT。」).
  await expect(page.getByText('你还没有身份 NFT。')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('持有 0 个身份 NFT')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '铸造身份 NFT' })).toHaveAttribute('href', '/mint');
});

test('my-nft: md+ renders the 编号/名称/操作 table', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/my-nft');
  await connect(page);

  await expect(page.getByRole('columnheader', { name: 'NFT 编号' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('columnheader', { name: '名称' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '操作' })).toBeVisible();
  await expect(page.getByRole('cell', { name: SEEDED_NAME })).toBeVisible();
});

test('my-nft: transfer drawer warns and rejects the current wallet', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/my-nft');
  await connect(page);

  await page.getByRole('button', { name: '转让' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // The terminology pass may word this as 身份 NFT; the two owner-approved
  // promises (irreversible, history/stake move with the NFT) must stay.
  await expect(page.getByText(/转让会改变这个身份/)).toBeVisible();
  await expect(page.getByText(/历史与质押/)).toBeVisible();
  // owner 2026-11-16 纠正方向：历史与质押绑定在身份 NFT 上，是随 NFT 一起转
  // 到对方钱包（旧句「不随钱包转走」会被读成留在原钱包）。
  await expect(page.getByText(/随身份 NFT 一起转到对方钱包/)).toBeVisible();
  // Owner 2026-11-14: the redundant 「转让不可撤销」 line is gone; the asset
  // protection sentences stay.
  await expect(page.getByText(/转让不可撤销/)).toHaveCount(0);
  await page.getByPlaceholder('0x 开头的 40 位地址').fill(ACCOUNTS.withIdentity);
  await expect(page.getByText('不能转让给自己。')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认转让' })).toBeDisabled();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('my-nft: 智能资产保护 与代币转账共享，已知合约被拦截', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/my-nft');
  await connect(page);

  await page.getByRole('button', { name: '转让' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // 默认开启，与 /transfer 同一个偏好。
  await expect(dialog.getByTestId('asset-protection-toggle')).toHaveAttribute(
    'aria-checked',
    'true',
  );

  const input = page.getByTestId('transfer-recipient-input');
  await input.fill(PAIR);
  await expect(page.getByTestId('transfer-identity-protection')).toContainText(
    '智能资产保护已拦截：这是「交易对」合约地址',
  );
  await expect(page.getByRole('button', { name: '确认转让' })).toBeDisabled();
  await shot(page, 'transfer-drawer-protection.png');

  // 关闭开关 = 只跳过「是不是地址簿已知合约」（owner 2026-11-16）：已知合约块
  // 与勾选都不再出现，同一地址按任意合约只警告，转让恢复可用（基础校验仍在）。
  await dialog.getByTestId('asset-protection-toggle').click();
  await expect(page.getByTestId('transfer-identity-protection')).toHaveCount(0);
  await expect(page.getByTestId('transfer-identity-contract-warning')).toContainText(
    '这个地址是一个合约',
    { timeout: 20_000 },
  );
  await expect(page.getByRole('button', { name: '确认转让' })).toBeEnabled();
  await shot(page, 'transfer-drawer-protection-off.png');

  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('my-nft: transfer recipient can be an address or an identity NFT', async ({ page }) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/my-nft');
  await connect(page);

  await page.getByRole('button', { name: '转让' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('收款人', { exact: true })).toBeVisible();

  // Default is 按地址: same 0x input as before, with the mode selector on the left.
  const modeTrigger = page.getByTestId('transfer-mode-trigger');
  await expect(modeTrigger).toContainText('按地址');
  await expect(page.getByPlaceholder('0x 开头的 40 位地址')).toBeVisible();
  await shot(page, 'transfer-drawer-address-mode.png');

  // Switch to 按身份 NFT with the compact menu (not a second full-screen sheet).
  await modeTrigger.click();
  await page.getByTestId('transfer-mode-member').click();
  await expect(modeTrigger).toContainText('按身份 NFT');
  const input = page.getByTestId('transfer-recipient-input');
  await expect(input).toHaveAttribute('placeholder', '#身份 NFT 编号');

  // Invalid id: specific copy, CTA disabled.
  await input.fill('abc');
  await expect(page.getByText('请输入身份 NFT 编号，例如 #12。')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认转让' })).toBeDisabled();

  // Own identity NFT: reading ownerOf() returns the connected wallet.
  await input.fill('#1');
  await expect(page.getByText('这是你自己的身份 NFT。')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: '确认转让' })).toBeDisabled();

  // A seeded identity NFT owned by another wallet resolves to its owner; the
  // confirmation line shows the short address and the transfer becomes possible.
  await input.fill('#2');
  const resolved = page.getByTestId('transfer-recipient-resolved');
  await expect(resolved).toBeVisible({ timeout: 15_000 });
  await expect(resolved).toContainText('收款人：0x7099');
  // 抽屉里的 owner 地址同样走全局地址组件：点击复制完整地址。
  await resolved.getByRole('button').click();
  await expect(resolved).toContainText('已复制');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  await expect(page.getByRole('button', { name: '确认转让' })).toBeEnabled();
  await shot(page, 'transfer-drawer-member-mode.png');

  // No transfer is sent: cancel leaves the drawer and the list untouched.
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
  await expect(page.getByText('持有 1 个身份 NFT')).toBeVisible({ timeout: 15_000 });

  // aggregate3((address,bool,bytes)[]) selector 0x82ad56cb, sent to the
  // Multicall3 address from the address book.
  const batched = calls.some(
    (body) => body.includes(MULTICALL3.toLowerCase()) && body.includes('0x82ad56cb'),
  );
  expect(batched).toBe(true);
});

test('my-nft: transfer recipient can be resolved by identity name with a confirmation gate', async ({
  page,
}) => {
  await installWallet(page, ACCOUNTS.withIdentity);
  await seedIdentity(page, ACCOUNTS.withIdentity, '1');
  await page.goto('/my-nft');
  await connect(page);

  await page.getByRole('button', { name: '转让' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Third recipient mode: 按身份 NFT 名字. The id and address modes are unchanged.
  const modeTrigger = page.getByTestId('transfer-mode-trigger');
  await modeTrigger.click();
  await page.getByTestId('transfer-mode-name').click();
  await expect(modeTrigger).toContainText('按身份 NFT 名字');

  const input = page.getByTestId('transfer-recipient-input');
  await expect(input).toHaveAttribute('placeholder', '身份 NFT 名字');
  await input.fill('Testdev-member-1');

  // Enumerating names resolves the id and its current owner (anvil #2, 0x7099…).
  const confirmation = page.getByTestId('transfer-name-confirmation');
  await expect(confirmation).toBeVisible({ timeout: 15_000 });
  await expect(confirmation).toContainText('名称「Testdev-member-1」→ 身份 NFT #2');
  await expect(confirmation).toContainText('收款人 0x7099');
  await expect(confirmation).toContainText('名称不是唯一依据');

  // The point of the mode: a resolved name alone can never enable 转让.
  const confirm = page.getByRole('button', { name: '确认转让' });
  await expect(confirm).toBeDisabled();
  await shot(page, 'transfer-drawer-name-mode.png');

  await page.getByTestId('transfer-name-ack').check();
  await expect(confirm).toBeEnabled();

  // No transfer is sent: cancel leaves the drawer and the list untouched.
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
