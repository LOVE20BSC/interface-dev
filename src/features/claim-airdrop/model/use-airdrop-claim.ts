import { useMemo } from 'react';
import { useAccount, useChainId, useReadContract, useReadContracts } from 'wagmi';
import { airdropAbi, love20TokenAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';
import {
  selectAirdropClaimState,
  type AirdropClaimErrorKind,
  type AirdropClaimReadStatus,
  type AirdropClaimStatus,
  type AirdropClaimUnavailableReason,
} from '@/domain/airdrop-claim';
import { formatSharePercent } from '@/domain/airdrop-share';
import {
  findSnapshotEntry,
  snapshotMatchesChain,
  type AirdropSnapshotEntry,
} from '@/domain/airdrop-snapshot';
import { useAirdropSnapshot } from '@/entities/airdrop/model/use-airdrop-snapshot';
import { useFirstToken } from '@/entities/community-token/model/use-first-token';
import {
  createAirdropClaimScope,
  readAirdropClaimRecord,
  type AirdropClaimReceipt,
} from '@/features/claim-airdrop/lib/airdrop-claim-record';

export interface AirdropClaimState {
  readonly status: AirdropClaimStatus;
  readonly errorKind: AirdropClaimErrorKind | undefined;
  readonly reason: AirdropClaimUnavailableReason | undefined;
  readonly airdropAddress: HexAddress | undefined;
  readonly tokenAddress: HexAddress | undefined;
  readonly tokenSymbol: string | undefined;
  readonly tokenDecimals: number | undefined;
  readonly entry: AirdropSnapshotEntry | null;
  readonly share: bigint | undefined;
  readonly totalShare: bigint | undefined;
  readonly sharePercent: string | undefined;
  readonly claimableAmount: bigint | undefined;
  readonly poolBalance: bigint | undefined;
  readonly remainingShare: bigint | undefined;
  /** Confirmed receipt left by this device; undefined amount means pending recovery. */
  readonly localReceipt: AirdropClaimReceipt | null;
  readonly refetch: () => void;
}

function successBigInt(result: { status: string; result?: unknown } | undefined): bigint | null {
  return result?.status === 'success' && typeof result.result === 'bigint' ? result.result : null;
}

function successBool(result: { status: string; result?: unknown } | undefined): boolean | null {
  return result?.status === 'success' && typeof result.result === 'boolean' ? result.result : null;
}

/**
 * Read model for 铸造空投份额 (UX spec §3.4).
 *
 * The snapshot is trusted only when its chain id and merkle root match the
 * deployed contract; a mismatch never becomes "no eligibility". Four claim
 * values are read in a single Multicall3 batch (isClaimed, claimableAmount,
 * airdrop balance, remainingShare) plus totalShare for the percentage, so the
 * dynamic amount is re-read on every mount and after a receipt, never polled.
 */
export function useAirdropClaim(): AirdropClaimState {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const airdropAddress = configuredAddress('airdrop');
  const tokenAddress = configuredAddress('firstTokenAddress') ?? configuredAddress('tokenAddress');

  // Genesis token metadata: the airdrop unit is the first token, never ?symbol=.
  const firstToken = useFirstToken();
  const snapshotState = useAirdropSnapshot(account !== undefined);

  const rootRead = useReadContract({
    address: airdropAddress,
    abi: airdropAbi,
    functionName: 'merkleRoot',
    query: { enabled: airdropAddress !== undefined && account !== undefined },
  });

  const snapshot = snapshotState.snapshot;
  const rootMatches =
    snapshot !== null &&
    rootRead.data !== undefined &&
    snapshotMatchesChain(snapshot, { chainId, merkleRoot: rootRead.data });

  const entry = useMemo(
    () => (rootMatches && snapshot !== null ? findSnapshotEntry(snapshot, account) : null),
    [account, rootMatches, snapshot],
  );

  const contracts = useMemo(() => {
    if (
      !rootMatches ||
      entry === null ||
      airdropAddress === undefined ||
      tokenAddress === undefined ||
      account === undefined
    ) {
      return [];
    }
    return [
      {
        address: airdropAddress,
        abi: airdropAbi,
        functionName: 'isClaimed' as const,
        args: [tokenAddress, account] as const,
      },
      {
        address: airdropAddress,
        abi: airdropAbi,
        functionName: 'claimableAmount' as const,
        args: [tokenAddress, account, entry.share, entry.proof] as const,
      },
      {
        address: tokenAddress,
        abi: love20TokenAbi,
        functionName: 'balanceOf' as const,
        args: [airdropAddress] as const,
      },
      {
        address: airdropAddress,
        abi: airdropAbi,
        functionName: 'remainingShare' as const,
        args: [tokenAddress] as const,
      },
      {
        address: airdropAddress,
        abi: airdropAbi,
        functionName: 'totalShare' as const,
      },
    ];
  }, [account, airdropAddress, entry, rootMatches, tokenAddress]);

  const checks = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  const claimed = successBool(checks.data?.[0]);
  const claimableAmount = successBigInt(checks.data?.[1]);
  const poolBalance = successBigInt(checks.data?.[2]);
  const remainingShare = successBigInt(checks.data?.[3]);
  const totalShare = successBigInt(checks.data?.[4]);

  const anyReadFailed = checks.data?.some((result) => result.status === 'failure') ?? false;
  let reads: AirdropClaimReadStatus;
  if (contracts.length === 0) {
    reads = 'idle';
  } else if (checks.isError || anyReadFailed) {
    reads = 'error';
  } else if (checks.isLoading || checks.data === undefined) {
    reads = 'loading';
  } else {
    reads = 'ready';
  }

  const snapshotStatus =
    snapshotState.status === 'idle'
      ? 'loading'
      : (snapshotState.status as 'loading' | 'loaded' | 'error' | 'unavailable');
  const rootStatus = rootRead.isError
    ? 'error'
    : rootRead.isLoading || rootRead.data === undefined
      ? 'loading'
      : 'loaded';

  let selection = selectAirdropClaimState({
    connected: account !== undefined,
    configured: airdropAddress !== undefined && tokenAddress !== undefined,
    snapshot: snapshotStatus,
    root: rootStatus,
    rootMatches,
    hasEntry: entry !== null,
    reads,
    claimed,
    share: entry?.share ?? null,
    claimableAmount,
    poolBalance,
    remainingShare,
  });

  // The genesis symbol/decimals are part of the status card; without them no
  // amount can be rendered honestly, so the page stays in loading/read-error.
  if (selection.status !== 'disconnected' && selection.status !== 'unconfigured') {
    if (firstToken.status === 'loading' || firstToken.status === 'disconnected') {
      selection = { status: 'loading' };
    } else if (
      firstToken.status === 'error' ||
      firstToken.symbol === undefined ||
      firstToken.decimals === undefined
    ) {
      selection = { status: 'error', errorKind: 'read' };
    }
  }

  const localReceipt = useMemo(() => {
    if (account === undefined || airdropAddress === undefined) return null;
    return readAirdropClaimRecord(createAirdropClaimScope(chainId, airdropAddress, account));
  }, [account, airdropAddress, chainId]);

  const sharePercent =
    entry !== null && totalShare !== null
      ? (formatSharePercent(entry.share, totalShare) ?? undefined)
      : undefined;

  const refetch = () => {
    snapshotState.retry();
    rootRead.refetch();
    checks.refetch();
    firstToken.refetch();
  };

  return {
    status: selection.status,
    errorKind: selection.errorKind,
    reason: selection.reason,
    airdropAddress,
    tokenAddress,
    tokenSymbol: firstToken.symbol,
    tokenDecimals: firstToken.decimals,
    entry,
    share: entry?.share,
    totalShare: totalShare ?? undefined,
    sharePercent,
    claimableAmount:
      selection.status === 'eligible' || selection.status === 'unavailable'
        ? (claimableAmount ?? undefined)
        : undefined,
    poolBalance: poolBalance ?? undefined,
    remainingShare: remainingShare ?? undefined,
    localReceipt,
    refetch,
  };
}
