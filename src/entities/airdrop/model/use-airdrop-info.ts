import { useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { airdropDistributorAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { toAirdropInfo, type AirdropInfo } from '@/domain/airdrop-info';

export type AirdropInfoStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface AirdropInfoState {
  /** Decoded `airdropInfo(token)`; null until it resolves or when it is malformed. */
  readonly info: AirdropInfo | null;
  readonly status: AirdropInfoStatus;
  readonly refetch: () => void;
}

export interface UseAirdropInfoOptions {
  readonly airdropAddress: HexAddress | undefined;
  readonly tokenAddress: HexAddress | undefined;
}

/**
 * The single per-token distributor read (UX spec §3.4).
 *
 * `AirdropDistributor.airdropInfo(tokenAddress)` returns the whole token state
 * in one struct: merkle root, claimable-from round, claimed/remaining shares
 * and amounts, and the snapshot URI. Replacing the old six getters with this
 * call is what keeps the claim page to one read per token.
 *
 * Every hook that needs the struct calls this one; wagmi/react-query keys the
 * identical `(address, functionName, args)` call the same way, so two mounted
 * consumers still produce one RPC request. Pure derivation lives in
 * `src/domain/airdrop-info.ts`.
 */
export function useAirdropInfo(options: UseAirdropInfoOptions): AirdropInfoState {
  const { airdropAddress, tokenAddress } = options;
  const enabled = airdropAddress !== undefined && tokenAddress !== undefined;

  const read = useReadContract({
    address: airdropAddress,
    abi: airdropDistributorAbi,
    functionName: 'airdropInfo',
    args: tokenAddress !== undefined ? [tokenAddress] : undefined,
    query: { enabled },
  });

  const info = useMemo(() => (read.data === undefined ? null : toAirdropInfo(read.data)), [
    read.data,
  ]);

  let status: AirdropInfoStatus;
  if (!enabled) {
    status = 'idle';
  } else if (read.isError || (read.data !== undefined && info === null)) {
    status = 'error';
  } else if (read.isLoading || read.data === undefined) {
    status = 'loading';
  } else {
    status = 'loaded';
  }

  return { info, status, refetch: read.refetch };
}
