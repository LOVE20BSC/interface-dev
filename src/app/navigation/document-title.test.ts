import { describe, expect, it } from 'vitest';
import { documentTitleFor } from '@/app/navigation/document-title';
import { copy } from '@/shared/config/copy';
import type { CommunityDisplay } from '@/entities/community-token/model/use-community-display';

const RESOLVED: CommunityDisplay = { symbol: 'TestLOVE20', resolved: true };
const UNRESOLVED: CommunityDisplay = { symbol: copy.brand.protocolLabel, resolved: false };

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
  });

  it('writes only the protocol label while the community is unresolved', () => {
    expect(documentTitleFor('/mint', UNRESOLVED)).toBe('LOVE20协议');
    expect(documentTitleFor('/airdrop', UNRESOLVED)).toBe('LOVE20协议');
  });

  it('falls back to the 404 page title for unknown routes', () => {
    expect(documentTitleFor('/nope', RESOLVED)).toBe('页面不存在 · TestLOVE20');
  });
});
