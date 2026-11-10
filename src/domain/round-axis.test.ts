import { describe, expect, it } from 'vitest';
import {
  governanceMintWindow,
  RoundAxis,
  layerStages,
  roundOffsets,
  ROUND_LAYERS,
  ROUND_STAGES,
  stageOrder,
  stageRound,
  type RoundLayer,
  type RoundStage,
  type StageRoundResult,
} from './round-axis';

function open(result: StageRoundResult) {
  if (result.status !== 'open') {
    throw new Error(`expected open, received ${result.status}`);
  }
  return result;
}

function notStarted(result: StageRoundResult) {
  if (result.status !== 'not-started') {
    throw new Error(`expected not-started, received ${result.status}`);
  }
  return result;
}

describe('round axis offsets', () => {
  it('matches the contract offset table', () => {
    expect(roundOffsets('governance')).toEqual({ vote: 0, mint: 0 });
    expect(roundOffsets('lp')).toEqual({ vote: 0, join: 1, mint: 2 });
    expect(roundOffsets('group-action')).toEqual({ vote: 0, join: 1, verify: 2, mint: 3 });
    expect(roundOffsets('group-service')).toEqual({ vote: 0, join: 1, verify: 2, mint: 3 });
  });

  it('LP has no verify stage; governance has no join/verify stage', () => {
    expect(stageOrder('lp')).toEqual(['vote', 'join', 'mint']);
    expect(stageOrder('governance')).toEqual(['vote', 'mint']);
    expect(stageRound('lp', 'verify', 4).status).toBe('not-applicable');
    expect(stageRound('governance', 'join', 4).status).toBe('not-applicable');
    expect(stageRound('governance', 'verify', 4).status).toBe('not-applicable');
  });
});

describe('LP axis: vote = p, join = p-1, mint = p-2', () => {
  it.each([
    [1, { vote: 1, join: null, mint: null }],
    [2, { vote: 2, join: 1, mint: null }],
    [3, { vote: 3, join: 2, mint: 1 }],
    [4, { vote: 4, join: 3, mint: 2 }],
  ] as const)('phase %i', (phase, expected) => {
    for (const stage of ['vote', 'join', 'mint'] as const) {
      const result = stageRound('lp', stage, phase);
      if (expected[stage] === null) {
        expect(result.status).toBe('not-started');
      } else {
        expect(open(result).round).toBe(expected[stage]);
      }
    }
  });

  it('reports the under-1 computed value instead of a sentinel round', () => {
    const mint = notStarted(stageRound('lp', 'mint', 1));
    expect(mint.computedRound).toBe(-1);
    expect(mint.opensAtPhase).toBe(3);
    expect('round' in mint).toBe(false);

    const join = notStarted(stageRound('lp', 'join', 1));
    expect(join.computedRound).toBe(0);
    expect(join.opensAtPhase).toBe(2);
    expect('round' in join).toBe(false);
  });
});

describe('GroupAction axis: vote = p, join = p-1, verify = p-2, mint = p-3', () => {
  it.each([
    [1, { vote: 1, join: null, verify: null, mint: null }],
    [2, { vote: 2, join: 1, verify: null, mint: null }],
    [3, { vote: 3, join: 2, verify: 1, mint: null }],
    [4, { vote: 4, join: 3, verify: 2, mint: 1 }],
    [5, { vote: 5, join: 4, verify: 3, mint: 2 }],
  ] as const)('phase %i', (phase, expected) => {
    for (const stage of ROUND_STAGES) {
      const result = stageRound('group-action', stage, phase);
      if (expected[stage] === null) {
        expect(result.status).toBe('not-started');
      } else {
        expect(open(result).round).toBe(expected[stage]);
      }
    }
  });

  it('phase 1 yields computed rounds 0, -1, -2 and all are not-started', () => {
    expect(notStarted(stageRound('group-action', 'join', 1)).computedRound).toBe(0);
    expect(notStarted(stageRound('group-action', 'verify', 1)).computedRound).toBe(-1);
    expect(notStarted(stageRound('group-action', 'mint', 1)).computedRound).toBe(-2);
  });

  it('all four stages are open from phase 4 onward', () => {
    expect(stageOrder('group-action')).toEqual(['vote', 'join', 'verify', 'mint']);
    for (const stage of ROUND_STAGES) {
      expect(stageRound('group-action', stage, 4).status).toBe('open');
    }
  });
});

describe('GroupService axis', () => {
  it('shares offsets with GroupAction but its verify stage needs no user action', () => {
    for (const stage of ROUND_STAGES) {
      const action = stageRound('group-action', stage, 5);
      const service = stageRound('group-service', stage, 5);
      expect(service.status).toBe(action.status);
      if (action.status === 'open' && service.status === 'open') {
        expect(service.round).toBe(action.round);
      }
    }

    const verify = open(stageRound('group-service', 'verify', 5));
    expect(verify.round).toBe(3);
    expect(verify.requiresUserAction).toBe(false);

    const mint = open(stageRound('group-service', 'mint', 5));
    expect(mint.round).toBe(2);
    expect(mint.requiresUserAction).toBe(true);
  });

  it('keeps the silent verify status even before it starts', () => {
    const verify = notStarted(stageRound('group-service', 'verify', 2));
    expect(verify.requiresUserAction).toBe(false);
    expect(verify.opensAtPhase).toBe(3);
  });
});

describe('governance axis', () => {
  it('vote is the current phase round', () => {
    for (const phase of [1, 2, 3, 4]) {
      expect(open(stageRound('governance', 'vote', phase)).round).toBe(phase);
    }
  });

  it('mint of round p waits for phase p to end', () => {
    for (const phase of [1, 2, 3, 4]) {
      const result = stageRound('governance', 'mint', phase);
      expect(result.status).toBe('awaiting-phase-end');
      if (result.status === 'awaiting-phase-end') {
        expect(result.round).toBe(phase);
        expect(result.opensAtPhase).toBe(phase + 1);
        expect(result.requiresUserAction).toBe(true);
      }
    }
  });

  it('the mintable governance round at phase p is p-1', () => {
    expect(governanceMintWindow(1)).toEqual({ status: 'not-started', opensAtPhase: 2 });
    expect(governanceMintWindow(2)).toEqual({ status: 'open', round: 1 });
    expect(governanceMintWindow(4)).toEqual({ status: 'open', round: 3 });
    expect(governanceMintWindow(999)).toEqual({ status: 'open', round: 998 });
  });
});

describe('phase validation', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects phase %s', (phase) => {
    expect(() => stageRound('lp', 'vote', phase)).toThrow(RangeError);
  });
});

describe('layerStages', () => {
  it('returns only stages that exist for the layer', () => {
    expect(layerStages('lp', 1).map((entry) => entry.stage)).toEqual(['vote', 'join', 'mint']);
    expect(layerStages('governance', 1).map((entry) => entry.stage)).toEqual(['vote', 'mint']);
    expect(layerStages('group-service', 1)).toHaveLength(4);
  });

  it('covers every layer/stage combination without throwing', () => {
    for (const layer of ROUND_LAYERS) {
      for (const phase of [1, 2, 3, 4]) {
        const results = layerStages(layer, phase);
        expect(results.length).toBeGreaterThan(0);
        for (const result of results) {
          expect(['open', 'awaiting-phase-end', 'not-started', 'not-applicable']).toContain(
            result.status,
          );
        }
      }
    }
  });
});

describe('type-level contract', () => {
  it('not-started results are distinguishable without a round sentinel', () => {
    const result: StageRoundResult = stageRound('group-action', 'mint', 2);
    if (result.status === 'not-started') {
      expect(result.computedRound).toBeLessThan(1);
      expect(result.opensAtPhase).toBe(4);
    } else {
      throw new Error('expected not-started');
    }
  });

  it('exposes every layer and stage as constants', () => {
    expect(ROUND_LAYERS).toEqual(['governance', 'lp', 'group-action', 'group-service']);
    expect(ROUND_STAGES).toEqual(['vote', 'join', 'verify', 'mint']);
    const layer: RoundLayer = 'lp';
    const stage: RoundStage = 'mint';
    expect(stageRound(layer, stage, 3).status).toBe('open');
    expect(RoundAxis.stage(layer, stage, 3).status).toBe('open');
    expect(RoundAxis.governanceMintWindow(2)).toEqual({ status: 'open', round: 1 });
  });
});
