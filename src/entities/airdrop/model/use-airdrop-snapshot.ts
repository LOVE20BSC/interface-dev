import { useCallback, useEffect, useState } from 'react';
import { AIRDROP_SNAPSHOT_PATH } from '@/config/airdrop';
import type { AirdropSnapshot } from '@/domain/airdrop-snapshot';
import {
  loadAirdropSnapshot,
  resetAirdropSnapshotCache,
} from '@/entities/airdrop/lib/load-snapshot';

export type AirdropSnapshotStatus = 'idle' | 'unavailable' | 'loading' | 'loaded' | 'error';

export interface AirdropSnapshotState {
  readonly status: AirdropSnapshotStatus;
  readonly snapshot: AirdropSnapshot | null;
  readonly retry: () => void;
}

interface SnapshotData {
  readonly status: AirdropSnapshotStatus;
  readonly snapshot: AirdropSnapshot | null;
}

/**
 * Starts the snapshot request after the first paint. Until it resolves the home
 * page shows no eligibility placeholder at all (no skeleton, no card), and while
 * no wallet is connected nothing is fetched.
 */
export function useAirdropSnapshot(enabled: boolean): AirdropSnapshotState {
  const [data, setData] = useState<SnapshotData>({
    status: AIRDROP_SNAPSHOT_PATH === null ? 'unavailable' : 'idle',
    snapshot: null,
  });
  const [attempt, setAttempt] = useState(0);

  const canLoad = enabled && AIRDROP_SNAPSHOT_PATH !== null;

  // The fetch result is an external system; this effect only mirrors it into state.
  useEffect(() => {
    if (!canLoad) return;
    let active = true;
    if (attempt > 0) resetAirdropSnapshotCache();
    void loadAirdropSnapshot(AIRDROP_SNAPSHOT_PATH).then((result) => {
      if (!active) return;
      setData({
        status: result.status === 'loaded' ? 'loaded' : result.status,
        snapshot: result.status === 'loaded' ? result.snapshot : null,
      });
    });
    return () => {
      active = false;
    };
  }, [attempt, canLoad]);

  const retry = useCallback(() => {
    if (!canLoad) return;
    setData({ status: 'loading', snapshot: null });
    setAttempt((value) => value + 1);
  }, [canLoad]);

  const status: AirdropSnapshotStatus =
    canLoad && (data.status === 'idle' || data.status === 'loading') ? 'loading' : data.status;

  return { status, snapshot: data.snapshot, retry };
}
