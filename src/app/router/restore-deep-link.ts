/**
 * SPA deep-link restoration for GitHub Pages.
 *
 * 404.html rewrites /repo/my-nft?symbol=LOVE20 into
 * /repo/?/my-nft&symbol=LOVE20. This module turns that back into the real URL
 * once, before React Router mounts, using history.replaceState.
 */
export interface DeepLinkParts {
  readonly path: string;
  readonly query: string;
}

export function parseSpaDeepLink(search: string): DeepLinkParts | null {
  if (!search.startsWith('?/')) return null;
  const raw = search.slice(2);
  const [rawPath = '', ...rawQuery] = raw.split('&');
  const decodedPath = rawPath.replace(/~and~/g, '&');
  const decodedQuery = rawQuery.join('&').replace(/~and~/g, '&');
  const path = `/${decodedPath.replace(/^\/+/, '')}`;
  return { path, query: decodedQuery };
}

/** Returns the restored URL (path + query + hash) or null when not a deep link. */
export function restoredUrl(search: string, pathname: string, hash: string): string | null {
  const parts = parseSpaDeepLink(search);
  if (parts === null) return null;
  const basePath = pathname.replace(/\/$/, '');
  const path = parts.path === '/' ? '/' : parts.path;
  const query = parts.query.length > 0 ? `?${parts.query}` : '';
  return `${basePath}${path}${query}${hash}`;
}

export function restoreSpaDeepLink(): void {
  if (typeof window === 'undefined') return;
  const target = restoredUrl(
    window.location.search,
    window.location.pathname,
    window.location.hash,
  );
  if (target === null) return;
  window.history.replaceState(null, '', target);
}
