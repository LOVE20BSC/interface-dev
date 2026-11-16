import type { AirdropSnapshot } from '@/domain/airdrop-snapshot';
import { parseAirdropSnapshot, snapshotRootMatches } from '@/domain/airdrop-snapshot';

export type SnapshotLoadResult =
  | { readonly status: 'loaded'; readonly snapshot: AirdropSnapshot }
  | { readonly status: 'unavailable' }
  | { readonly status: 'error' };

interface CachedLoad {
  readonly key: string;
  readonly promise: Promise<SnapshotLoadResult>;
}

let cached: CachedLoad | null = null;

interface SnapshotSource {
  readonly merkleRoot: string;
  readonly snapshotUri: string | null | undefined;
  readonly bundled: (() => Promise<unknown>) | null;
}

async function load(source: SnapshotSource): Promise<SnapshotLoadResult> {
  let local: SnapshotLoadResult = { status: 'unavailable' };
  if (source.bundled !== null) {
    try {
      const snapshot = parseAirdropSnapshot(await source.bundled());
      local = snapshot === null ? { status: 'error' } : { status: 'loaded', snapshot };
      if (snapshot !== null && snapshotRootMatches(snapshot, source.merkleRoot)) return local;
    } catch {
      local = { status: 'error' };
    }
  }

  const uri = source.snapshotUri?.trim() ?? '';
  if (uri.length === 0) return local;
  try {
    const url = new URL(uri);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return local;
    const response = await fetch(url.toString());
    if (!response.ok) return { status: 'error' };
    const snapshot = parseAirdropSnapshot(await response.json());
    return snapshot === null ? { status: 'error' } : { status: 'loaded', snapshot };
  } catch {
    return { status: 'error' };
  }
}

// The on-chain root participates in the cache key so redeployments cannot reuse stale eligibility.
export function loadAirdropSnapshot(source: SnapshotSource): Promise<SnapshotLoadResult> {
  const key = JSON.stringify([source.merkleRoot, source.snapshotUri, source.bundled !== null]);
  if (cached !== null && cached.key === key) return cached.promise;
  const promise = load(source);
  cached = { key, promise };
  return promise;
}

export function resetAirdropSnapshotCache(): void {
  cached = null;
}
