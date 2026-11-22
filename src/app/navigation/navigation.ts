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
});

export function pageTitleFor(pathname: string): string | null {
  const exact = PAGE_TITLES[pathname];
  if (exact !== undefined) return exact;
  // 动态路由（owner 2026-11-22）：提案投票详情 `/vote/:proposalId` 与列表同标题。
  if (pathname.startsWith('/vote/')) return copy.pageTitles.vote;
  return null;
}
