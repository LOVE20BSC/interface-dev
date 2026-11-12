import { describe, expect, it } from 'vitest';
import { isAirdropConfigured, toAirdropInfo } from './airdrop-info';

const TOKEN = `0x${'11'.repeat(20)}` as const;
const ROOT = `0x${'ab'.repeat(32)}` as const;

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    tokenAddress: TOKEN,
    merkleRoot: ROOT,
    claimableFromRound: 2n,
    totalClaimedShare: 500_000_000_000_000_000n,
    totalRemainingShare: 500_000_000_000_000_000n,
    totalClaimedAmount: 500_000_000_000_000_000_000_000_000n,
    remainingAmount: 500_000_000_000_000_000_000_000_000n,
    snapshotUri: '',
    ...overrides,
  };
}

describe('toAirdropInfo', () => {
  it('normalises the decoded airdropInfo struct (one read, every per-token fact)', () => {
    const info = toAirdropInfo(fixture());
    expect(info).toEqual(fixture());
    expect(info?.claimableFromRound).toBe(2n);
    expect(info?.totalRemainingShare).toBe(500_000_000_000_000_000n);
    expect(info?.remainingAmount).toBe(500_000_000_000_000_000_000_000_000n);
    expect(info?.snapshotUri).toBe('');
  });

  it('accepts a non-empty http(s) snapshot URI for launched tokens', () => {
    const info = toAirdropInfo(
      fixture({ snapshotUri: 'https://example.com/airdrop/anvil31337_dev.json' }),
    );
    expect(info?.snapshotUri).toBe('https://example.com/airdrop/anvil31337_dev.json');
  });

  it('treats a not-yet-configured token (zero root) as an unconfigured airdrop', () => {
    const info = toAirdropInfo(fixture({ merkleRoot: `0x${'00'.repeat(32)}` }));
    expect(info).not.toBeNull();
    expect(isAirdropConfigured(info)).toBe(false);
  });

  it('rejects a malformed document instead of inventing zeros', () => {
    expect(toAirdropInfo(null)).toBeNull();
    expect(toAirdropInfo([])).toBeNull();
    expect(toAirdropInfo(fixture({ tokenAddress: '0x1234' }))).toBeNull();
    expect(toAirdropInfo(fixture({ merkleRoot: '0x1234' }))).toBeNull();
    expect(toAirdropInfo(fixture({ claimableFromRound: 2 }))).toBeNull();
    expect(toAirdropInfo(fixture({ totalRemainingShare: -1n }))).toBeNull();
    expect(toAirdropInfo(fixture({ snapshotUri: undefined }))).toBeNull();
  });
});
