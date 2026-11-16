import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '@/config/network/anvil31337_dev/airdrop.json';
import { snapshotRootMatches } from '@/domain/airdrop-snapshot';
import { loadAirdropSnapshot, resetAirdropSnapshotCache } from './load-snapshot';

const URI = 'https://example.com/airdrop.json';
const ROOT = fixture.merkleRoot;

describe('local-first snapshot loading', () => {
  beforeEach(resetAirdropSnapshotCache);
  afterEach(() => vi.unstubAllGlobals());

  it('uses the matching local file even when the remote site is unavailable', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    const result = await loadAirdropSnapshot({
      merkleRoot: ROOT,
      snapshotUri: URI,
      bundled: async () => ({ ...fixture, sourceChainId: '1' }),
    });
    expect(result.status).toBe('loaded');
    if (result.status === 'loaded') expect(result.snapshot.sourceChainId).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['missing', 'mismatch', 'malformed', 'unavailable'])(
    'falls back when local is %s',
    async (state) => {
      const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => fixture });
      vi.stubGlobal('fetch', fetch);
      const bundled =
        state === 'missing'
          ? null
          : async () => {
              if (state === 'unavailable') throw new Error('chunk unavailable');
              if (state === 'malformed') return {};
              return { ...fixture, merkleRoot: `0x${'ab'.repeat(32)}` };
            };
      const result = await loadAirdropSnapshot({ merkleRoot: ROOT, snapshotUri: URI, bundled });
      expect(result.status).toBe('loaded');
      expect(fetch).toHaveBeenCalledExactlyOnceWith(URI);
    },
  );

  it('keeps a mismatched remote snapshot ineligible and refreshes the cache for a changed root', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => fixture });
    vi.stubGlobal('fetch', fetch);
    await loadAirdropSnapshot({ merkleRoot: ROOT, snapshotUri: URI, bundled: null });
    const changedRoot = `0x${'ab'.repeat(32)}`;
    const result = await loadAirdropSnapshot({
      merkleRoot: changedRoot,
      snapshotUri: URI,
      bundled: null,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('loaded');
    if (result.status === 'loaded')
      expect(snapshotRootMatches(result.snapshot, changedRoot)).toBe(false);
  });

  it('supports older deployments with no URI and rejects non-http fallback links', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(
      (
        await loadAirdropSnapshot({
          merkleRoot: ROOT,
          snapshotUri: '',
          bundled: async () => fixture,
        })
      ).status,
    ).toBe('loaded');
    expect(
      (
        await loadAirdropSnapshot({
          merkleRoot: ROOT,
          snapshotUri: 'javascript:alert(1)',
          bundled: null,
        })
      ).status,
    ).toBe('unavailable');
    expect(fetch).not.toHaveBeenCalled();
  });
});
