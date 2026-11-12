import { describe, expect, it } from 'vitest';
import {
  ABOUT_ADDRESS_GROUPS,
  aboutExplorerAddressUrl,
  isConfiguredAddressValue,
  resolveAboutAddressGroups,
  type AboutAddressKey,
} from './about-addresses';

const ZERO = '0x0000000000000000000000000000000000000000';
const MEMBER_NFT = '0x610178dA211FEF7D417bC0e6FeD39F05609AD788';
const AIRDROP = '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6';

function fullBook(): Record<AboutAddressKey, string> {
  return Object.fromEntries(
    ABOUT_ADDRESS_GROUPS.flatMap((group) => group.entries).map((key) => [key, MEMBER_NFT]),
  ) as Record<AboutAddressKey, string>;
}

describe('about address groups', () => {
  it('places every address-book slot exactly once and keeps the owner group order', () => {
    const keys = ABOUT_ADDRESS_GROUPS.flatMap((group) => group.entries);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(22);
    expect(ABOUT_ADDRESS_GROUPS.map((group) => group.key)).toEqual([
      'core',
      'tokenIdentity',
      'trade',
      'groupChat',
      'other',
    ]);
  });

  it('keeps a zero address visible as 未配置 (undefined) instead of dropping the row', () => {
    const book = { ...fullBook(), memberNFT: ZERO, airdropDistributor: ZERO };
    const groups = resolveAboutAddressGroups(book, 'https://bscscan.com');

    const rows = groups.flatMap((group) => group.rows);
    expect(rows).toHaveLength(22);
    const member = rows.find((row) => row.key === 'memberNFT');
    const airdrop = rows.find((row) => row.key === 'airdropDistributor');
    expect(member?.address).toBeUndefined();
    expect(member?.explorerUrl).toBeNull();
    expect(airdrop?.address).toBeUndefined();
    expect(airdrop?.explorerUrl).toBeNull();
  });

  it('builds explorer links only when the deployment provides a block explorer', () => {
    const book = { ...fullBook(), memberNFT: MEMBER_NFT, airdropDistributor: AIRDROP };

    const withExplorer = resolveAboutAddressGroups(book, 'https://bscscan.com/');
    const withoutExplorer = resolveAboutAddressGroups(book, null);

    const member = withExplorer
      .flatMap((group) => group.rows)
      .find((row) => row.key === 'memberNFT');
    const airdropWithout = withoutExplorer
      .flatMap((group) => group.rows)
      .find((row) => row.key === 'airdropDistributor');

    expect(member?.address).toBe(MEMBER_NFT);
    expect(member?.explorerUrl).toBe(`https://bscscan.com/address/${MEMBER_NFT}`);
    expect(airdropWithout?.address).toBe(AIRDROP);
    expect(airdropWithout?.explorerUrl).toBeNull();
    expect(aboutExplorerAddressUrl(null, AIRDROP)).toBeNull();
  });

  it('never treats a malformed value as configured', () => {
    expect(isConfiguredAddressValue(undefined)).toBe(false);
    expect(isConfiguredAddressValue('')).toBe(false);
    expect(isConfiguredAddressValue('0x1234')).toBe(false);
    expect(isConfiguredAddressValue(ZERO)).toBe(false);
    expect(isConfiguredAddressValue(MEMBER_NFT)).toBe(true);
  });
});
