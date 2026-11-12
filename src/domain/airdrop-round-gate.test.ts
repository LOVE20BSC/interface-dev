import { describe, expect, it } from 'vitest';
import {
  estimateRoundWait,
  roundGateReached,
  secondsPerBlockFromInputs,
} from './airdrop-round-gate';

describe('roundGateReached', () => {
  it('is true only at or past claimableFromRound', () => {
    expect(roundGateReached({ currentRound: 1n, claimableFromRound: 2n })).toBe(false);
    expect(roundGateReached({ currentRound: 2n, claimableFromRound: 2n })).toBe(true);
    expect(roundGateReached({ currentRound: 3n, claimableFromRound: 2n })).toBe(true);
  });

  it('never treats an unknown read as reached', () => {
    expect(roundGateReached({ currentRound: null, claimableFromRound: 2n })).toBeNull();
    expect(roundGateReached({ currentRound: 1n, claimableFromRound: null })).toBeNull();
  });
});

describe('secondsPerBlockFromInputs', () => {
  it('uses the two observed samples regardless of ordering', () => {
    expect(
      secondsPerBlockFromInputs({
        blockNumbers: [110n, 100n],
        blockTimestamps: [1010n, 1000n],
        targetSeconds: 120n,
        phaseBlocks: 120n,
      }),
    ).toBe(1);
    expect(
      secondsPerBlockFromInputs({
        blockNumbers: [100n, 110n],
        blockTimestamps: [1000n, 1011n],
        targetSeconds: 120n,
        phaseBlocks: 60n,
      }),
    ).toBe(1.1);
  });

  it('falls back to TARGET_SECONDS / currentPhaseBlocks without two samples', () => {
    expect(
      secondsPerBlockFromInputs({
        blockNumbers: [100n],
        blockTimestamps: [1000n],
        targetSeconds: 120n,
        phaseBlocks: 60n,
      }),
    ).toBe(2);
    expect(
      secondsPerBlockFromInputs({
        blockNumbers: [],
        blockTimestamps: [],
        targetSeconds: null,
        phaseBlocks: 60n,
      }),
    ).toBeNull();
  });

  it('ignores non-positive elapsed values', () => {
    expect(
      secondsPerBlockFromInputs({
        blockNumbers: [100n, 100n],
        blockTimestamps: [1000n, 1000n],
        targetSeconds: 120n,
        phaseBlocks: 120n,
      }),
    ).toBe(1);
    expect(
      secondsPerBlockFromInputs({
        blockNumbers: [100n, 110n],
        blockTimestamps: [1000n, 999n],
        targetSeconds: 120n,
        phaseBlocks: 0n,
      }),
    ).toBeNull();
  });
});

describe('estimateRoundWait', () => {
  it('converts the remaining block distance into ceil-minutes when gated', () => {
    expect(
      estimateRoundWait({ currentBlock: 100n, targetStartBlock: 121n, secondsPerBlock: 1 }),
    ).toEqual({ remainingBlocks: 21n, minutes: 1 });
    expect(
      estimateRoundWait({ currentBlock: 100n, targetStartBlock: 400n, secondsPerBlock: 1.5 }),
    ).toEqual({ remainingBlocks: 300n, minutes: 8 });
    expect(
      estimateRoundWait({ currentBlock: 100n, targetStartBlock: 130n, secondsPerBlock: 0.5 }),
    ).toEqual({ remainingBlocks: 30n, minutes: 1 });
  });

  it('never returns "约 0 分钟" or an absolute timestamp', () => {
    expect(
      estimateRoundWait({ currentBlock: 120n, targetStartBlock: 121n, secondsPerBlock: 1 }),
    ).toEqual({ remainingBlocks: 1n, minutes: 1 });
    expect(
      estimateRoundWait({ currentBlock: 121n, targetStartBlock: 121n, secondsPerBlock: 1 }),
    ).toEqual({ remainingBlocks: 0n, minutes: 1 });
  });

  it('returns null instead of inventing a wait when a read is unknown', () => {
    expect(
      estimateRoundWait({ currentBlock: null, targetStartBlock: 121n, secondsPerBlock: 1 }),
    ).toBeNull();
    expect(
      estimateRoundWait({ currentBlock: 100n, targetStartBlock: null, secondsPerBlock: 1 }),
    ).toBeNull();
    expect(
      estimateRoundWait({ currentBlock: 100n, targetStartBlock: 121n, secondsPerBlock: null }),
    ).toBeNull();
    expect(
      estimateRoundWait({ currentBlock: 100n, targetStartBlock: 121n, secondsPerBlock: 0 }),
    ).toBeNull();
  });
});
