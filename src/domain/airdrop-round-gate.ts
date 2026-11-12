/**
 * 轮次门槛 (round gate) for the 空投铸造 page (UX spec §3.4).
 *
 * `AirdropDistributor.claim` reverts `ClaimRoundNotReached` while
 * `Phase.currentPhase() < airdropInfo(token).claimableFromRound`. The UI must
 * show that window as its own state with a *relative* wait — never an absolute
 * timestamp, because Phase counts blocks, not seconds, and `sync()` can change
 * the block length (CI-008).
 *
 * The wait is estimated the same way the pipeline does: remaining blocks ×
 * observed seconds per block, falling back to `TARGET_SECONDS / phaseBlocks`
 * when there are fewer than two observations. Pure TypeScript, no React, no
 * chain SDKs.
 */

export interface RoundGateInput {
  /** `Phase.currentPhase()`; null until the read resolves. */
  readonly currentRound: bigint | null;
  /** `airdropInfo(token).claimableFromRound`; null until the read resolves. */
  readonly claimableFromRound: bigint | null;
}

/** null = either read is still unknown; never collapse that to "reached". */
export function roundGateReached(input: RoundGateInput): boolean | null {
  if (input.currentRound === null || input.claimableFromRound === null) return null;
  return input.currentRound >= input.claimableFromRound;
}

export interface SecondsPerBlockInput {
  /** Ascending or descending block numbers; only relative order matters. */
  readonly blockNumbers: readonly bigint[];
  readonly blockTimestamps: readonly bigint[];
  /** Genesis fallback: the phase target, not a hardcoded chain constant. */
  readonly targetSeconds: bigint | null;
  readonly phaseBlocks: bigint | null;
}

/**
 * Actual seconds per block from the two nearest `Phase.observations` samples.
 * `sync()` may have adjusted the phase length since then, so this remains an
 * estimate by construction; callers always render it as 「约」.
 */
export function secondsPerBlockFromInputs(input: SecondsPerBlockInput): number | null {
  const samples = input.blockNumbers
    .map((block, index) => {
      const timestamp = input.blockTimestamps[index];
      return timestamp === undefined ? null : { block, timestamp };
    })
    .filter((sample): sample is { block: bigint; timestamp: bigint } => sample !== null)
    .sort((left, right) => (left.block < right.block ? -1 : left.block > right.block ? 1 : 0));

  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first !== undefined && last !== undefined && samples.length >= 2) {
    const elapsedBlocks = last.block - first.block;
    const elapsedSeconds = last.timestamp - first.timestamp;
    if (elapsedBlocks > 0n && elapsedSeconds > 0n) {
      return Number((elapsedSeconds * 1_000n) / elapsedBlocks) / 1_000;
    }
  }

  if (input.targetSeconds !== null && input.phaseBlocks !== null && input.phaseBlocks > 0n) {
    return Number((input.targetSeconds * 1_000n) / input.phaseBlocks) / 1_000;
  }
  return null;
}

export interface RoundWaitEstimateInput {
  /** Current chain head. */
  readonly currentBlock: bigint | null;
  /** `phaseInfo(claimableFromRound)` start block; the first claimable block. */
  readonly targetStartBlock: bigint | null;
  readonly secondsPerBlock: number | null;
}

export interface RoundWaitEstimate {
  readonly remainingBlocks: bigint;
  /** Rounded up and never below 1: "约 0 分钟" is not useful copy. */
  readonly minutes: number;
}

/**
 * Wall-clock estimate for the gate. Returns null when any input is unknown so
 * the page can omit the wait line instead of inventing a number.
 */
export function estimateRoundWait(input: RoundWaitEstimateInput): RoundWaitEstimate | null {
  const { currentBlock, targetStartBlock, secondsPerBlock } = input;
  if (currentBlock === null || targetStartBlock === null) return null;
  if (secondsPerBlock === null || !Number.isFinite(secondsPerBlock) || secondsPerBlock <= 0) {
    return null;
  }
  const remainingBlocks =
    targetStartBlock > currentBlock ? targetStartBlock - currentBlock : 0n;
  const seconds = Number(remainingBlocks) * secondsPerBlock;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return { remainingBlocks, minutes };
}
