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
  it('lists the three feature pages in owner order with stable routes', () => {
    expect(APP_CATALOG.map((entry) => entry.id)).toEqual(['airdrop', 'myNft', 'swap']);
    expect(APP_CATALOG.map((entry) => entry.route)).toEqual(['/airdrop', '/my-nft', '/swap']);
    expect(APP_CATALOG.map((entry) => entry.category)).toEqual(['token', 'identity', 'token']);
    expect(APP_CATALOG.map((entry) => entry.icon)).toEqual(['gift', 'identity', 'swap']);
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

  it('disables all three rows against an empty address book, each with its own reason', () => {
    const apps = resolveAppsCatalog({ airdrop: false, memberNFT: false, router: false });

    expect(apps.map((entry) => entry.availability)).toEqual([
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
    expect(apps.map((entry) => entry.unavailableReason)).toEqual([
      'airdropNotConfigured',
      'memberNftNotConfigured',
      'routerNotConfigured',
    ]);
  });

  it('groups by category when the catalog has at least two categories', () => {
    const groups = groupAppsByCategory(resolveAppsCatalog(ALL_CONFIGURED));

    expect(groups?.map((group) => group.category)).toEqual(['token', 'identity']);
    expect(groups?.[0]?.entries.map((entry) => entry.id)).toEqual(['airdrop', 'swap']);
    expect(groups?.[1]?.entries.map((entry) => entry.id)).toEqual(['myNft']);
  });

  it('returns null (single flat list) for one category or no entries', () => {
    const apps = resolveAppsCatalog(ALL_CONFIGURED);
    const tokenOnly = apps.filter((entry) => entry.category === 'token');
    const identityOnly = apps.filter((entry) => entry.category === 'identity');

    expect(groupAppsByCategory(tokenOnly)).toBeNull();
    expect(groupAppsByCategory(identityOnly)).toBeNull();
    expect(groupAppsByCategory([])).toBeNull();
  });
});
