import { describe, expect, it } from 'vitest';
import { pageTitleFor } from '@/app/navigation/navigation';
import { copy } from '@/shared/config/copy';

/**
 * 标题查询（C5 + T006 P2）。
 *
 * 独立页面与治理域子路由的标题在表里；这里只钉「按 path 查标题」的查询逻辑，
 * 重点是前缀回落表：动态路由与占位页的深层路径不能落到 null（否则页头显示
 * 「页面不存在」而正文是正常页面——T006 走查抓到的 P2）。
 */
describe('pageTitleFor', () => {
  it('finds exact titles registered in the route table', () => {
    expect(pageTitleFor('/mint')).toBe(copy.pageTitles.mint);
    expect(pageTitleFor('/swap')).toBe(copy.pageTitles.swap);
    expect(pageTitleFor('/gov')).toBe(copy.pageTitles.gov);
    expect(pageTitleFor('/stake/liquidity')).toBe(copy.pageTitles.stakeLiquidity);
  });

  it('falls back by prefix for dynamic routes and placeholder sub-paths', () => {
    // 动态投票详情与列表同标题。
    expect(pageTitleFor('/vote/123')).toBe(copy.pageTitles.vote);
    // /submit/* 渲染真实 SubmitPage，不能落「页面不存在」。
    expect(pageTitleFor('/submit/whatever')).toBe(copy.pageTitles.submit);
    // 未知二级路径仍渲染占位页，继承占位页标题。
    expect(pageTitleFor('/verify/whatever')).toBe(copy.pageTitles.verify);
    expect(pageTitleFor('/acting/whatever')).toBe(copy.pageTitles.acting);
    expect(pageTitleFor('/action/whatever')).toBe(copy.pageTitles.actionInfo);
  });

  it('also covers the bare domain root when it is not registered (regression: /action)', () => {
    // 旧实现是正则 `^/action(/|$)`，`/action` 本身（无尾斜杠）也被兜住；改成
    // startsWith('/action/') 后会漏掉它——页头显示「页面不存在」而正文是占位页。
    expect(pageTitleFor('/action')).toBe(copy.pageTitles.actionInfo);
    expect(pageTitleFor('/verify')).toBe(copy.pageTitles.verify);
    expect(pageTitleFor('/acting')).toBe(copy.pageTitles.acting);
    expect(pageTitleFor('/vote')).toBe(copy.pageTitles.vote);
  });

  it('returns null for unknown paths so callers can fall back to 404 copy', () => {
    expect(pageTitleFor('/nope')).toBeNull();
    expect(pageTitleFor('/swap/extra')).toBeNull();
  });
});
