import { useReadContract } from 'wagmi';
import { phaseAbi } from '@/config/abis';
import { configuredAddress } from '@/config/networks';
import { secondsPerBlockFromInputs } from '@/domain/airdrop-round-gate';

export type PhaseClockStatus = 'unconfigured' | 'loading' | 'error' | 'ready';

export interface PhaseClockOptions {
  /**
   * 解锁等待期间需要跟着阶段推进自动刷新（否则「可以撤出了」永远不会自己出现，
   * 用户只能手动刷新页面）。其它页面不需要，默认关闭。
   */
  readonly refetchIntervalMs?: number | undefined;
}

export interface PhaseClock {
  readonly status: PhaseClockStatus;
  /** `Phase.currentPhase()`：全局时钟的当前刻度，也是「治理轮」的轮次号。 */
  readonly currentPhase: bigint | undefined;
  /**
   * 一个阶段大约多少秒：实测算出的每块秒数 × 当前阶段区块数。阶段长度会被协议
   * 按出块速度调整，所以调用方一律写「约 X 分钟」。
   */
  readonly secondsPerPhase: number | undefined;
  readonly refetch: () => void;
}

/**
 * 阶段时钟读模型：当前阶段 + 阶段长度的秒数估算。
 *
 * 与空投页同源（`airdrop-round-gate.ts#secondsPerBlockFromInputs`）：先用
 * `Phase.observations(0, 2)` 的两点算实测每块秒数，样本不足时退回
 * `TARGET_SECONDS / phaseBlocks`。治理页只用它把「还要等 N 个阶段」翻译成
 * 「约 X 分钟」，从不展示绝对时间。
 */
export function usePhaseClock(options: PhaseClockOptions = {}): PhaseClock {
  const phase = configuredAddress('phase');
  const enabled = phase !== undefined;
  const refetchInterval = options.refetchIntervalMs;

  const currentRead = useReadContract({
    address: phase,
    abi: phaseAbi,
    functionName: 'currentPhase',
    query: { enabled, ...(refetchInterval !== undefined ? { refetchInterval } : {}) },
  });
  const observationsRead = useReadContract({
    address: phase,
    abi: phaseAbi,
    functionName: 'observations',
    args: [0n, 2n, true],
    query: { enabled, ...(refetchInterval !== undefined ? { refetchInterval } : {}) },
  });
  const phaseBlocksRead = useReadContract({
    address: phase,
    abi: phaseAbi,
    functionName: 'currentPhaseBlocks',
    query: { enabled, ...(refetchInterval !== undefined ? { refetchInterval } : {}) },
  });
  const targetSecondsRead = useReadContract({
    address: phase,
    abi: phaseAbi,
    functionName: 'TARGET_SECONDS',
    query: { enabled, ...(refetchInterval !== undefined ? { refetchInterval } : {}) },
  });

  const refetch = () => {
    if (!enabled) return;
    currentRead.refetch();
    observationsRead.refetch();
    phaseBlocksRead.refetch();
    targetSecondsRead.refetch();
  };

  if (phase === undefined) {
    return { status: 'unconfigured', currentPhase: undefined, secondsPerPhase: undefined, refetch };
  }
  if (currentRead.isError) {
    return { status: 'error', currentPhase: undefined, secondsPerPhase: undefined, refetch };
  }
  if (currentRead.data === undefined) {
    return { status: 'loading', currentPhase: undefined, secondsPerPhase: undefined, refetch };
  }

  const secondsPerBlock = secondsPerBlockFromInputs({
    blockNumbers: observationsRead.data?.[0] ?? [],
    blockTimestamps: observationsRead.data?.[1] ?? [],
    targetSeconds: targetSecondsRead.data ?? null,
    phaseBlocks: phaseBlocksRead.data ?? null,
  });
  const phaseBlocks = phaseBlocksRead.data;
  const secondsPerPhase =
    secondsPerBlock !== null && phaseBlocks !== undefined && phaseBlocks > 0n
      ? secondsPerBlock * Number(phaseBlocks)
      : undefined;

  return {
    status: 'ready',
    currentPhase: currentRead.data,
    secondsPerPhase,
    refetch,
  };
}
