import { describe, expect, it } from 'vitest';
import { documentTitleFor } from '@/app/navigation/document-title';
import { copy } from '@/shared/config/copy';
import type { CommunityDisplay } from '@/entities/community-token/model/use-community-display';

const RESOLVED: CommunityDisplay = { symbol: 'TestLOVE20', resolved: true, pending: false };
const UNRESOLVED: CommunityDisplay = {
  symbol: copy.brand.protocolLabel,
  resolved: false,
  pending: true,
};

describe('documentTitleFor', () => {
  it('uses only the community symbol on home', () => {
    expect(documentTitleFor('/', RESOLVED)).toBe('TestLOVE20');
    expect(documentTitleFor('/', UNRESOLVED)).toBe('LOVE20协议');
  });

  it('prepends the page title for secondary pages with a resolved community', () => {
    expect(documentTitleFor('/mint', RESOLVED)).toBe(
      copy.brand.pageTitle(copy.pageTitles.mint, 'TestLOVE20'),
    );
    expect(documentTitleFor('/my-nft', RESOLVED)).toBe('我的 NFT · TestLOVE20');
    expect(documentTitleFor('/about', RESOLVED)).toBe('关于 · TestLOVE20');
    expect(documentTitleFor('/theme', RESOLVED)).toBe('主题 · TestLOVE20');
    expect(documentTitleFor('/transfer', RESOLVED)).toBe('代币转账 · TestLOVE20');
    expect(documentTitleFor('/liquidity', RESOLVED)).toBe('流动性池 · TestLOVE20');
    expect(documentTitleFor('/batch-transfer', RESOLVED)).toBe('批量转账 · TestLOVE20');
    expect(documentTitleFor('/approvals', RESOLVED)).toBe('代币授权 · TestLOVE20');
  });

  it('writes only the protocol label while the community is unresolved', () => {
    expect(documentTitleFor('/mint', UNRESOLVED)).toBe('LOVE20协议');
    expect(documentTitleFor('/airdrop', UNRESOLVED)).toBe('LOVE20协议');
  });

  it('falls back to the 404 page title for unknown routes', () => {
    expect(documentTitleFor('/nope', RESOLVED)).toBe('页面不存在 · TestLOVE20');
  });

  // T006 P2-1..P2-4: these routes render a real page (placeholder or SubmitPage),
  // so the header/tab title must not say 「页面不存在」 above it.
  it('titles the placeholder domains instead of calling them a missing page', () => {
    expect(documentTitleFor('/verify', RESOLVED)).toBe('验证 · TestLOVE20');
    expect(documentTitleFor('/verify/actions', RESOLVED)).toBe('验证中的行动 · TestLOVE20');
    expect(documentTitleFor('/verify/detail', RESOLVED)).toBe('验证详情 · TestLOVE20');
    expect(documentTitleFor('/acting', RESOLVED)).toBe('社区首页 · TestLOVE20');
    expect(documentTitleFor('/acting/join', RESOLVED)).toBe('加入行动 · TestLOVE20');
    expect(documentTitleFor('/action/new', RESOLVED)).toBe('创建新行动 · TestLOVE20');
    expect(documentTitleFor('/action/info', RESOLVED)).toBe('行动详情 · TestLOVE20');
  });

  it('titles any /submit/* path as 提案 because SubmitPage renders there', () => {
    expect(documentTitleFor('/submit/anything', RESOLVED)).toBe('提案 · TestLOVE20');
  });

  it('still returns 404 for paths outside every known domain', () => {
    expect(documentTitleFor('/nope/deeper', RESOLVED)).toBe('页面不存在 · TestLOVE20');
  });
});
