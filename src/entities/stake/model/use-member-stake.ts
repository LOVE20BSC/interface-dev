import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { stakeAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { configuredAddress } from '@/config/networks';

export type MemberStakeStatus = 'idle' | 'unconfigured' | 'loading' | 'error' | 'ready';

export interface MemberStakeOptions {
  /** 解锁等待期间自动刷新（见 use-phase-clock 的说明）。 */
  readonly refetchIntervalMs?: number | undefined;
}

export interface MemberStake {
  readonly status: MemberStakeStatus;
  /** `memberStake()` 的七元组：流动性质押份额、加速份额、承诺解锁期、解锁申请阶段、两侧代币本金、首个治理轮。 */
  readonly liquidityShares: bigint | undefined;
  readonly boostShares: bigint | undefined;
  readonly promisedWaitingPhases: bigint | undefined;
  /** 0 = 没有在途解锁申请。 */
  readonly unlockRequestPhase: bigint | undefined;
  readonly tokenAmountForLiquidity: bigint | undefined;
  readonly parentTokenAmountForLiquidity: bigint | undefined;
  /** 当前阶段的治理权（`govPower(token, 当前阶段, memberId)`）。 */
  readonly govPower: bigint | undefined;
  /** `boostStakeCap()`：本阶段该成员的上限。 */
  readonly boostCap: bigint | undefined;
  /** `boostStakeCap()`：已经加速的份额（= memberStake.boostShares）。 */
  readonly boostUsed: bigint | undefined;
  /** `validBoostShares(token, 当前阶段, memberId)`：本阶段有效的加速份额。 */
  readonly validBoostShares: bigint | undefined;
  /** `canWithdraw()`：解锁等待是否已经走完。 */
  readonly canWithdraw: boolean | undefined;
  readonly refetch: () => void;
}

const IDLE: MemberStake = {
  status: 'idle',
  liquidityShares: undefined,
  boostShares: undefined,
  promisedWaitingPhases: undefined,
  unlockRequestPhase: undefined,
  tokenAmountForLiquidity: undefined,
  parentTokenAmountForLiquidity: undefined,
  govPower: undefined,
  boostCap: undefined,
  boostUsed: undefined,
  validBoostShares: undefined,
  canWithdraw: undefined,
  refetch: () => {},
};

/** 当前阶段之前的阶段号会被合约拒绝（`RoundNotStarted`），所以这些读必须等阶段就绪。 */
function phaseReady(phase: bigint | undefined): phase is bigint {
  return phase !== undefined && phase > 0n;
}

/**
 * 一个身份 NFT 在当前社区里的质押读模型。
 *
 * 所有读取都是 view：`memberStake` 给份额与解锁进度，`govPower` 给当前阶段的
 * 治理权，`boostStakeCap` 给本阶段还能加速多少，`validBoostShares` 给本阶段
 * 计入加速激励的份额，`canWithdraw` 给撤出闸门。任何一个读失败都把状态置为
 * `error`，页面据此显示「读不到 + 重试」，绝不把未知渲染成 0。
 */
export function useMemberStake(
  tokenAddress: HexAddress | undefined,
  memberId: bigint | undefined,
  currentPhase: bigint | undefined,
  options: MemberStakeOptions = {},
): MemberStake {
  const stake = configuredAddress('stake');
  const enabled = stake !== undefined && tokenAddress !== undefined && memberId !== undefined;
  const phaseDependent = enabled && phaseReady(currentPhase);

  const contracts = useMemo(() => {
    if (!enabled || stake === undefined || tokenAddress === undefined || memberId === undefined) {
      return [];
    }
    const base = [
      {
        address: stake,
        abi: stakeAbi,
        functionName: 'memberStake' as const,
        args: [tokenAddress, memberId] as const,
      },
      {
        address: stake,
        abi: stakeAbi,
        functionName: 'boostStakeCap' as const,
        args: [tokenAddress, memberId] as const,
      },
      {
        address: stake,
        abi: stakeAbi,
        functionName: 'canWithdraw' as const,
        args: [tokenAddress, memberId] as const,
      },
    ] as const;

    if (!phaseReady(currentPhase)) return [...base];

    return [
      ...base,
      {
        address: stake,
        abi: stakeAbi,
        functionName: 'govPower' as const,
        args: [tokenAddress, currentPhase, memberId] as const,
      },
      {
        address: stake,
        abi: stakeAbi,
        functionName: 'validBoostShares' as const,
        args: [tokenAddress, currentPhase, memberId] as const,
      },
    ];
  }, [currentPhase, enabled, memberId, stake, tokenAddress]);

  const refetchInterval = options.refetchIntervalMs;
  const read = useReadContracts({
    contracts,
    query: { enabled, ...(refetchInterval !== undefined ? { refetchInterval } : {}) },
  });

  const refetch = () => {
    if (enabled) read.refetch();
  };

  if (stake === undefined) return { ...IDLE, status: 'unconfigured' };
  if (!enabled) return IDLE;

  const data = read.data;

  const memberStakeEntry = data?.[0];
  const boostCapEntry = data?.[1];
  const canWithdrawEntry = data?.[2];
  const govPowerEntry = phaseDependent ? data?.[3] : undefined;
  const validBoostEntry = phaseDependent ? data?.[4] : undefined;

  const memberTuple =
    memberStakeEntry?.status === 'success' && Array.isArray(memberStakeEntry.result)
      ? (memberStakeEntry.result as readonly bigint[])
      : undefined;

  const boostCapTuple =
    boostCapEntry?.status === 'success' && Array.isArray(boostCapEntry.result)
      ? (boostCapEntry.result as readonly bigint[])
      : undefined;

  const govPower =
    govPowerEntry?.status === 'success' && typeof govPowerEntry.result === 'bigint'
      ? govPowerEntry.result
      : undefined;
  const validBoostShares =
    validBoostEntry?.status === 'success' && typeof validBoostEntry.result === 'bigint'
      ? validBoostEntry.result
      : undefined;
  const canWithdraw =
    canWithdrawEntry?.status === 'success' && typeof canWithdrawEntry.result === 'boolean'
      ? canWithdrawEntry.result
      : undefined;

  // 任一个子读失败都必须是 error：否则 govPower/boostStakeCap/canWithdraw 单项失败
  // 会伪装成 ready，页面把「读不到」渲染成上限 0 / 「先完成流动性质押」/ 按钮静默禁用
  // （复核 P2，违反硬规则 4 与规范 §5.1）。
  const anyEntryFailed = [
    memberStakeEntry,
    boostCapEntry,
    canWithdrawEntry,
    govPowerEntry,
    validBoostEntry,
  ].some((entry) => entry?.status === 'failure');
  let status: MemberStakeStatus = 'ready';
  if (read.isLoading) status = 'loading';
  else if (read.isError || anyEntryFailed) status = 'error';

  return {
    status,
    liquidityShares: memberTuple?.[0],
    boostShares: memberTuple?.[1],
    promisedWaitingPhases: memberTuple?.[2],
    unlockRequestPhase: memberTuple?.[3],
    tokenAmountForLiquidity: memberTuple?.[4],
    parentTokenAmountForLiquidity: memberTuple?.[5],
    govPower,
    boostCap: boostCapTuple?.[0],
    boostUsed: boostCapTuple?.[1],
    validBoostShares,
    canWithdraw,
    refetch,
  };
}
