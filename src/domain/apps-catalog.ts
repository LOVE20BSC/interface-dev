/**
 * 应用目录 (UX spec §3.6).
 *
 * `/apps` is a feature directory, not a hand-written menu: every independent
 * feature page earns one row here and no navigation code changes when the next
 * page is added. This module is pure data + pure functions (no React, no chain
 * SDK, no build config) so ordering, grouping and the disabled-entry decision
 * are all unit-testable.
 *
 * Copy lives in `shared/config/copy-pages.ts` (`copy.apps`); entries carry keys,
 * never user-facing strings. The builder resolves `availability` from the
 * address book at render time (`configuredAddress` in config/networks.ts), so a
 * deployment that lacks a target contract gets a disabled row instead of a dead
 * link.
 */

export type AppId = 'airdrop' | 'myNft' | 'swap' | 'about' | 'theme';

export type AppCategoryKey = 'token' | 'identity' | 'about' | 'settings';

/** Icon keys are stable data; the page maps them to lucide components. */
export type AppIconKey = 'gift' | 'identity' | 'swap' | 'book' | 'palette';

export type AppRoute = '/airdrop' | '/my-nft' | '/swap' | '/about' | '/theme';

export type AppAvailability = 'available' | 'unavailable';

/** Address-book slot an entry needs before it can navigate. */
export type AppAddressRequirement = 'airdrop' | 'memberNFT' | 'router';

export type AppUnavailableReasonKey =
  'airdropNotConfigured' | 'memberNftNotConfigured' | 'routerNotConfigured';

/** One reviewed catalog row. `labelKey` / `descriptionKey` index copy.apps.items. */
export interface AppCatalogEntry {
  readonly id: AppId;
  readonly labelKey: AppId;
  readonly descriptionKey: AppId;
  readonly route: AppRoute;
  readonly icon: AppIconKey;
  readonly category: AppCategoryKey;
  /**
   * Address slot this page needs. `null` means no contract dependency, so the row
   * is always available (the 关于 page is documentation + read-only data).
   */
  readonly requires: AppAddressRequirement | null;
}

/** A catalog row plus this build's availability decision. */
export interface AppEntry extends Omit<AppCatalogEntry, 'requires'> {
  readonly availability: AppAvailability;
  readonly unavailableReason?: AppUnavailableReasonKey;
}

/** Which address-book slots are configured in this build. */
export type AppAddressConfiguration = Readonly<Record<AppAddressRequirement, boolean>>;

export interface AppCategoryGroup {
  readonly category: AppCategoryKey;
  readonly entries: readonly AppEntry[];
}

const UNAVAILABLE_REASONS: Readonly<Record<AppAddressRequirement, AppUnavailableReasonKey>> =
  Object.freeze({
    airdrop: 'airdropNotConfigured',
    memberNFT: 'memberNftNotConfigured',
    router: 'routerNotConfigured',
  });

/**
 * Owner order (2026-11-11): 创世空投, 身份 NFT, 代币兑换; 开源文档 appended last
 * (2026-11-12, documents + debugging data). Category is declared per row; the
 * page groups automatically once two or more categories exist.
 */
export const APP_CATALOG: readonly AppCatalogEntry[] = Object.freeze([
  {
    id: 'airdrop',
    labelKey: 'airdrop',
    descriptionKey: 'airdrop',
    route: '/airdrop',
    icon: 'gift',
    category: 'token',
    requires: 'airdrop',
  },
  {
    id: 'myNft',
    labelKey: 'myNft',
    descriptionKey: 'myNft',
    route: '/my-nft',
    icon: 'identity',
    category: 'identity',
    requires: 'memberNFT',
  },
  {
    id: 'swap',
    labelKey: 'swap',
    descriptionKey: 'swap',
    route: '/swap',
    icon: 'swap',
    category: 'token',
    requires: 'router',
  },
  {
    id: 'about',
    labelKey: 'about',
    descriptionKey: 'about',
    route: '/about',
    icon: 'book',
    category: 'about',
    // Documentation + read-only chain data: no contract address can disable it.
    requires: null,
  },
  {
    // Owner 2026-11-14: 主题 is a local display preference, never chain-backed.
    id: 'theme',
    labelKey: 'theme',
    descriptionKey: 'theme',
    route: '/theme',
    icon: 'palette',
    category: 'settings',
    requires: null,
  },
]);

/**
 * Attach this build's availability to every catalog row, preserving owner order.
 * A missing target contract disables only that row and supplies its reason key.
 */
export function resolveAppsCatalog(configuration: AppAddressConfiguration): readonly AppEntry[] {
  return APP_CATALOG.map(({ requires, ...entry }) => {
    if (requires === null || configuration[requires]) {
      return { ...entry, availability: 'available' as const };
    }
    return {
      ...entry,
      availability: 'unavailable' as const,
      unavailableReason: UNAVAILABLE_REASONS[requires],
    };
  });
}

/**
 * The single-list vs grouped rule: return null when there is at most one
 * category (flat list), otherwise one group per category in first-appearance
 * order with rows keeping catalog order inside each group.
 */
export function groupAppsByCategory(
  entries: readonly AppEntry[],
): readonly AppCategoryGroup[] | null {
  const groups = new Map<AppCategoryKey, AppEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.category);
    if (group === undefined) groups.set(entry.category, [entry]);
    else group.push(entry);
  }
  if (groups.size < 2) return null;
  return [...groups].map(([category, groupedEntries]) => ({
    category,
    entries: groupedEntries,
  }));
}
