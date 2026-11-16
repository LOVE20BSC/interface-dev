/**
 * Phase → Round axes for the four round kinds（治理轮 / LP 行动轮 / 链群行动轮 / 链群服务轮）。
 *
 * 一个阶段(Phase)是全局时钟的一格；一个轮次(Round)是把相邻几格串起来的流水线。
 * 第 X 轮的各环节分别落在阶段 X、X+1、X+2、X+3（环节数量按轮次类型不同）。
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

export const ROUND_KINDS = ['governance', 'lp', 'group-action', 'group-service'] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];

export const ROUND_STAGES = ['vote', 'join', 'verify', 'mint'] as const;
export type RoundStage = (typeof ROUND_STAGES)[number];

export interface OpenStageRound {
  readonly status: 'open';
  readonly kind: RoundKind;
  readonly stage: RoundStage;
  readonly phase: number;
  readonly offset: number;
  readonly round: number;
  readonly requiresUserAction: boolean;
}

export interface AwaitingPhaseEndStageRound {
  readonly status: 'awaiting-phase-end';
  readonly kind: 'governance';
  readonly stage: 'mint';
  readonly phase: number;
  readonly offset: 0;
  readonly round: number;
  readonly opensAtPhase: number;
  readonly requiresUserAction: true;
}

export interface NotStartedStageRound {
  readonly status: 'not-started';
  readonly kind: RoundKind;
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
  readonly kind: RoundKind;
  readonly stage: RoundStage;
  readonly phase: number;
  readonly reason: 'stage-does-not-exist';
}

export type StageRoundResult =
  OpenStageRound | AwaitingPhaseEndStageRound | NotStartedStageRound | NotApplicableStageRound;

interface KindAxis {
  readonly offsets: Partial<Readonly<Record<RoundStage, number>>>;
  readonly stagesWithoutUserAction: readonly RoundStage[];
}

const AXES: Readonly<Record<RoundKind, KindAxis>> = Object.freeze({
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

export const STAGE_ORDER: Readonly<Record<RoundKind, readonly RoundStage[]>> = Object.freeze({
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

function requiresUserAction(kind: RoundKind, stage: RoundStage): boolean {
  return !AXES[kind].stagesWithoutUserAction.includes(stage);
}

/** Stage order, with stages that do not exist in this kind removed. */
export function stageOrder(kind: RoundKind): readonly RoundStage[] {
  return STAGE_ORDER[kind];
}

/** The offset table as data, for advanced views/tests. Never mutate the returned copy. */
export function roundOffsets(kind: RoundKind): Readonly<Partial<Record<RoundStage, number>>> {
  return AXES[kind].offsets;
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
export function stageRound(kind: RoundKind, stage: RoundStage, phase: number): StageRoundResult {
  assertPhase(phase);

  if (kind === 'governance' && stage === 'mint') {
    return {
      status: 'awaiting-phase-end',
      kind,
      stage,
      phase,
      offset: 0,
      round: phase,
      opensAtPhase: phase + 1,
      requiresUserAction: true,
    };
  }

  const offset = AXES[kind].offsets[stage];
  if (offset === undefined) {
    return {
      status: 'not-applicable',
      kind,
      stage,
      phase,
      reason: 'stage-does-not-exist',
    };
  }

  const round = phase - offset;
  if (round < 1) {
    return {
      status: 'not-started',
      kind,
      stage,
      phase,
      offset,
      computedRound: round,
      opensAtPhase: offset + 1,
      requiresUserAction: requiresUserAction(kind, stage),
    };
  }

  return {
    status: 'open',
    kind,
    stage,
    phase,
    offset,
    round,
    requiresUserAction: requiresUserAction(kind, stage),
  };
}

/** All stages of a kind, including not-applicable entries. */
export function kindStages(kind: RoundKind, phase: number): readonly StageRoundResult[] {
  return STAGE_ORDER[kind].map((stage) => stageRound(kind, stage, phase));
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
  stages: kindStages,
  order: stageOrder,
  offsets: roundOffsets,
  governanceMintWindow,
});
