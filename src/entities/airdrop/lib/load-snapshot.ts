import type { AirdropSnapshot, AirdropSnapshotSource } from '@/domain/airdrop-snapshot';
import { parseAirdropSnapshot } from '@/domain/airdrop-snapshot';

export type SnapshotLoadResult =
  | { readonly status: 'loaded'; readonly snapshot: AirdropSnapshot }
  | { readonly status: 'unavailable' }
  | { readonly status: 'error' };

interface CachedLoad {
  readonly key: string;
  readonly promise: Promise<SnapshotLoadResult>;
}

let cached: CachedLoad | null = null;

function requestUrl(source: AirdropSnapshotSource): string {
  if (source.kind === 'uri') return source.url;
  if (source.kind === 'bundle') {
    return `${import.meta.env.BASE_URL}${source.path.replace(/^\//, '')}`;
  }
  throw new Error('cannot load an empty snapshot source');
}

/**
 * Lazily fetches the merkle snapshot as a static same-origin file (genesis,
 * bundled at build time) or from the launcher-registered on-chain URI (future
 * Launch tokens, CI-015). The document is never trusted until the caller
 * compares its root with the on-chain `merkleRootByTokenAddress`.
 *
 * It is deliberately NOT a bundled import: the home page must render identity,
 * balance and entries before this request starts (UX spec §3.1). Retry drops the
 * cached promise so a failed chunk can be re-requested.
 */
export function loadAirdropSnapshot(source: AirdropSnapshotSource): Promise<SnapshotLoadResult> {
  if (source.kind === 'none') return Promise.resolve({ status: 'unavailable' });
  const key = source.kind === 'uri' ? source.url : `bundle:${source.path}`;
  if (cached !== null && cached.key === key) return cached.promise;

  const url = requestUrl(source);
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

  cached = { key, promise };
  return promise;
}

export function resetAirdropSnapshotCache(): void {
  cached = null;
}
