/**
 * Phase → Round axes for every protocol layer.
 *
 * Facts (matt-gov/CONTEXT.md, quoted in .research/domain-model.md §3):
 *   currentPhase = p
 *   governance:  vote = p, mint of round p only after that phase ends
 *   LP action:   vote = p, join = p-1, mint = p-2          (no verify stage)
 *   GroupAction: vote = p, join = p-1, verify = p-2, mint = p-3
 *   GroupService: same as GroupAction; its verify stage requires no user action
 *                  (it reuses the GroupAction verification result)
 *
 * A computed round < 1 means the stage has not started yet. The contracts REVERT
 * in that case rather than returning 0, so this module models it as an explicit
 * discriminated union: a "not-started" result has no `round` field at all.
 *
 * Pure TypeScript. No React, no window, no chain SDKs.
 */

export const ROUND_LAYERS = ['governance', 'lp', 'group-action', 'group-service'] as const;
export type RoundLayer = (typeof ROUND_LAYERS)[number];

export const ROUND_STAGES = ['vote', 'join', 'verify', 'mint'] as const;
export type RoundStage = (typeof ROUND_STAGES)[number];

export interface OpenStageRound {
  readonly status: 'open';
  readonly layer: RoundLayer;
  readonly stage: RoundStage;
  readonly phase: number;
  readonly offset: number;
  readonly round: number;
  readonly requiresUserAction: boolean;
}

export interface AwaitingPhaseEndStageRound {
  readonly status: 'awaiting-phase-end';
  readonly layer: 'governance';
  readonly stage: 'mint';
  readonly phase: number;
  readonly offset: 0;
  readonly round: number;
  readonly opensAtPhase: number;
  readonly requiresUserAction: true;
}

export interface NotStartedStageRound {
  readonly status: 'not-started';
  readonly layer: RoundLayer;
  readonly stage: RoundStage;
  readonly phase: number;
  readonly offset: number;
  /** The contract would compute this (≤ 0) value; it is not a valid round. */
  readonly computedRound: number;
  /** First phase at which this stage's round 1 exists. */
  readonly opensAtPhase: number;
  readonly requiresUserAction: boolean;
}

export interface NotApplicableStageRound {
  readonly status: 'not-applicable';
  readonly layer: RoundLayer;
  readonly stage: RoundStage;
  readonly phase: number;
  readonly reason: 'stage-does-not-exist';
}

export type StageRoundResult =
  OpenStageRound | AwaitingPhaseEndStageRound | NotStartedStageRound | NotApplicableStageRound;

interface LayerAxis {
  readonly offsets: Partial<Readonly<Record<RoundStage, number>>>;
  readonly stagesWithoutUserAction: readonly RoundStage[];
}

const AXES: Readonly<Record<RoundLayer, LayerAxis>> = Object.freeze({
  governance: Object.freeze({
    offsets: Object.freeze({ vote: 0, mint: 0 }),
    stagesWithoutUserAction: [] as readonly RoundStage[],
  }),
  lp: Object.freeze({
    offsets: Object.freeze({ vote: 0, join: 1, mint: 2 }),
    stagesWithoutUserAction: [] as readonly RoundStage[],
  }),
  'group-action': Object.freeze({
    offsets: Object.freeze({ vote: 0, join: 1, verify: 2, mint: 3 }),
    stagesWithoutUserAction: [] as readonly RoundStage[],
  }),
  'group-service': Object.freeze({
    offsets: Object.freeze({ vote: 0, join: 1, verify: 2, mint: 3 }),
    // The verify stage exists on the axis, but no user action is expected.
    stagesWithoutUserAction: ['verify'] as readonly RoundStage[],
  }),
});

export const STAGE_ORDER: Readonly<Record<RoundLayer, readonly RoundStage[]>> = Object.freeze({
  governance: ['vote', 'mint'],
  lp: ['vote', 'join', 'mint'],
  'group-action': ['vote', 'join', 'verify', 'mint'],
  'group-service': ['vote', 'join', 'verify', 'mint'],
});

export function assertPhase(phase: number): void {
  if (!Number.isSafeInteger(phase) || phase < 1) {
    throw new RangeError(
      `phase must be a positive integer (received ${String(phase)}); phase 0 means "not started" and must be handled by the caller`,
    );
  }
}

function requiresUserAction(layer: RoundLayer, stage: RoundStage): boolean {
  return !AXES[layer].stagesWithoutUserAction.includes(stage);
}

/** Stage order, with stages that do not exist in this layer removed. */
export function stageOrder(layer: RoundLayer): readonly RoundStage[] {
  return STAGE_ORDER[layer];
}

/** The offset table as data, for advanced views/tests. Never mutate the returned copy. */
export function roundOffsets(layer: RoundLayer): Readonly<Partial<Record<RoundStage, number>>> {
  return AXES[layer].offsets;
}

/**
 * Resolve one stage against the current phase.
 *
 * @example
 *   stageRound('lp', 'mint', 1)   // { status: 'not-started', computedRound: -1, ... }
 *   stageRound('lp', 'mint', 3)   // { status: 'open', round: 1, ... }
 *   stageRound('governance', 'mint', 4)
 *     // { status: 'awaiting-phase-end', round: 4, opensAtPhase: 5, ... }
 */
export function stageRound(layer: RoundLayer, stage: RoundStage, phase: number): StageRoundResult {
  assertPhase(phase);

  if (layer === 'governance' && stage === 'mint') {
    return {
      status: 'awaiting-phase-end',
      layer,
      stage,
      phase,
      offset: 0,
      round: phase,
      opensAtPhase: phase + 1,
      requiresUserAction: true,
    };
  }

  const offset = AXES[layer].offsets[stage];
  if (offset === undefined) {
    return {
      status: 'not-applicable',
      layer,
      stage,
      phase,
      reason: 'stage-does-not-exist',
    };
  }

  const round = phase - offset;
  if (round < 1) {
    return {
      status: 'not-started',
      layer,
      stage,
      phase,
      offset,
      computedRound: round,
      opensAtPhase: offset + 1,
      requiresUserAction: requiresUserAction(layer, stage),
    };
  }

  return {
    status: 'open',
    layer,
    stage,
    phase,
    offset,
    round,
    requiresUserAction: requiresUserAction(layer, stage),
  };
}

/** All stages of a layer, including not-applicable entries. */
export function layerStages(layer: RoundLayer, phase: number): readonly StageRoundResult[] {
  return STAGE_ORDER[layer].map((stage) => stageRound(layer, stage, phase));
}

export type GovernanceMintWindow =
  | { readonly status: 'open'; readonly round: number }
  | { readonly status: 'not-started'; readonly opensAtPhase: number };

/**
 * Which governance round can actually be minted at `phase`.
 * Round p is mintable only once phase p has ended, i.e. from phase p+1 onward,
 * so at phase p the mintable round is p-1.
 */
export function governanceMintWindow(phase: number): GovernanceMintWindow {
  assertPhase(phase);
  if (phase === 1) {
    return { status: 'not-started', opensAtPhase: 2 };
  }
  return { status: 'open', round: phase - 1 };
}

/**
 * Named public surface for callers that prefer a single import:
 *   RoundAxis.stage('lp', 'mint', phase)
 */
export const RoundAxis = Object.freeze({
  stage: stageRound,
  stages: layerStages,
  order: stageOrder,
  offsets: roundOffsets,
  governanceMintWindow,
});
