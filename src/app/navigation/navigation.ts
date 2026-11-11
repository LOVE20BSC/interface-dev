import type { LucideIcon } from 'lucide-react';
import { House, ListChecks, UserRound, UsersRound, Vote } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy';

export type NavKey = 'home' | 'gov' | 'act' | 'group' | 'me';

export interface NavItem {
  readonly key: NavKey;
  readonly to: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly icon: LucideIcon;
  /** M0: only 首页 has real content; the rest are labelled placeholders. */
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
    key: 'gov',
    to: '/gov',
    label: copy.nav.gov,
    ariaLabel: copy.nav.govAria,
    icon: Vote,
    placeholder: true,
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
    key: 'group',
    to: '/group',
    label: copy.nav.group,
    ariaLabel: copy.nav.groupAria,
    icon: UsersRound,
    placeholder: true,
  },
  {
    key: 'me',
    to: '/me',
    label: copy.nav.me,
    ariaLabel: copy.nav.meAria,
    icon: UserRound,
    placeholder: true,
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
  '/gov': copy.placeholders.gov.title,
  '/act': copy.placeholders.act.title,
  '/group': copy.placeholders.group.title,
  '/me': copy.placeholders.me.title,
});

export function pageTitleFor(pathname: string): string | null {
  return PAGE_TITLES[pathname] ?? null;
}
