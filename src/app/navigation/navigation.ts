import type { LucideIcon } from 'lucide-react';
import { House, LayoutGrid, ListChecks, UserRound, Vote } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy';
import { GOV_SUBROUTE_TITLES, PAGE_ROUTES } from '@/app/router/page-routes';

export type NavKey = 'home' | 'gov' | 'act' | 'apps' | 'me';

export interface NavItem {
  readonly key: NavKey;
  readonly to: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly icon: LucideIcon;
  /** M0 placeholders: only 治理 and 行动 are still labelled 即将上线. */
  readonly placeholder: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: 'home',
    to: '/',
    label: copy.nav.home,
    ariaLabel: copy.nav.homeAria,
    icon: House,
    placeholder: false,
  },
  {
    key: 'apps',
    to: '/apps',
    label: copy.nav.apps,
    ariaLabel: copy.nav.appsAria,
    icon: LayoutGrid,
    placeholder: false,
  },
  {
    key: 'act',
    to: '/act',
    label: copy.nav.act,
    ariaLabel: copy.nav.actAria,
    icon: ListChecks,
    placeholder: true,
  },
  {
    key: 'gov',
    to: '/gov',
    label: copy.nav.gov,
    ariaLabel: copy.nav.govAria,
    icon: Vote,
    // 治理页自 2026-11-17 起是真实页面（流动性质押 + 加速质押），不再是占位页。
    placeholder: false,
  },
  {
    key: 'me',
    to: '/me',
    label: copy.nav.me,
    ariaLabel: copy.nav.meAria,
    icon: UserRound,
    placeholder: false,
  },
];

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.to === '/') return pathname === '/';
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/**
 * 标题只登记一次：独立页面在 `page-routes.ts`（与它的 chunk loader 同一行），
 * 治理域子路由在 `GOV_SUBROUTE_TITLES`。这里只保留「按 path 查标题」的查询逻辑，
 * 不再维护第二份 path 列表（C5 收口，2026-11-26）。
 */
const PAGE_TITLES: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(PAGE_ROUTES.map((route) => [route.path, route.title])),
  ...GOV_SUBROUTE_TITLES,
});

/**
 * 没登记进表的路径按「根 + 子路径」回落（等价于旧正则 `^/root(/|$)`，T006 P2-1..P2-4）：
 *
 * - 动态路由 `/vote/:proposalId` 与列表同标题；
 * - `/submit/*` 渲染 `SubmitPage`（治理域单入口），不能落「页面不存在」；
 * - `/verify` / `/acting` / `/action` 本身与它们的未知二级路径仍渲染占位页，继承占位页标题
 *   （注意 `/action` 没有登记在表里，必须由这里兜住，否则页头显示「页面不存在」）。
 *
 * 一张表而不是一串 if：再加一个域时只加一行。
 */
const PREFIX_TITLE_FALLBACKS: readonly (readonly [root: string, title: string])[] = [
  ['/vote', copy.pageTitles.vote],
  ['/submit', copy.pageTitles.submit],
  ['/verify', copy.pageTitles.verify],
  ['/acting', copy.pageTitles.acting],
  ['/action', copy.pageTitles.actionInfo],
];

export function pageTitleFor(pathname: string): string | null {
  const exact = PAGE_TITLES[pathname];
  if (exact !== undefined) return exact;
  for (const [root, title] of PREFIX_TITLE_FALLBACKS) {
    if (pathname === root || pathname.startsWith(`${root}/`)) return title;
  }
  return null;
}
