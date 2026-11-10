import { describe, expect, it } from 'vitest';
import { parseSpaDeepLink, restoredUrl } from '@/app/router/restore-deep-link';

describe('GitHub Pages deep-link restoration', () => {
  it('parses ?/path&query', () => {
    expect(parseSpaDeepLink('?/my-nft&symbol=LOVE20')).toEqual({
      path: '/my-nft',
      query: 'symbol=LOVE20',
    });
  });

  it('decodes the ~and~ escaping used by 404.html', () => {
    expect(parseSpaDeepLink('?/swap&a=1~and~b=2')).toEqual({
      path: '/swap',
      query: 'a=1&b=2',
    });
  });

  it('supports the root deep link', () => {
    expect(parseSpaDeepLink('?/')).toEqual({ path: '/', query: '' });
  });

  it('ignores ordinary query strings', () => {
    expect(parseSpaDeepLink('?symbol=LOVE20')).toBeNull();
    expect(parseSpaDeepLink('')).toBeNull();
  });

  it('rebuilds a project-pages URL without losing the query or hash', () => {
    expect(restoredUrl('?/my-nft&symbol=LOVE20', '/repo/', '')).toBe('/repo/my-nft?symbol=LOVE20');
    expect(restoredUrl('?/mint', '/repo/', '#top')).toBe('/repo/mint#top');
    expect(restoredUrl('?/my-nft', '/', '')).toBe('/my-nft');
  });
});
