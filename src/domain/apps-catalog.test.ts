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
  batchTransfer: true,
};

describe('apps catalog', () => {
  it('lists the nine feature pages in owner order with stable routes', () => {
    expect(APP_CATALOG.map((entry) => entry.id)).toEqual([
      'airdrop',
      'myNft',
      'swap',
      'transfer',
      'liquidity',
      'batchTransfer',
      'approvals',
      'about',
      'theme',
    ]);
    expect(APP_CATALOG.map((entry) => entry.route)).toEqual([
      '/airdrop',
      '/my-nft',
      '/swap',
      '/transfer',
      '/liquidity',
      '/batch-transfer',
      '/approvals',
      '/about',
      '/theme',
    ]);
    expect(APP_CATALOG.map((entry) => entry.category)).toEqual([
      'token',
      'identity',
      'token',
      'token',
      'token',
      'token',
      'token',
      'about',
      'settings',
    ]);
    expect(APP_CATALOG.map((entry) => entry.icon)).toEqual([
      'gift',
      'identity',
      'swap',
      'send',
      'liquidity',
      'batch',
      'shield',
      'book',
      'palette',
    ]);
    // 代币转账 needs no protocol contract (native + custom ERC20 suffice), and
    // 关于 / 主题 need no contract slot either.
    expect(APP_CATALOG.filter((entry) => entry.requires === null).map((entry) => entry.id)).toEqual(
      ['transfer', 'approvals', 'about', 'theme'],
    );
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

  it('disables the four contract-backed rows against an empty address book, but never 代币转账/关于/主题', () => {
    const apps = resolveAppsCatalog({
      airdrop: false,
      memberNFT: false,
      router: false,
      batchTransfer: false,
    });

    expect(apps.map((entry) => entry.availability)).toEqual([
      'unavailable',
      'unavailable',
      'unavailable',
      'available',
      'unavailable',
      'unavailable',
      'available',
      'available',
      'available',
    ]);
    expect(apps.map((entry) => entry.unavailableReason)).toEqual([
      'airdropNotConfigured',
      'memberNftNotConfigured',
      'routerNotConfigured',
      undefined,
      'routerNotConfigured',
      'batchTransferNotConfigured',
      undefined,
      undefined,
      undefined,
    ]);
    expect(apps.map((entry) => entry.id).filter((id) => id === 'about' || id === 'theme')).toEqual([
      'about',
      'theme',
    ]);
  });

  it('groups by category when the catalog has at least two categories', () => {
    const groups = groupAppsByCategory(resolveAppsCatalog(ALL_CONFIGURED));

    expect(groups?.map((group) => group.category)).toEqual([
      'token',
      'identity',
      'about',
      'settings',
    ]);
    expect(groups?.[0]?.entries.map((entry) => entry.id)).toEqual([
      'airdrop',
      'swap',
      'transfer',
      'liquidity',
      'batchTransfer',
      'approvals',
    ]);
    expect(groups?.[1]?.entries.map((entry) => entry.id)).toEqual(['myNft']);
    expect(groups?.[2]?.entries.map((entry) => entry.id)).toEqual(['about']);
    expect(groups?.[3]?.entries.map((entry) => entry.id)).toEqual(['theme']);
  });

  it('returns null (single flat list) for one category or no entries', () => {
    const apps = resolveAppsCatalog(ALL_CONFIGURED);
    const tokenOnly = apps.filter((entry) => entry.category === 'token');
    const identityOnly = apps.filter((entry) => entry.category === 'identity');
    const aboutOnly = apps.filter((entry) => entry.category === 'about');
    const settingsOnly = apps.filter((entry) => entry.category === 'settings');

    expect(groupAppsByCategory(tokenOnly)).toBeNull();
    expect(groupAppsByCategory(identityOnly)).toBeNull();
    expect(groupAppsByCategory(aboutOnly)).toBeNull();
    expect(groupAppsByCategory(settingsOnly)).toBeNull();
    expect(groupAppsByCategory([])).toBeNull();
  });
});
