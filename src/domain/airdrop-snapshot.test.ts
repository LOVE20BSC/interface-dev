import { describe, expect, it } from 'vitest';
import {
  findSnapshotEntry,
  isAirdropEligible,
  parseAirdropSnapshot,
  snapshotRootMatches,
} from './airdrop-snapshot';

const ROOT = `0x${'ab'.repeat(32)}`;
const ACCOUNT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const fixture = {
  sourceChainId: '31337',
  sourceBlockNumber: '1',
  sourceBurnAddress: '0x00000000000000000000000000000000C0FFEE01',
  merkleRoot: ROOT,
  totalShare: '1000000000000000000',
  accountCount: '1',
  entries: [
    {
      account: ACCOUNT,
      share: '100000000000000000',
      proof: [`0x${'cd'.repeat(32)}`],
    },
  ],
};

describe('parseAirdropSnapshot', () => {
  it('parses entries and builds a case-insensitive index', () => {
    const snapshot = parseAirdropSnapshot(fixture);
    expect(snapshot).not.toBeNull();
    if (snapshot === null) return;
    expect(snapshot.merkleRoot).toBe(ROOT);
    expect(snapshot.sourceChainId).toBe(31337);
    expect(snapshot.entries).toHaveLength(1);
    expect(findSnapshotEntry(snapshot, ACCOUNT.toLowerCase())?.share).toBe(100000000000000000n);
  });

  it.each([
    ['missing entries', { ...fixture, entries: [] }],
    ['bad root', { ...fixture, merkleRoot: '0x1234' }],
    ['bad address', { ...fixture, entries: [{ ...fixture.entries[0], account: '0x1234' }] }],
    ['bad share', { ...fixture, entries: [{ ...fixture.entries[0], share: '0' }] }],
    ['bad proof node', { ...fixture, entries: [{ ...fixture.entries[0], proof: ['0xzz'] }] }],
  ])('rejects %s', (_label, value) => {
    expect(parseAirdropSnapshot(value)).toBeNull();
  });

  it('rejects duplicate accounts instead of silently keeping one', () => {
    const duplicated = { ...fixture, entries: [fixture.entries[0], fixture.entries[0]] };
    expect(parseAirdropSnapshot(duplicated)).toBeNull();
  });
});

describe('snapshotRootMatches', () => {
  const snapshot = parseAirdropSnapshot(fixture);

  it('accepts only the exact on-chain root, case-insensitively', () => {
    if (snapshot === null) throw new Error('fixture must parse');
    expect(snapshotRootMatches(snapshot, ROOT)).toBe(true);
    expect(snapshotRootMatches(snapshot, ROOT.toUpperCase().replace('0X', '0x'))).toBe(true);
    expect(snapshotRootMatches(snapshot, `0x${'ef'.repeat(32)}`)).toBe(false);
    expect(snapshotRootMatches(snapshot, null)).toBe(false);
    expect(snapshotRootMatches(snapshot, undefined)).toBe(false);
  });
});

describe('isAirdropEligible', () => {
  it('requires an entry, an unclaimed share and a positive amount', () => {
    expect(isAirdropEligible({ hasEntry: true, claimed: false, claimableAmount: 1n })).toBe(true);
    expect(isAirdropEligible({ hasEntry: false, claimed: false, claimableAmount: 1n })).toBe(false);
    expect(isAirdropEligible({ hasEntry: true, claimed: true, claimableAmount: 1n })).toBe(false);
    expect(isAirdropEligible({ hasEntry: true, claimed: false, claimableAmount: 0n })).toBe(false);
  });
});
