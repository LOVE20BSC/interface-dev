import { useCallback, useEffect, useMemo, useState } from 'react';
import { useReadContract } from 'wagmi';
import { AIRDROP_SNAPSHOT_PATH } from '@/config/airdrop';
import { airdropDistributorAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import {
  selectAirdropSnapshotSource,
  type AirdropSnapshot,
  type AirdropSnapshotSource,
} from '@/domain/airdrop-snapshot';
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
  readonly airdropAddress: HexAddress | undefined;
  readonly tokenAddress: HexAddress | undefined;
  /** Deployment genesis token: its on-chain URI is empty by design (CI-017). */
  readonly genesisTokenAddress: HexAddress | undefined;
}

interface SnapshotData {
  readonly status: AirdropSnapshotStatus;
  readonly snapshot: AirdropSnapshot | null;
  readonly sourceKey: string | null;
  readonly attempt: number;
}

function sourceKeyOf(source: AirdropSnapshotSource | null): string | null {
  if (source === null) return null;
  if (source.kind === 'uri') return `uri:${source.url}`;
  if (source.kind === 'bundle') return `bundle:${source.path}`;
  return 'none';
}

/**
 * Resolves and loads the snapshot document for one token (spec §3.4).
 *
 * Two sources coexist:
 *   - `snapshotUriByTokenAddress(token)` when non-empty (future Launch tokens);
 *   - the build-time bundled JSON for the genesis token, whose URI is empty by
 *     design (CI-017). An empty URI is therefore NOT an error for genesis.
 * The document is still untrusted here: callers compare its root with
 * `merkleRootByTokenAddress(token)` before reading any share or proof.
 *
 * Starts after the first paint; until it resolves the home page shows no
 * eligibility placeholder. While no wallet is connected nothing is fetched.
 */
export function useAirdropSnapshot(options: AirdropSnapshotOptions): AirdropSnapshotState {
  const { enabled, airdropAddress, tokenAddress, genesisTokenAddress } = options;
  const [data, setData] = useState<SnapshotData>({
    status: 'idle',
    snapshot: null,
    sourceKey: null,
    attempt: 0,
  });
  const [attempt, setAttempt] = useState(0);

  const uriRead = useReadContract({
    address: airdropAddress,
    abi: airdropDistributorAbi,
    functionName: 'snapshotUriByTokenAddress',
    args: tokenAddress !== undefined ? [tokenAddress] : undefined,
    query: { enabled: enabled && airdropAddress !== undefined && tokenAddress !== undefined },
  });

  const isGenesis =
    tokenAddress !== undefined &&
    genesisTokenAddress !== undefined &&
    tokenAddress.toLowerCase() === genesisTokenAddress.toLowerCase();

  const source = useMemo<AirdropSnapshotSource | null>(() => {
    if (uriRead.data === undefined) return null;
    return selectAirdropSnapshotSource({
      snapshotUri: uriRead.data,
      bundledPath: AIRDROP_SNAPSHOT_PATH,
      isGenesis,
    });
  }, [isGenesis, uriRead.data]);

  const sourceKey = sourceKeyOf(source);
  const canLoad = enabled && tokenAddress !== undefined && source !== null;

  // The fetch result is an external system; this effect only mirrors it into state.
  useEffect(() => {
    if (!canLoad || source === null || source.kind === 'none') return;
    let active = true;
    if (attempt > 0) resetAirdropSnapshotCache();
    // No synchronous setState here: a mismatched sourceKey/attempt already
    // renders as loading, and the async result is the only external fact.
    void loadAirdropSnapshot(source).then((result) => {
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
  }, [attempt, canLoad, source, sourceKey]);

  const retry = useCallback(() => {
    if (!enabled) return;
    uriRead.refetch();
    resetAirdropSnapshotCache();
    setAttempt((value) => value + 1);
  }, [enabled, uriRead]);

  if (!enabled || tokenAddress === undefined) {
    return { status: 'idle', snapshot: null, retry };
  }
  if (source === null) {
    // The on-chain URI read has not resolved yet.
    return { status: 'loading', snapshot: null, retry };
  }
  if (source.kind === 'none') {
    return { status: 'unavailable', snapshot: null, retry };
  }
  if (data.sourceKey !== sourceKey || data.attempt !== attempt) {
    return { status: 'loading', snapshot: null, retry };
  }
  return { status: data.status, snapshot: data.snapshot, retry };
}
