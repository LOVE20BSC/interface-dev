import { useMemo } from 'react';
import { useAccount, useBlockNumber, useChainId, useReadContract, useReadContracts } from 'wagmi';
import { airdropDistributorAbi, phaseAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';
import {
  selectAirdropClaimState,
  type AirdropClaimErrorKind,
  type AirdropClaimReadStatus,
  type AirdropClaimStatus,
  type AirdropClaimUnavailableReason,
} from '@/domain/airdrop-claim';
import { useAirdropInfo } from '@/entities/airdrop/model/use-airdrop-info';
import {
  estimateRoundWait,
  roundGateReached,
  secondsPerBlockFromInputs,
} from '@/domain/airdrop-round-gate';
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

export interface AirdropRoundGate {
  /** currentPhase >= claimableFromRound; null while unknown. */
  readonly reached: boolean | null;
  /** Estimated wall-clock wait; null when it cannot be derived honestly. */
  readonly minutes: number | null;
}

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
  readonly roundGate: AirdropRoundGate;
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
 * Read model for 空投铸造 (UX spec §3.4).
 *
 * One `airdropInfo(tokenAddress)` read supplies every per-token fact: the
 * merkle root used to trust the snapshot, `claimableFromRound` for the round
 * gate, `snapshotUri` for the document source, and `remainingAmount` /
 * `totalRemainingShare` for the pool/remaining-share display. The per-claimer
 * facts (`isClaimed`, `claimableAmount`) and `TOTAL_SHARE` ride one Multicall3
 * batch so the dynamic amount is re-read on every mount and after a receipt,
 * never polled.
 *
 * The round gate reads the same Phase the distributor uses and turns the block
 * distance into 「约 X 分钟」 (never an absolute timestamp, CI-008).
 */
export function useAirdropClaim(): AirdropClaimState {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const airdropAddress = configuredAddress('airdropDistributor');
  const phaseAddress = configuredAddress('phase');
  const tokenAddress = configuredAddress('firstTokenAddress') ?? configuredAddress('tokenAddress');
  const genesisTokenAddress = configuredAddress('firstTokenAddress');

  // Genesis token metadata: the airdrop unit is the first token, never ?symbol=.
  const firstToken = useFirstToken();

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

  const contracts = useMemo(() => {
    if (
      !rootMatches ||
      info === null ||
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
      {
        address: airdropAddress,
        abi: airdropDistributorAbi,
        functionName: 'TOTAL_SHARE' as const,
      },
    ];
  }, [account, airdropAddress, entry, info, rootMatches, tokenAddress]);

  const checks = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  const claimed = successBool(checks.data?.[0]);
  const claimableAmount = successBigInt(checks.data?.[1]);
  const totalShare = successBigInt(checks.data?.[2]);
  // Pool and share totals come from `airdropInfo`, never from re-deriving the
  // distributor balance or from subtracting locally.
  const poolBalance = info?.remainingAmount ?? null;
  const remainingShare = info?.totalRemainingShare ?? null;

  // ── round gate ────────────────────────────────────────────────────────────
  // `claimableFromRound` is part of the same airdropInfo struct (no extra read).
  const gateEnabled = info !== null && tokenAddress !== undefined && airdropAddress !== undefined;
  const claimableFromRound = info?.claimableFromRound ?? null;
  const currentRoundRead = useReadContract({
    address: phaseAddress,
    abi: phaseAbi,
    functionName: 'currentPhase',
    query: { enabled: gateEnabled && phaseAddress !== undefined },
  });
  const currentRound = currentRoundRead.data ?? null;
  const roundReached = roundGateReached({ currentRound, claimableFromRound });

  const phaseInfoRead = useReadContract({
    address: phaseAddress,
    abi: phaseAbi,
    functionName: 'phaseInfo',
    args: claimableFromRound !== null ? [claimableFromRound] : undefined,
    query: {
      enabled:
        gateEnabled &&
        phaseAddress !== undefined &&
        claimableFromRound !== null &&
        roundReached === false,
    },
  });
  const observationsRead = useReadContract({
    address: phaseAddress,
    abi: phaseAbi,
    functionName: 'observations',
    args: [0n, 2n, true],
    query: { enabled: gateEnabled && phaseAddress !== undefined && roundReached === false },
  });
  const targetSecondsRead = useReadContract({
    address: phaseAddress,
    abi: phaseAbi,
    functionName: 'TARGET_SECONDS',
    query: { enabled: gateEnabled && phaseAddress !== undefined && roundReached === false },
  });
  const phaseBlocksRead = useReadContract({
    address: phaseAddress,
    abi: phaseAbi,
    functionName: 'currentPhaseBlocks',
    query: { enabled: gateEnabled && phaseAddress !== undefined && roundReached === false },
  });
  const blockNumber = useBlockNumber({ watch: true });

  const secondsPerBlock = secondsPerBlockFromInputs({
    blockNumbers: observationsRead.data?.[0] ?? [],
    blockTimestamps: observationsRead.data?.[1] ?? [],
    targetSeconds: targetSecondsRead.data ?? null,
    phaseBlocks: phaseBlocksRead.data ?? null,
  });
  const wait = estimateRoundWait({
    currentBlock: blockNumber.data ?? null,
    targetStartBlock: phaseInfoRead.data?.[0] ?? null,
    secondsPerBlock,
  });

  const anyReadFailed = checks.data?.some((result) => result.status === 'failure') ?? false;
  const gateReadFailed = currentRoundRead.isError;
  let reads: AirdropClaimReadStatus;
  if (contracts.length === 0) {
    reads = 'idle';
  } else if (checks.isError || anyReadFailed || gateReadFailed) {
    reads = 'error';
  } else if (checks.isLoading || checks.data === undefined || currentRoundRead.isLoading) {
    reads = 'loading';
  } else {
    reads = 'ready';
  }

  const snapshotStatus =
    snapshotState.status === 'idle'
      ? 'loading'
      : (snapshotState.status as 'loading' | 'loaded' | 'error' | 'unavailable');
  const rootStatus =
    infoState.status === 'error' ? 'error' : info === null ? 'loading' : 'loaded';

  let selection = selectAirdropClaimState({
    connected: account !== undefined,
    configured:
      airdropAddress !== undefined && tokenAddress !== undefined && phaseAddress !== undefined,
    snapshot: snapshotStatus,
    root: rootStatus,
    rootMatches,
    hasEntry: entry !== null,
    reads,
    claimed,
    roundReached,
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
    infoState.refetch();
    snapshotState.retry();
    checks.refetch();
    currentRoundRead.refetch();
    phaseInfoRead.refetch();
    observationsRead.refetch();
    targetSecondsRead.refetch();
    phaseBlocksRead.refetch();
    void blockNumber.refetch();
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
    roundGate: {
      reached: roundReached,
      minutes: roundReached === false ? (wait?.minutes ?? null) : null,
    },
    localReceipt,
    refetch,
  };
}
