import { pageTitleFor } from '@/app/navigation/navigation';
import { copy } from '@/shared/config/copy';
import type { CommunityDisplay } from '@/entities/community-token/model/use-community-display';

/**
 * UX spec §1.3 tab-title rule:
 * - home: the community symbol(), or the protocol label when unresolved;
 * - other pages with a community: `<page> · <symbol>`;
 * - no resolved community: only the protocol label (never a raw brand name).
 */
export function documentTitleFor(pathname: string, community: CommunityDisplay): string {
  if (pathname === '/') return community.symbol;
  if (!community.resolved) return copy.brand.protocolLabel;
  const page = pageTitleFor(pathname) ?? copy.notFound.title;
  return copy.brand.pageTitle(page, community.symbol);
}
