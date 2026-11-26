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

export function pageTitleFor(pathname: string): string | null {
  const exact = PAGE_TITLES[pathname];
  if (exact !== undefined) return exact;
  // 动态路由（owner 2026-11-22）：提案投票详情 `/vote/:proposalId` 与列表同标题。
  if (pathname.startsWith('/vote/')) return copy.pageTitles.vote;
  // T006 P2-4: `/submit/*` renders `SubmitPage` (gov-section matches
  // `startsWith('/submit/')`), so it must not be titled 「页面不存在」.
  if (pathname.startsWith('/submit/')) return copy.pageTitles.submit;
  // T006 P2-1..P2-3: unknown second-level paths inside these domains still fall
  // back to the placeholder page, so they inherit its title rather than 404.
  if (/^\/verify(\/|$)/.test(pathname)) return copy.pageTitles.verify;
  if (/^\/acting(\/|$)/.test(pathname)) return copy.pageTitles.acting;
  if (/^\/action(\/|$)/.test(pathname)) return copy.pageTitles.actionInfo;
  return null;
}
