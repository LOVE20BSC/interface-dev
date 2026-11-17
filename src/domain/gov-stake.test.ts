import { describe, expect, it } from 'vitest';
import {
  boostAmountFitsCap,
  boostRemainingCap,
  govVotesOf,
  increasedPromisedWaitingPhasesVotes,
  isPromisedWaitingPhasesInRange,
  liquiditySharesAdded,
  optimalAmounts,
  phasesToMinutes,
  projectedGovVotesAdded,
  projectedLiquidityGovVotes,
  stakeUnlockState,
} from './gov-stake';

describe('govVotesOf', () => {
  it('multiplies shares by the promised waiting phases', () => {
    expect(govVotesOf(0n, 5n)).toBe(0n);
    expect(govVotesOf(1n, 1n)).toBe(1n);
    expect(govVotesOf(1_000n, 3n)).toBe(3_000n);
  });

  it('keeps 19-22 digit amounts exact instead of going through number', () => {
    expect(govVotesOf(1_234_567_890_123_456_789n, 3n)).toBe(3_703_703_670_370_370_367n);
    expect(govVotesOf(1_234_567_890_123_456_789_012n, 100n)).toBe(123_456_789_012_345_678_901_200n);
  });
});

describe('optimalAmounts', () => {
  it('truncates the parent side down when the token side is the limiting one', () => {
    // optParent = 1000 * 20000 / 10000 = 2000 > 1000, so mirror the clamp instead.
    expect(
      optimalAmounts({
        tokenAmount: 1_000n,
        parentTokenAmount: 1_000n,
        reserveToken: 10_000n,
        reserveParent: 20_000n,
      }),
    ).toEqual({ tokenAmount: 500n, parentTokenAmount: 1_000n });
  });

  it('keeps both requested amounts when they fit the pool ratio', () => {
    expect(
      optimalAmounts({
        tokenAmount: 1_000n,
        parentTokenAmount: 3_000n,
        reserveToken: 10_000n,
        reserveParent: 10_000n,
      }),
    ).toEqual({ tokenAmount: 1_000n, parentTokenAmount: 1_000n });
  });

  it('truncates down like the EVM (14 / 3 = 4)', () => {
    expect(
      optimalAmounts({
        tokenAmount: 7n,
        parentTokenAmount: 100n,
        reserveToken: 3n,
        reserveParent: 2n,
      }),
    ).toEqual({ tokenAmount: 7n, parentTokenAmount: 4n });
  });

  it('returns the requested amounts unchanged when either reserve is zero', () => {
    const requested = { tokenAmount: 12n, parentTokenAmount: 34n };
    expect(optimalAmounts({ ...requested, reserveToken: 0n, reserveParent: 5_000n })).toEqual(
      requested,
    );
    expect(optimalAmounts({ ...requested, reserveToken: 5_000n, reserveParent: 0n })).toEqual(
      requested,
    );
    expect(optimalAmounts({ ...requested, reserveToken: 0n, reserveParent: 0n })).toEqual(
      requested,
    );
  });

  it('keeps 19-22 digit reserves exact in both branches', () => {
    // Branch 1: optParent = tokenAmount * R_parent / R_token <= parentTokenAmount.
    expect(
      optimalAmounts({
        tokenAmount: 1_234_567_890_123_456_789n,
        parentTokenAmount: 987_654_321_098_765_432n,
        reserveToken: 5_555_555_555_555_555_555n,
        reserveParent: 4_444_444_444_444_444_444n,
      }),
    ).toEqual({
      tokenAmount: 1_234_567_890_123_456_789n,
      parentTokenAmount: 987_654_312_098_765_431n,
    });

    // Branch 2: optParent exceeds the requested parent side, so clamp the token side.
    expect(
      optimalAmounts({
        tokenAmount: 2_222_222_222_222_222_222n,
        parentTokenAmount: 1_111_111_111_111_111_111n,
        reserveToken: 999_999_999_999_999_999n,
        reserveParent: 9_999_999_999_999_999_999n,
      }),
    ).toEqual({
      tokenAmount: 111_111_111_111_111_111n,
      parentTokenAmount: 1_111_111_111_111_111_111n,
    });
  });
});

describe('liquiditySharesAdded', () => {
  it('maps 1 LP to 1 share on the first deposit', () => {
    expect(
      liquiditySharesAdded({ totalLiquidityShares: 0n, withdrawableLp: 1_000n, lpMinted: 500n }),
    ).toBe(500n);
    expect(
      liquiditySharesAdded({ totalLiquidityShares: 0n, withdrawableLp: 0n, lpMinted: 500n }),
    ).toBe(500n);
  });

  it('maps 1 LP to 1 share while the withdrawable-LP bucket is empty', () => {
    expect(
      liquiditySharesAdded({
        totalLiquidityShares: 9_999n,
        withdrawableLp: 0n,
        lpMinted: 1_234n,
      }),
    ).toBe(1_234n);
  });

  it('truncates a non-integral ratio down (100 * 101 / 1000 = 10.1 → 10)', () => {
    expect(
      liquiditySharesAdded({
        totalLiquidityShares: 100n,
        withdrawableLp: 1_000n,
        lpMinted: 101n,
      }),
    ).toBe(10n);
  });

  it('keeps 19-22 digit totals exact', () => {
    // 1234567890123456789012 * 1234567890123456789 / 98765432109876543210
    expect(
      liquiditySharesAdded({
        totalLiquidityShares: 1_234_567_890_123_456_789_012n,
        withdrawableLp: 98_765_432_109_876_543_210n,
        lpMinted: 1_234_567_890_123_456_789n,
      }),
    ).toBe(15_432_098_485_918_211_130n);

    expect(
      liquiditySharesAdded({
        totalLiquidityShares: 9_876_543_210_987_654_321n,
        withdrawableLp: 12_345_678_901_234_567_890n,
        lpMinted: 2_000_000_000_000_000_000n,
      }),
    ).toBe(1_600_000_014_580_000_132n);
  });

  it('never divides by zero for an empty stake or an empty LP bucket', () => {
    expect(
      liquiditySharesAdded({ totalLiquidityShares: 0n, withdrawableLp: 0n, lpMinted: 0n }),
    ).toBe(0n);
  });
});

describe('projectedLiquidityGovVotes', () => {
  it('counts votes on the post-deposit share total', () => {
    expect(
      projectedLiquidityGovVotes({
        currentLiquidityShares: 1_000n,
        currentGovVotes: 3_000n,
        sharesAdded: 234n,
        promisedWaitingPhases: 3n,
      }),
    ).toBe(3_702n);
  });

  it('returns the current votes when nothing is added', () => {
    expect(
      projectedLiquidityGovVotes({
        currentLiquidityShares: 1_234_567_890_123_456_789n,
        currentGovVotes: 2_469_135_780_246_913_578n,
        sharesAdded: 0n,
        promisedWaitingPhases: 2n,
      }),
    ).toBe(2_469_135_780_246_913_578n);
  });

  it('stays 0 for an empty member with no deposit', () => {
    expect(
      projectedLiquidityGovVotes({
        currentLiquidityShares: 0n,
        currentGovVotes: 0n,
        sharesAdded: 0n,
        promisedWaitingPhases: 100n,
      }),
    ).toBe(0n);
  });
});

describe('projectedGovVotesAdded', () => {
  it('subtracts the current votes from the projected total', () => {
    expect(
      projectedGovVotesAdded({
        currentLiquidityShares: 1_000n,
        currentGovVotes: 3_000n,
        sharesAdded: 234n,
        promisedWaitingPhases: 3n,
      }),
    ).toBe(702n);
  });

  it('returns 0 instead of a negative delta when the phases shrank', () => {
    // Before: 10 shares × 3 phases = 30 votes. After: 10 shares × 2 phases = 20.
    expect(
      projectedGovVotesAdded({
        currentLiquidityShares: 10n,
        currentGovVotes: 30n,
        sharesAdded: 0n,
        promisedWaitingPhases: 2n,
      }),
    ).toBe(0n);

    // A deposit cannot rescue it either: 8 shares × 4 phases = 32 < 35.
    expect(
      projectedGovVotesAdded({
        currentLiquidityShares: 7n,
        currentGovVotes: 35n,
        sharesAdded: 1n,
        promisedWaitingPhases: 4n,
      }),
    ).toBe(0n);
  });

  it('returns 0 when the projected total equals the current votes', () => {
    expect(
      projectedGovVotesAdded({
        currentLiquidityShares: 10n,
        currentGovVotes: 40n,
        sharesAdded: 0n,
        promisedWaitingPhases: 4n,
      }),
    ).toBe(0n);
  });

  it('keeps 22 digit deltas exact', () => {
    // (1234567890123456789012 + 1) × 100 - 123456789012345678901200 = 100
    expect(
      projectedGovVotesAdded({
        currentLiquidityShares: 1_234_567_890_123_456_789_012n,
        currentGovVotes: 123_456_789_012_345_678_901_200n,
        sharesAdded: 1n,
        promisedWaitingPhases: 100n,
      }),
    ).toBe(100n);
  });
});

describe('increasedPromisedWaitingPhasesVotes', () => {
  it('charges the phase difference against the current shares', () => {
    expect(
      increasedPromisedWaitingPhasesVotes({
        liquidityShares: 1_000n,
        previousPhases: 2n,
        nextPhases: 5n,
      }),
    ).toBe(3_000n);
  });

  it('keeps 19 digit shares exact', () => {
    expect(
      increasedPromisedWaitingPhasesVotes({
        liquidityShares: 1_234_567_890_123_456_789n,
        previousPhases: 2n,
        nextPhases: 5n,
      }),
    ).toBe(3_703_703_670_370_370_367n);
  });

  it('returns 0 when the phases do not increase', () => {
    expect(
      increasedPromisedWaitingPhasesVotes({
        liquidityShares: 1_000n,
        previousPhases: 5n,
        nextPhases: 5n,
      }),
    ).toBe(0n);
    expect(
      increasedPromisedWaitingPhasesVotes({
        liquidityShares: 1_000n,
        previousPhases: 5n,
        nextPhases: 2n,
      }),
    ).toBe(0n);
    expect(
      increasedPromisedWaitingPhasesVotes({
        liquidityShares: 0n,
        previousPhases: 0n,
        nextPhases: 100n,
      }),
    ).toBe(0n);
  });
});

describe('boostRemainingCap', () => {
  it('subtracts what is already boosted', () => {
    expect(boostRemainingCap(1_000n, 400n)).toBe(600n);
    expect(boostRemainingCap(1_000n, 0n)).toBe(1_000n);
    expect(boostRemainingCap(1_000n, 1_000n)).toBe(0n);
  });

  it('floors at 0 when the cap is already exceeded', () => {
    expect(boostRemainingCap(100n, 150n)).toBe(0n);
    expect(boostRemainingCap(0n, 0n)).toBe(0n);
  });

  it('keeps 22 digit caps exact', () => {
    expect(boostRemainingCap(1_000_000_000_000_000_000_000n, 999_999_999_999_999_999_999n)).toBe(
      1n,
    );
  });
});

describe('boostAmountFitsCap', () => {
  it('accepts a positive amount up to the remaining cap', () => {
    expect(boostAmountFitsCap({ amount: 1n, memberCap: 100n, memberUsed: 0n })).toBe(true);
    expect(boostAmountFitsCap({ amount: 100n, memberCap: 100n, memberUsed: 0n })).toBe(true);
    expect(boostAmountFitsCap({ amount: 600n, memberCap: 1_000n, memberUsed: 400n })).toBe(true);
  });

  it('rejects anything past the remaining cap', () => {
    expect(boostAmountFitsCap({ amount: 101n, memberCap: 100n, memberUsed: 0n })).toBe(false);
    expect(boostAmountFitsCap({ amount: 601n, memberCap: 1_000n, memberUsed: 400n })).toBe(false);
    expect(boostAmountFitsCap({ amount: 1n, memberCap: 100n, memberUsed: 100n })).toBe(false);
    expect(boostAmountFitsCap({ amount: 1n, memberCap: 100n, memberUsed: 150n })).toBe(false);
  });

  it('rejects zero and negative amounts even with room left', () => {
    expect(boostAmountFitsCap({ amount: 0n, memberCap: 100n, memberUsed: 0n })).toBe(false);
    expect(boostAmountFitsCap({ amount: -1n, memberCap: 100n, memberUsed: 0n })).toBe(false);
  });
});

describe('isPromisedWaitingPhasesInRange', () => {
  it('accepts the min and max values themselves', () => {
    expect(isPromisedWaitingPhasesInRange(1n, 1n, 100n)).toBe(true);
    expect(isPromisedWaitingPhasesInRange(100n, 1n, 100n)).toBe(true);
  });

  it('rejects values just outside the range', () => {
    expect(isPromisedWaitingPhasesInRange(0n, 1n, 100n)).toBe(false);
    expect(isPromisedWaitingPhasesInRange(101n, 1n, 100n)).toBe(false);
  });

  it('handles a degenerate range and reversed bounds', () => {
    expect(isPromisedWaitingPhasesInRange(5n, 5n, 5n)).toBe(true);
    expect(isPromisedWaitingPhasesInRange(4n, 5n, 5n)).toBe(false);
    expect(isPromisedWaitingPhasesInRange(6n, 5n, 5n)).toBe(false);
    expect(isPromisedWaitingPhasesInRange(7n, 10n, 5n)).toBe(false);
  });
});

describe('stakeUnlockState', () => {
  it('is not-requested while unlockRequestPhase is 0', () => {
    expect(
      stakeUnlockState({ currentPhase: 7n, unlockRequestPhase: 0n, promisedWaitingPhases: 3n }),
    ).toEqual({ status: 'not-requested' });
    expect(
      stakeUnlockState({ currentPhase: 0n, unlockRequestPhase: 0n, promisedWaitingPhases: 3n }),
    ).toEqual({ status: 'not-requested' });
  });

  it('stays not-requested when the request id is decisive even if the phase is unknown', () => {
    expect(
      stakeUnlockState({ currentPhase: null, unlockRequestPhase: 0n, promisedWaitingPhases: 3n }),
    ).toEqual({ status: 'not-requested' });
  });

  it('is unknown (neither withdrawable nor staked) when an in-flight request has no phase', () => {
    expect(
      stakeUnlockState({ currentPhase: null, unlockRequestPhase: 5n, promisedWaitingPhases: 3n }),
    ).toEqual({ status: 'unknown' });
    expect(
      stakeUnlockState({
        currentPhase: null,
        unlockRequestPhase: 5n,
        promisedWaitingPhases: 3n,
        secondsPerPhase: 12,
      }),
    ).toEqual({ status: 'unknown' });
  });

  it('counts the request phase itself as a full wait', () => {
    // withdrawAtPhase = 5 + 3 = 8; at phase 5 the inclusive wait is 8 - 5 + 1 = 4.
    expect(
      stakeUnlockState({ currentPhase: 5n, unlockRequestPhase: 5n, promisedWaitingPhases: 3n }),
    ).toEqual({
      status: 'unlocking',
      withdrawAtPhase: 8n,
      phasesRemaining: 4n,
      minutes: null,
    });
  });

  it('stays unlocking with one phase left exactly at withdrawAtPhase', () => {
    // The contract requires currentPhase STRICTLY greater than withdrawAtPhase.
    expect(
      stakeUnlockState({
        currentPhase: 8n,
        unlockRequestPhase: 5n,
        promisedWaitingPhases: 3n,
        secondsPerPhase: 60,
      }),
    ).toEqual({
      status: 'unlocking',
      withdrawAtPhase: 8n,
      phasesRemaining: 1n,
      minutes: 1,
    });
  });

  it('becomes withdrawable only one phase after withdrawAtPhase', () => {
    expect(
      stakeUnlockState({ currentPhase: 9n, unlockRequestPhase: 5n, promisedWaitingPhases: 3n }),
    ).toEqual({ status: 'withdrawable', withdrawAtPhase: 8n });
  });

  it('handles a one-phase promise', () => {
    expect(
      stakeUnlockState({ currentPhase: 6n, unlockRequestPhase: 5n, promisedWaitingPhases: 1n }),
    ).toEqual({
      status: 'unlocking',
      withdrawAtPhase: 6n,
      phasesRemaining: 1n,
      minutes: null,
    });
    expect(
      stakeUnlockState({ currentPhase: 7n, unlockRequestPhase: 5n, promisedWaitingPhases: 1n }),
    ).toEqual({ status: 'withdrawable', withdrawAtPhase: 6n });
  });

  it('estimates ceil-minutes for the remaining wait', () => {
    // 3 remaining phases × 90 s = 270 s → 5 minutes.
    expect(
      stakeUnlockState({
        currentPhase: 6n,
        unlockRequestPhase: 5n,
        promisedWaitingPhases: 3n,
        secondsPerPhase: 90,
      }),
    ).toEqual({
      status: 'unlocking',
      withdrawAtPhase: 8n,
      phasesRemaining: 3n,
      minutes: 5,
    });

    // A minute exactly is one minute, and anything above rounds up.
    expect(
      stakeUnlockState({
        currentPhase: 6n,
        unlockRequestPhase: 5n,
        promisedWaitingPhases: 3n,
        secondsPerPhase: 20,
      }),
    ).toMatchObject({ phasesRemaining: 3n, minutes: 1 });
    expect(
      stakeUnlockState({
        currentPhase: 6n,
        unlockRequestPhase: 5n,
        promisedWaitingPhases: 3n,
        secondsPerPhase: 20.5,
      }),
    ).toMatchObject({ phasesRemaining: 3n, minutes: 2 });
  });

  it('leaves minutes null when the phase length is unknown', () => {
    expect(
      stakeUnlockState({
        currentPhase: 6n,
        unlockRequestPhase: 5n,
        promisedWaitingPhases: 3n,
        secondsPerPhase: null,
      }),
    ).toMatchObject({ status: 'unlocking', minutes: null });
    expect(
      stakeUnlockState({
        currentPhase: 6n,
        unlockRequestPhase: 5n,
        promisedWaitingPhases: 3n,
        secondsPerPhase: 0,
      }),
    ).toMatchObject({ status: 'unlocking', minutes: null });
  });

  it('keeps 19 digit phases exact', () => {
    expect(
      stakeUnlockState({
        currentPhase: 1_234_567_890_123_456_789n,
        unlockRequestPhase: 1_234_567_890_123_456_780n,
        promisedWaitingPhases: 100n,
      }),
    ).toEqual({
      status: 'unlocking',
      withdrawAtPhase: 1_234_567_890_123_456_880n,
      phasesRemaining: 92n,
      minutes: null,
    });
  });
});

describe('phasesToMinutes', () => {
  it('rounds whole minutes up', () => {
    expect(phasesToMinutes(1n, 60)).toBe(1);
    expect(phasesToMinutes(1n, 61)).toBe(2);
    expect(phasesToMinutes(2n, 90)).toBe(3);
    expect(phasesToMinutes(100n, 3)).toBe(5);
    expect(phasesToMinutes(100n, 1)).toBe(2);
  });

  it('never reports less than one minute', () => {
    expect(phasesToMinutes(1n, 1)).toBe(1);
    expect(phasesToMinutes(1n, 30)).toBe(1);
    expect(phasesToMinutes(0n, 60)).toBe(1);
    expect(phasesToMinutes(1n, 0.01)).toBe(1);
  });

  it('does not let float noise flip a boundary minute', () => {
    // 100 × 0.6 s is exactly 60 s = 1 minute; 0.6 * 100 in floats is 60.00000000000001.
    expect(phasesToMinutes(100n, 0.6)).toBe(1);
    expect(phasesToMinutes(100n, 0.61)).toBe(2);
    expect(phasesToMinutes(3n, 1.5)).toBe(1);
  });

  it('returns null when the phase length is unknown or unusable', () => {
    expect(phasesToMinutes(3n, null)).toBeNull();
    expect(phasesToMinutes(3n, 0)).toBeNull();
    expect(phasesToMinutes(3n, -1)).toBeNull();
    expect(phasesToMinutes(3n, Number.NaN)).toBeNull();
    expect(phasesToMinutes(3n, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
