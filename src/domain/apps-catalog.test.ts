import { describe, expect, it } from 'vitest';
import {
  APP_CATALOG,
  groupAppsByCategory,
  resolveAppsCatalog,
  type AppAddressConfiguration,
} from './apps-catalog';

const ALL_CONFIGURED: AppAddressConfiguration = {
  airdrop: true,
  memberNFT: true,
  router: true,
};

describe('apps catalog', () => {
  it('lists the four feature pages in owner order with stable routes', () => {
    expect(APP_CATALOG.map((entry) => entry.id)).toEqual(['airdrop', 'myNft', 'swap', 'about']);
    expect(APP_CATALOG.map((entry) => entry.route)).toEqual([
      '/airdrop',
      '/my-nft',
      '/swap',
      '/about',
    ]);
    expect(APP_CATALOG.map((entry) => entry.category)).toEqual([
      'token',
      'identity',
      'token',
      'about',
    ]);
    expect(APP_CATALOG.map((entry) => entry.icon)).toEqual(['gift', 'identity', 'swap', 'book']);
    expect(APP_CATALOG.at(-1)?.requires).toBeNull();
  });

  it('marks every entry available when all target contracts are configured', () => {
    const apps = resolveAppsCatalog(ALL_CONFIGURED);

    expect(apps.map((entry) => entry.id)).toEqual(APP_CATALOG.map((entry) => entry.id));
    expect(apps.every((entry) => entry.availability === 'available')).toBe(true);
    expect(apps.some((entry) => 'unavailableReason' in entry)).toBe(false);
  });

  it('disables only the entry whose target contract is missing, with its reason', () => {
    const apps = resolveAppsCatalog({ ...ALL_CONFIGURED, airdrop: false });
    const airdrop = apps.find((entry) => entry.id === 'airdrop');

    expect(airdrop?.availability).toBe('unavailable');
    expect(airdrop?.unavailableReason).toBe('airdropNotConfigured');
    expect(
      apps
        .filter((entry) => entry.id !== 'airdrop')
        .every((row) => row.availability === 'available'),
    ).toBe(true);
  });

  it('disables the three contract-backed rows against an empty address book, but never 关于', () => {
    const apps = resolveAppsCatalog({ airdrop: false, memberNFT: false, router: false });

    expect(apps.map((entry) => entry.availability)).toEqual([
      'unavailable',
      'unavailable',
      'unavailable',
      'available',
    ]);
    expect(apps.map((entry) => entry.unavailableReason)).toEqual([
      'airdropNotConfigured',
      'memberNftNotConfigured',
      'routerNotConfigured',
      undefined,
    ]);
    expect(apps.at(-1)?.id).toBe('about');
  });

  it('groups by category when the catalog has at least two categories', () => {
    const groups = groupAppsByCategory(resolveAppsCatalog(ALL_CONFIGURED));

    expect(groups?.map((group) => group.category)).toEqual(['token', 'identity', 'about']);
    expect(groups?.[0]?.entries.map((entry) => entry.id)).toEqual(['airdrop', 'swap']);
    expect(groups?.[1]?.entries.map((entry) => entry.id)).toEqual(['myNft']);
    expect(groups?.[2]?.entries.map((entry) => entry.id)).toEqual(['about']);
  });

  it('returns null (single flat list) for one category or no entries', () => {
    const apps = resolveAppsCatalog(ALL_CONFIGURED);
    const tokenOnly = apps.filter((entry) => entry.category === 'token');
    const identityOnly = apps.filter((entry) => entry.category === 'identity');
    const aboutOnly = apps.filter((entry) => entry.category === 'about');

    expect(groupAppsByCategory(tokenOnly)).toBeNull();
    expect(groupAppsByCategory(identityOnly)).toBeNull();
    expect(groupAppsByCategory(aboutOnly)).toBeNull();
    expect(groupAppsByCategory([])).toBeNull();
  });
});
