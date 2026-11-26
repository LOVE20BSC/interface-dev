import { lazy } from 'react';
import { GOV_SECTION_RE, PAGE_ROUTES, pageRouteFor } from '@/app/router/page-routes';

// ADR-0001 §3 sets the first-screen budget; every secondary route lives in its own
// chunk. C5（2026-11-26）：loader 与 path 只在 `page-routes.ts` 登记一次，这里只做
// 预取与 `GovSection` 的薄壳——不再维护第二份 `path → loader` 表。

export const GovSectionPage = lazy(async () => {
  const module = await import('@/pages/gov/gov-section');
  return { default: module.GovSection };
});

export { GOV_SECTION_RE };

/**
 * Warm a route chunk on navigation intent (hover/focus/touch). It is a no-op
 * for eager routes and for paths that do not own a chunk.
 */
export function prefetchRoute(pathname: string): void {
  if (GOV_SECTION_RE.test(pathname)) {
    void import('@/pages/gov/gov-section');
    return;
  }
  const route = pageRouteFor(pathname);
  if (route !== undefined) void route.load();
}

/** 供测试与调试：所有可选懒加载分区的路径。 */
export const LAZY_ROUTE_PATHS: readonly string[] = PAGE_ROUTES.map((route) => route.path);
