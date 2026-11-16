import { useCallback, useEffect, useState } from 'react';
import { loadBundledAirdropSnapshot } from '@/config/airdrop';
import type { HexAddress } from '@/config/networks';
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

export interface AirdropSnapshotOptions {
  readonly enabled: boolean;
  readonly snapshotUri: string | null | undefined;
  readonly merkleRoot: string | undefined;
  readonly tokenAddress: HexAddress | undefined;
  readonly genesisTokenAddress: HexAddress | undefined;
}

interface SnapshotData {
  readonly status: AirdropSnapshotStatus;
  readonly snapshot: AirdropSnapshot | null;
  readonly sourceKey: string | null;
  readonly attempt: number;
}

/** Loads the bundled genesis snapshot first; only a missing or mismatched file needs the URI. */
export function useAirdropSnapshot(options: AirdropSnapshotOptions): AirdropSnapshotState {
  const { enabled, snapshotUri, merkleRoot, tokenAddress, genesisTokenAddress } = options;
  const [data, setData] = useState<SnapshotData>({
    status: 'idle',
    snapshot: null,
    sourceKey: null,
    attempt: 0,
  });
  const [attempt, setAttempt] = useState(0);

  const isGenesis =
    tokenAddress !== undefined &&
    genesisTokenAddress !== undefined &&
    tokenAddress.toLowerCase() === genesisTokenAddress.toLowerCase();

  const sourceKey = JSON.stringify([tokenAddress, merkleRoot, snapshotUri, isGenesis]);
  const canLoad = enabled && tokenAddress !== undefined && merkleRoot !== undefined;

  // The fetch result is an external system; this effect only mirrors it into state.
  useEffect(() => {
    if (!canLoad || merkleRoot === undefined) return;
    let active = true;
    // No synchronous setState here: a mismatched sourceKey/attempt already
    // renders as loading, and the async result is the only external fact.
    void loadAirdropSnapshot({
      merkleRoot,
      snapshotUri,
      bundled: isGenesis ? loadBundledAirdropSnapshot : null,
    }).then((result) => {
      if (!active) return;
      setData({
        status: result.status === 'loaded' ? 'loaded' : result.status,
        snapshot: result.status === 'loaded' ? result.snapshot : null,
        sourceKey,
        attempt,
      });
    });
    return () => {
      active = false;
    };
  }, [attempt, canLoad, isGenesis, merkleRoot, snapshotUri, sourceKey]);

  const retry = useCallback(() => {
    if (!enabled) return;
    resetAirdropSnapshotCache();
    setAttempt((value) => value + 1);
  }, [enabled]);

  if (!enabled || tokenAddress === undefined) {
    return { status: 'idle', snapshot: null, retry };
  }
  if (merkleRoot === undefined) {
    // The caller's `airdropInfo` read has not resolved yet.
    return { status: 'loading', snapshot: null, retry };
  }
  if (data.sourceKey !== sourceKey || data.attempt !== attempt) {
    return { status: 'loading', snapshot: null, retry };
  }
  return { status: data.status, snapshot: data.snapshot, retry };
}
