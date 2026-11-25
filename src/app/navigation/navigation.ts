import type { LucideIcon } from 'lucide-react';
import { House, LayoutGrid, ListChecks, UserRound, Vote } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy';

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

const PAGE_TITLES: Readonly<Record<string, string>> = Object.freeze({
  '/my-nft': copy.pageTitles.myNft,
  '/mint': copy.pageTitles.mint,
  '/airdrop': copy.pageTitles.airdrop,
  '/swap': copy.pageTitles.swap,
  '/transfer': copy.pageTitles.transfer,
  '/liquidity': copy.pageTitles.liquidity,
  '/batch-transfer': copy.pageTitles.batchTransfer,
  '/approvals': copy.pageTitles.approvals,
  '/apps': copy.pageTitles.apps,
  '/about': copy.pageTitles.about,
  '/gov': copy.pageTitles.gov,
  '/stake/liquidity': copy.pageTitles.stakeLiquidity,
  '/stake/staketoken': copy.pageTitles.stakeToken,
  '/stake/unstake': copy.pageTitles.unstake,
  '/stake/liquid': copy.pageTitles.stakeLiquid,
  '/vote': copy.pageTitles.vote,
  '/vote/records': copy.pageTitles.voteRecords,
  '/submit': copy.pageTitles.submit,
  '/submit/new': copy.pageTitles.submitNew,
  '/gov/rewards': copy.pageTitles.rewards,
  '/gov/proposal-rewards': copy.pageTitles.proposalRewards,
  '/act': copy.placeholders.act.title,
  '/group': copy.placeholders.group.title,
  '/me': copy.placeholders.me.title,
  '/theme': copy.pageTitles.theme,
  // T006 P2-1..P2-3: placeholder routes are real pages (`gov-placeholder`), so
  // they need real titles; without these the header fell back to
  // `copy.notFound.title` and said 「页面不存在」 above a normal page.
  // Titles mirror the cards rendered by GovPlaceholderPage
  // (`copy.gov.placeholders[*].title`); a coarse per-domain title would put a
  // different heading above the page than the page itself shows.
  '/verify': copy.pageTitles.verify,
  '/verify/actions': copy.pageTitles.verifyActions,
  '/verify/action': copy.pageTitles.verify,
  '/verify/detail': copy.pageTitles.verifyDetail,
  '/acting': copy.pageTitles.acting,
  '/acting/join': copy.pageTitles.actingJoin,
  '/action/new': copy.pageTitles.actionNew,
  '/action/info': copy.pageTitles.actionInfo,
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
