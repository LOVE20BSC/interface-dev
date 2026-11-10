export const BASE_URL: string = import.meta.env.BASE_URL;

/** React Router basename: '/repo/' → '/repo', '/' → '/'. */
export const BASENAME: string = BASE_URL.replace(/\/$/, '') || '/';

/** Absolute href for plain anchors (error fallbacks, external links, 404 docs). */
export function hrefFor(path: string): string {
  const base = BASENAME === '/' ? '' : BASENAME;
  if (path === '/') return base === '' ? '/' : `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
