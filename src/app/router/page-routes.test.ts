import { describe, expect, it } from 'vitest';
import {
  GOV_SECTION_RE,
  GOV_SECTION_ROOTS,
  GOV_SUBROUTE_TITLES,
  PAGE_ROUTES,
  pageRouteFor,
} from '@/app/router/page-routes';

/**
 * C5 的守卫：路由事实现在只有一张表，测试负责拦住「登记不全」——
 * 每条路由有标题、有 loader、有可渲染组件；治理域前缀都被单入口接住。
 */
describe('page route registry', () => {
  it('registers a title, a loader and a component for every route', () => {
    for (const route of PAGE_ROUTES) {
      expect(route.path.startsWith('/'), `${route.path} 必须以 / 开头`).toBe(true);
      expect(route.title.length, `${route.path} 缺标题`).toBeGreaterThan(0);
      expect(typeof route.load, `${route.path} 缺 loader`).toBe('function');
      expect(route.Page, `${route.path} 缺组件`).toBeTruthy();
    }
  });

  it('has no duplicate or duplicate-titled paths', () => {
    const paths = PAGE_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths, '首页与 404 由 app-router 单独处理，不要重复登记').not.toContain('/');
    expect(paths, '`*` 兜底不要登记成普通路由').not.toContain('*');
  });

  it('resolves every registered path by path', () => {
    for (const route of PAGE_ROUTES) {
      expect(pageRouteFor(route.path)?.title).toBe(route.title);
    }
    expect(pageRouteFor('/nope')).toBeUndefined();
  });

  it('keeps every governance sub-route title on a real governance prefix', () => {
    for (const path of Object.keys(GOV_SUBROUTE_TITLES)) {
      expect(GOV_SECTION_RE.test(path), `${path} 不在治理域前缀里`).toBe(true);
    }
    for (const path of Object.keys(GOV_SUBROUTE_TITLES)) {
      expect(GOV_SUBROUTE_TITLES[path]?.length, `${path} 标题为空`).toBeGreaterThan(0);
    }
  });

  it('routes every governance root through the section entry', () => {
    for (const root of GOV_SECTION_ROOTS) {
      expect(GOV_SECTION_RE.test(`/${root}`)).toBe(true);
      expect(GOV_SECTION_RE.test(`/${root}/deeper`)).toBe(true);
      expect(GOV_SECTION_RE.test(`/${root}extra`)).toBe(false);
    }
  });

  it('does not claim non-governance paths for the governance section', () => {
    for (const path of ['/', '/swap', '/me', '/apps', '/vote-records']) {
      expect(GOV_SECTION_RE.test(path), `${path} 不该进治理域`).toBe(false);
    }
  });
});
