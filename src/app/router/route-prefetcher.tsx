import { useEffect } from 'react';
import { BASENAME } from '@/app/router/base-path';
import { prefetchRoute } from '@/app/router/lazy-routes';

/** Strip the GitHub Pages base and the trailing slash: `/repo/mint/` → `/mint`. */
function prefetchPathFor(anchor: HTMLAnchorElement): string | null {
  if (anchor.target !== '' && anchor.target !== '_self') return null;
  if (anchor.hasAttribute('download')) return null;

  let pathname: string;
  try {
    pathname = new URL(anchor.href).pathname;
  } catch {
    return null;
  }

  if (BASENAME !== '/') {
    if (pathname !== BASENAME && !pathname.startsWith(`${BASENAME}/`)) return null;
    pathname = pathname.slice(BASENAME.length) || '/';
  }
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function isSameOrigin(anchor: HTMLAnchorElement): boolean {
  try {
    return new URL(anchor.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Delegated navigation-intent prefetch. One listener in the eager shell covers
 * every internal <Link> (home cards, tabs, receipts) without each link having to
 * know which route chunk it points at. React.lazy dedupes the in-flight import.
 */
export function RoutePrefetcher() {
  useEffect(() => {
    const warmFromEvent = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isSameOrigin(anchor)) return;
      const pathname = prefetchPathFor(anchor);
      if (pathname !== null) prefetchRoute(pathname);
    };

    document.addEventListener('pointerover', warmFromEvent, { passive: true });
    document.addEventListener('focusin', warmFromEvent);
    document.addEventListener('touchstart', warmFromEvent, { passive: true });
    return () => {
      document.removeEventListener('pointerover', warmFromEvent);
      document.removeEventListener('focusin', warmFromEvent);
      document.removeEventListener('touchstart', warmFromEvent);
    };
  }, []);

  return null;
}
