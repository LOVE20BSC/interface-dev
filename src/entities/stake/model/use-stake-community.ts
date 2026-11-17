import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { stakeAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { configuredAddress } from '@/config/networks';

export type StakeCommunityStatus = 'idle' | 'unconfigured' | 'loading' | 'error' | 'ready';

export interface StakeCommunity {
  readonly status: StakeCommunityStatus;
  readonly totalLiquidityShares: bigint | undefined;
  readonly totalLp: bigint | undefined;
  readonly withdrawableLp: bigint | undefined;
  readonly totalBoostShares: bigint | undefined;
  /** 本阶段社区总治理权（`totalGovVotes(token, 当前阶段)`）。 */
  readonly totalGovVotes: bigint | undefined;
  /** 本阶段社区有效加速份额（`totalValidBoostShares(token, 当前阶段)`）。 */
  readonly totalValidBoostShares: bigint | undefined;
  /** 累计销毁的社区代币（`totalBurnedToken`）。 */
  readonly totalBurnedToken: bigint | undefined;
  readonly refetch: () => void;
}

const IDLE: StakeCommunity = {
  status: 'idle',
  totalLiquidityShares: undefined,
  totalLp: undefined,
  withdrawableLp: undefined,
  totalBoostShares: undefined,
  totalGovVotes: undefined,
  totalValidBoostShares: undefined,
  totalBurnedToken: undefined,
  refetch: () => {},
};

/**
 * 当前社区的质押总量（`totalStake` 的八元组取前四项）+ 本阶段的社区总治理权与
 * 有效加速份额 + 累计销毁量。
 *
 * 用途：我的占比 = 我的治理权 / 社区总治理权；加速上限由合约自己算，这里只展示
 * 社区盘子的规模。所有阶段相关的读在阶段未知时保持禁用，避免 `RoundNotStarted`。
 */
export function useStakeCommunity(
  tokenAddress: HexAddress | undefined,
  currentPhase: bigint | undefined,
): StakeCommunity {
  const stake = configuredAddress('stake');
  const enabled = stake !== undefined && tokenAddress !== undefined;
  const phaseDependent = enabled && currentPhase !== undefined && currentPhase > 0n;

  const contracts = useMemo(() => {
    if (!enabled || stake === undefined || tokenAddress === undefined) return [];
    const base = [
      {
        address: stake,
        abi: stakeAbi,
        functionName: 'totalStake' as const,
        args: [tokenAddress] as const,
      },
      {
        address: stake,
        abi: stakeAbi,
        functionName: 'totalBurnedToken' as const,
        args: [tokenAddress] as const,
      },
    ] as const;

    if (!phaseDependent || currentPhase === undefined) return [...base];

    return [
      ...base,
      {
        address: stake,
        abi: stakeAbi,
        functionName: 'totalGovVotes' as const,
        args: [tokenAddress, currentPhase] as const,
      },
      {
        address: stake,
        abi: stakeAbi,
        functionName: 'totalValidBoostShares' as const,
        args: [tokenAddress, currentPhase] as const,
      },
    ];
  }, [currentPhase, enabled, phaseDependent, stake, tokenAddress]);

  const read = useReadContracts({ contracts, query: { enabled } });

  const refetch = () => {
    if (enabled) read.refetch();
  };

  if (stake === undefined) return { ...IDLE, status: 'unconfigured' };
  if (!enabled) return IDLE;

  const data = read.data;
  const totalEntry = data?.[0];
  const burnedEntry = data?.[1];
  const govVotesEntry = phaseDependent ? data?.[2] : undefined;
  const boostEntry = phaseDependent ? data?.[3] : undefined;

  const totalTuple =
    totalEntry?.status === 'success' && Array.isArray(totalEntry.result)
      ? (totalEntry.result as readonly bigint[])
      : undefined;

  const uintOf = (entry: { status: string; result?: unknown } | undefined): bigint | undefined =>
    entry?.status === 'success' && typeof entry.result === 'bigint' ? entry.result : undefined;

  let status: StakeCommunityStatus = 'ready';
  if (read.isLoading) status = 'loading';
  else if (read.isError || totalEntry?.status === 'failure') status = 'error';

  return {
    status,
    totalLiquidityShares: totalTuple?.[0],
    totalLp: totalTuple?.[1],
    withdrawableLp: totalTuple?.[2],
    totalBoostShares: totalTuple?.[4],
    totalGovVotes: uintOf(govVotesEntry),
    totalValidBoostShares: uintOf(boostEntry),
    totalBurnedToken: uintOf(burnedEntry),
    refetch,
  };
}
