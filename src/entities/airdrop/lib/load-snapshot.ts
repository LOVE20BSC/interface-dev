import { parseAirdropSnapshot, type AirdropSnapshot } from '@/domain/airdrop-snapshot';

export type SnapshotLoadResult =
  | { readonly status: 'loaded'; readonly snapshot: AirdropSnapshot }
  | { readonly status: 'unavailable' }
  | { readonly status: 'error' };

interface CachedLoad {
  readonly path: string;
  readonly promise: Promise<SnapshotLoadResult>;
}

let cached: CachedLoad | null = null;

/**
 * Lazily fetches the merkle snapshot as a static same-origin file.
 *
 * It is deliberately NOT a bundled import: the home page must render identity,
 * balance and entries before this request starts (UX spec §3.1). Retry drops the
 * cached promise so a failed chunk can be re-requested.
 */
export function loadAirdropSnapshot(path: string | null): Promise<SnapshotLoadResult> {
  if (path === null) return Promise.resolve({ status: 'unavailable' });
  if (cached !== null && cached.path === path) return cached.promise;

  const url = `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
  const promise: Promise<SnapshotLoadResult> = fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error(`snapshot HTTP ${response.status}`);
      return (await response.json()) as unknown;
    })
    .then((raw): SnapshotLoadResult => {
      const snapshot = parseAirdropSnapshot(raw);
      return snapshot === null ? { status: 'error' } : { status: 'loaded', snapshot };
    })
    .catch((): SnapshotLoadResult => ({ status: 'error' }));

  cached = { path, promise };
  return promise;
}

export function resetAirdropSnapshotCache(): void {
  cached = null;
}
