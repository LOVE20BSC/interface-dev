import { useMemo } from 'react';
import { useAccount, useChainId, useReadContracts } from 'wagmi';
import { airdropDistributorAbi } from '@/config/abis';
import { configuredAddress } from '@/config/networks';
import {
  findSnapshotEntry,
  isAirdropEligible,
  snapshotMatchesChain,
} from '@/domain/airdrop-snapshot';
import { useAirdropInfo } from '@/entities/airdrop/model/use-airdrop-info';
import { useAirdropSnapshot } from '@/entities/airdrop/model/use-airdrop-snapshot';

export type AirdropEligibilityStatus =
  | 'disconnected'
  | 'unconfigured'
  | 'loading'
  | 'ineligible'
  | 'eligible'
  | 'unavailable'
  | 'mismatch'
  | 'error';

export interface AirdropEligibility {
  readonly status: AirdropEligibilityStatus;
  readonly isEligible: boolean;
  /** Snapshot share (uint256) when the wallet is in the snapshot. */
  readonly share: bigint | undefined;
  /** On-chain claimableAmount when it could be read; undefined means unknown, not 0. */
  readonly claimableAmount: bigint | undefined;
  readonly refetch: () => void;
}

/**
 * Airdrop eligibility: snapshot entry exists ∧ !isClaimed
 * ∧ claimableAmount(token,wallet,share,proof) > 0.
 *
 * The snapshot document is trusted only after its merkleRoot matches
 * `airdropInfo(token).merkleRoot` (and it belongs to this chain). One
 * `airdropInfo` read also supplies the snapshot URI, so eligibility no longer
 * needs a separate root/URI getter. A mismatch disables the card instead of
 * showing a wrong answer.
 */
export function useAirdropEligibility(): AirdropEligibility {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const airdropAddress = configuredAddress('airdropDistributor');
  const tokenAddress = configuredAddress('firstTokenAddress') ?? configuredAddress('tokenAddress');
  const genesisTokenAddress = configuredAddress('firstTokenAddress');

  const infoState = useAirdropInfo({ airdropAddress, tokenAddress });
  const info = infoState.info;

  const snapshotState = useAirdropSnapshot({
    enabled: account !== undefined,
    snapshotUri: info?.snapshotUri,
    tokenAddress,
    genesisTokenAddress,
  });

  const snapshot = snapshotState.snapshot;
  const rootMatches =
    snapshot !== null &&
    info !== null &&
    snapshotMatchesChain(snapshot, { chainId, merkleRoot: info.merkleRoot });

  const entry = useMemo(
    () => (rootMatches && snapshot !== null ? findSnapshotEntry(snapshot, account) : null),
    [account, rootMatches, snapshot],
  );

  const checkContracts = useMemo(() => {
    if (entry === null || tokenAddress === undefined || account === undefined) return [];
    return [
      {
        address: airdropAddress,
        abi: airdropDistributorAbi,
        functionName: 'isClaimed' as const,
        args: [tokenAddress, account] as const,
      },
      {
        address: airdropAddress,
        abi: airdropDistributorAbi,
        functionName: 'claimableAmount' as const,
        args: [tokenAddress, account, entry.share, entry.proof] as const,
      },
    ];
  }, [account, airdropAddress, entry, tokenAddress]);

  const checks = useReadContracts({
    contracts: checkContracts,
    query: { enabled: checkContracts.length > 0 },
  });

  const refetch = () => {
    infoState.refetch();
    snapshotState.retry();
    checks.refetch();
  };

  const claimedResult = checks.data?.[0];
  const claimableResult = checks.data?.[1];
  const claimed =
    claimedResult?.status === 'success' && typeof claimedResult.result === 'boolean'
      ? claimedResult.result
      : undefined;
  const claimableAmount =
    claimableResult?.status === 'success' && typeof claimableResult.result === 'bigint'
      ? claimableResult.result
      : undefined;
  const share = entry?.share;

  let status: AirdropEligibilityStatus;
  if (account === undefined) {
    status = 'disconnected';
  } else if (airdropAddress === undefined || tokenAddress === undefined) {
    status = 'unconfigured';
  } else if (snapshotState.status === 'unavailable') {
    status = 'unavailable';
  } else if (snapshotState.status === 'loading' || infoState.status === 'loading') {
    status = 'loading';
  } else if (snapshotState.status === 'error' || infoState.status === 'error') {
    status = 'error';
  } else if (snapshot === null) {
    status = 'error';
  } else if (!rootMatches) {
    status = 'mismatch';
  } else if (entry === null) {
    status = 'ineligible';
  } else if (checks.isLoading || claimed === undefined || claimableAmount === undefined) {
    status = checks.isError ? 'error' : 'loading';
  } else if (isAirdropEligible({ hasEntry: true, claimed, claimableAmount })) {
    status = 'eligible';
  } else {
    status = 'ineligible';
  }

  return {
    status,
    isEligible: status === 'eligible',
    share,
    claimableAmount: status === 'eligible' || status === 'ineligible' ? claimableAmount : undefined,
    refetch,
  };
}
