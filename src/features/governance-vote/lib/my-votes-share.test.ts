import { describe, expect, it } from 'vitest';
import { myVoteSharePercent } from './my-votes-share';

/**
 * 分母是「该提案的总票数」，不是该轮总票数（owner 2026-11-21 更正）。
 * 这些用例把两种分母**故意拉开**，证明实现用的是提案口径。
 */
describe('myVoteSharePercent', () => {
  it('分母是提案总票数：我与别人各半 → 50%', () => {
    expect(myVoteSharePercent(100n, 200n)).toBe('50');
  });

  it('同一笔票数，提案口径与该轮口径不同（证明不是除轮总票数）', () => {
    // 我在该提案 100 票；该提案总票数 400（我占 25%）；该轮总票数另算 1000（若误用会得 10%）。
    expect(myVoteSharePercent(100n, 400n)).toBe('25');
    expect(myVoteSharePercent(100n, 400n)).not.toBe('10');
  });

  it('我独占该提案 → 100%', () => {
    expect(myVoteSharePercent(100n, 100n)).toBe('100');
  });

  it('极小占比不落 0（走 share-percent 的 0.{x}yyyy 规则）', () => {
    expect(myVoteSharePercent(1n, 10_000n)).toBe('0.01');
    expect(myVoteSharePercent(1n, 1_000_000n)).toMatch(/^0\.0+\d+$/);
  });

  it('分母没读回来（-1）→ undefined，页面不显示占比', () => {
    expect(myVoteSharePercent(100n, -1n)).toBeUndefined();
  });

  it('总票数为 0 时返回 0（与 share-percent 一致）', () => {
    expect(myVoteSharePercent(0n, 0n)).toBe('0');
  });
});
