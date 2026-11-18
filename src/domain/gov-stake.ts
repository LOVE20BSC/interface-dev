/**
 * 治理·质押 (governance staking) arithmetic for the /gov page.
 *
 * Every formula below transcribes one concrete branch of the deployed
 * `core/src/Stake.sol`; none of them is re-derived here:
 *
 *   - 治理票 `govVotes = liquidityShares * promisedWaitingPhases`
 *     — `_govVotesOf` (`member.liquidityShares * member.promisedWaitingPhases`).
 *   - `optimalAmounts`, the two-side clamping done before the pair mint
 *     — `_optimalAmounts`: `optParent = tokenAmount * R_parent / R_token`;
 *       keep both inputs when `optParent <= parentTokenAmount`, otherwise mirror
 *       the truncation onto the other side. Any zero reserve returns the inputs
 *       unchanged (`reserveToken == 0 || reserveParent == 0`).
 *   - `liquiditySharesAdded`, the shares credited for the LP minted this turn
 *     — `_creditLiquidity`:
 *       `totalLiquidityShares == 0 || withdrawableLpBefore == 0
 *        ? lpMinted
 *        : totalLiquidityShares * lpMinted / withdrawableLpBefore`.
 *   - `projectedLiquidityGovVotes`, the member's votes after the stake
 *     — `_stakeLiquidity` → `_creditLiquidity`:
 *       `(member.liquidityShares + sharesAdded) * promisedWaitingPhases`.
 *   - `projectedGovVotesAdded`, the delta the contract records for the turn
 *     — `_creditLiquidity`: `newVotes - _govVotesOf(member)`. Because the
 *       contract recomputes the member's votes with the *new* promised phases,
 *       that subtraction can go negative when the phases shrank. The only use
 *       here is a "预计 +X" hint, which must never read negative, so it is
 *       clamped at 0 (documented divergence: display only, never accounting).
 *   - `increasedPromisedWaitingPhasesVotes`
 *     — `increasePromisedWaitingPhases` (and `_stakeBoost`):
 *       `liquidityShares * (next - previous)`; the contract reverts when
 *       `next < previous`, so the `< 0` branch is clamped at 0 defensively.
 *   - `boostRemainingCap` / `boostAmountFitsCap` — the `boostStakeCap` view
 *     returns `(memberCap, memberUsed)`; the cap formula itself is never
 *     recomputed here.
 *   - `stakeUnlockState` — `withdraw` reverts `UnlockRoundNotReached` while
 *     `round <= unlockRequestPhase + promisedWaitingPhases`, and the
 *     `canWithdraw` view mirrors that with a strictly-greater comparison.
 *   - `phasesToMinutes` — a wall-clock hint only. A Phase counts blocks, and
 *     `sync()` may change the block length (CI-008), so the caller passes the
 *     observed `secondsPerPhase`; the page always renders this as an estimate.
 *
 * Conventions the callers rely on:
 *
 *   1. Unknown is never 0. Reads that have not resolved are modelled as `null`
 *      (`currentPhase`, `secondsPerPhase`) and surface as an explicit `unknown`
 *      status or a `null` result, so the page can omit the line instead of
 *      printing a fabricated 0 (AGENTS.md hard rule 4).
 *   2. Amounts stay `bigint` end to end and division truncates toward zero, the
 *      same way the EVM does. Only `phasesToMinutes` converts to `number`, and
 *      it is bounded (`promisedWaitingPhases <= 100` by contract).
 *
 * Pure TypeScript. No React, no browser globals, no chain SDKs.
 */

/** 治理票: `liquidityShares × promisedWaitingPhases` (`_govVotesOf`). */
export function govVotesOf(liquidityShares: bigint, promisedWaitingPhases: bigint): bigint {
  return liquidityShares * promisedWaitingPhases;
}

export interface OptimalAmountsInput {
  /** 社区代币 side of the stake the user asked for. */
  readonly tokenAmount: bigint;
  /** 父币 side of the stake the user asked for. */
  readonly parentTokenAmount: bigint;
  /** Pair reserve on the 社区代币 side. */
  readonly reserveToken: bigint;
  /** Pair reserve on the 父币 side. */
  readonly reserveParent: bigint;
}

/**
 * Two-side clamp from `_optimalAmounts`. A zero reserve means the pair snapshot
 * is incomplete, and the contract passes the requested amounts through as-is;
 * we do the same so the caller's estimate stays honest about what was asked.
 */
export function optimalAmounts(input: OptimalAmountsInput): {
  readonly tokenAmount: bigint;
  readonly parentTokenAmount: bigint;
} {
  const { tokenAmount, parentTokenAmount, reserveToken, reserveParent } = input;
  if (reserveToken === 0n || reserveParent === 0n) {
    return { tokenAmount, parentTokenAmount };
  }

  const optimalParentTokenAmount = (tokenAmount * reserveParent) / reserveToken;
  if (optimalParentTokenAmount <= parentTokenAmount) {
    return { tokenAmount, parentTokenAmount: optimalParentTokenAmount };
  }

  return {
    tokenAmount: (parentTokenAmount * reserveToken) / reserveParent,
    parentTokenAmount,
  };
}

export interface LiquiditySharesAddedInput {
  readonly totalLiquidityShares: bigint;
  /** `withdrawableLpBefore` in `_creditLiquidity`; 0 before the first stake. */
  readonly withdrawableLp: bigint;
  /** LP minted by this deposit, computed by the caller (Uniswap V2 rules). */
  readonly lpMinted: bigint;
}

/**
 * Shares credited for the LP minted this turn (`_creditLiquidity`). The first
 * deposit (or an empty withdrawable-LP bucket) maps 1 LP = 1 share; afterwards
 * the ratio truncates down like the EVM does.
 */
export function liquiditySharesAdded(input: LiquiditySharesAddedInput): bigint {
  const { totalLiquidityShares, withdrawableLp, lpMinted } = input;
  if (totalLiquidityShares === 0n || withdrawableLp === 0n) return lpMinted;
  return (totalLiquidityShares * lpMinted) / withdrawableLp;
}

export interface ProjectedVotesInput {
  readonly currentLiquidityShares: bigint;
  /** `_govVotesOf(member)` right now, i.e. the "before" value of the delta. */
  readonly currentGovVotes: bigint;
  readonly sharesAdded: bigint;
  readonly promisedWaitingPhases: bigint;
}

/** 质押后该成员的治理票总数（不是增量）。 */
export function projectedLiquidityGovVotes(input: ProjectedVotesInput): bigint {
  return govVotesOf(input.currentLiquidityShares + input.sharesAdded, input.promisedWaitingPhases);
}

/** 本次质押新增的治理票（≥ 0）。 */
export function projectedGovVotesAdded(input: ProjectedVotesInput): bigint {
  const added = projectedLiquidityGovVotes(input) - input.currentGovVotes;
  return added > 0n ? added : 0n;
}

export interface IncreasedPhasesVotesInput {
  readonly liquidityShares: bigint;
  readonly previousPhases: bigint;
  readonly nextPhases: bigint;
}

/** 提高承诺解锁期的新增治理票 (`increasePromisedWaitingPhases`), never negative. */
export function increasedPromisedWaitingPhasesVotes(input: IncreasedPhasesVotesInput): bigint {
  const { liquidityShares, previousPhases, nextPhases } = input;
  if (nextPhases <= previousPhases) return 0n;
  return liquidityShares * (nextPhases - previousPhases);
}

/** 加速质押上限剩余 = `max(0, memberCap - memberUsed)`. */
export function boostRemainingCap(memberCap: bigint, memberUsed: bigint): bigint {
  return memberCap > memberUsed ? memberCap - memberUsed : 0n;
}

/** Whether `amount` can be boosted: positive and no larger than the remaining cap. */
export function boostAmountFitsCap(input: {
  readonly amount: bigint;
  readonly memberCap: bigint;
  readonly memberUsed: bigint;
}): boolean {
  if (input.amount <= 0n) return false;
  return input.amount <= boostRemainingCap(input.memberCap, input.memberUsed);
}

/** `PROMISED_WAITING_PHASES_MIN <= value <= PROMISED_WAITING_PHASES_MAX`. */
export function isPromisedWaitingPhasesInRange(value: bigint, min: bigint, max: bigint): boolean {
  return value >= min && value <= max;
}

export type StakeUnlockState =
  | { readonly status: 'not-requested' }
  | { readonly status: 'unknown' }
  | {
      readonly status: 'unlocking';
      readonly withdrawAtPhase: bigint;
      readonly phasesRemaining: bigint;
      readonly minutes: number | null;
    }
  | { readonly status: 'withdrawable'; readonly withdrawAtPhase: bigint };

export interface StakeUnlockStateInput {
  /** 当前阶段（`Phase.currentPhase()`）；读不到传 null。 */
  readonly currentPhase: bigint | null;
  /** 0n = 没有在途解锁申请。 */
  readonly unlockRequestPhase: bigint;
  readonly promisedWaitingPhases: bigint;
  /** 每个阶段的秒数（估算值，未知传 null）。 */
  readonly secondsPerPhase?: number | null;
}

/**
 * Unlock state machine. `withdraw` only succeeds once
 * `currentPhase > unlockRequestPhase + promisedWaitingPhases`; being exactly at
 * `withdrawAtPhase` still waits, and the wait reported is inclusive of both ends
 * (`withdrawAtPhase - currentPhase + 1`, so exactly at the boundary it is 1).
 *
 * `unlockRequestPhase === 0n` is decisive on its own: no request is in flight,
 * so the state is `not-requested` even while `currentPhase` is still unknown.
 * An in-flight request with an unknown current phase is `unknown`, never
 * "withdrawable" and never "not requested".
 */
export function stakeUnlockState(input: StakeUnlockStateInput): StakeUnlockState {
  const { currentPhase, unlockRequestPhase, promisedWaitingPhases } = input;
  if (unlockRequestPhase === 0n) return { status: 'not-requested' };
  if (currentPhase === null) return { status: 'unknown' };

  const withdrawAtPhase = unlockRequestPhase + promisedWaitingPhases;
  if (currentPhase > withdrawAtPhase) {
    return { status: 'withdrawable', withdrawAtPhase };
  }

  const phasesRemaining = withdrawAtPhase - currentPhase + 1n;
  return {
    status: 'unlocking',
    withdrawAtPhase,
    phasesRemaining,
    minutes: phasesToMinutes(phasesRemaining, input.secondsPerPhase ?? null),
  };
}

const MILLISECONDS_PER_SECOND = 1_000;
const MILLISECONDS_PER_MINUTE = 60 * MILLISECONDS_PER_SECOND;

/**
 * Phases → ceil-minutes, never below 1 ("约 0 分钟" is useless copy). Unknown or
 * unusable `secondsPerPhase` (`null`, 0, negative, NaN, ±Infinity) returns
 * `null` so the caller omits the estimate.
 *
 * The conversion goes through whole milliseconds: with the phase length capped
 * at 100, the only float step is `secondsPerPhase * 1000`, and rounding it once
 * keeps e.g. 100 × 0.6 s = 60 s at 1 minute instead of 2.
 */
export function phasesToMinutes(phases: bigint, secondsPerPhase: number | null): number | null {
  if (secondsPerPhase === null || !Number.isFinite(secondsPerPhase) || secondsPerPhase <= 0) {
    return null;
  }
  const millisecondsPerPhase = Math.round(secondsPerPhase * MILLISECONDS_PER_SECOND);
  const totalMilliseconds = Number(phases) * millisecondsPerPhase;
  return Math.max(1, Math.ceil(totalMilliseconds / MILLISECONDS_PER_MINUTE));
}

/** 1 小时 / 1 天，单位秒；阶段长度由协议决定，这里只做展示换算。 */
const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_DAY = 86_400;

/**
 * 阶段数 → 便于阅读的时长估算（owner 2026-11-18 20:05：承诺解锁期下拉里除了
 * 阶段数还要显示预估时间，「超过 1 天用 x.x 天」）。
 *
 * 只做展示：阶段长度来自调用方观测到的 `secondsPerPhase`，协议 `sync()` 可能改变
 * 出块速度，所以页面永远写成「约」。阶段长度未知 / 非法时返回 `{ kind: 'unknown' }`，
 * 调用方省略估算而不是印一个假时间（AGENTS.md 硬规则 4）。
 *
 * 单位切换：< 1 小时按整分钟（向上取整、至少 1 分钟）；< 1 天按小时（一位小数）；
 * 其余按天（一位小数）。返回值是已四舍五入到一位小数的 `number`，格式化交给
 * copy 层（领域层不出现中文）。
 */
export type PhaseDuration =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'minutes'; readonly minutes: number }
  | { readonly kind: 'hours'; readonly hours: number }
  | { readonly kind: 'days'; readonly days: number };

/** 保留一位小数（去掉浮点噪声，如 3.3000000000000003 → 3.3）。 */
function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function phasesToDuration(phases: bigint, secondsPerPhase: number | null): PhaseDuration {
  if (secondsPerPhase === null || !Number.isFinite(secondsPerPhase) || secondsPerPhase <= 0) {
    return { kind: 'unknown' };
  }
  const millisecondsPerPhase = Math.round(secondsPerPhase * MILLISECONDS_PER_SECOND);
  const totalMilliseconds = Number(phases) * millisecondsPerPhase;
  if (totalMilliseconds < SECONDS_PER_HOUR * MILLISECONDS_PER_SECOND) {
    return {
      kind: 'minutes',
      minutes: Math.max(1, Math.ceil(totalMilliseconds / MILLISECONDS_PER_MINUTE)),
    };
  }
  if (totalMilliseconds < SECONDS_PER_DAY * MILLISECONDS_PER_SECOND) {
    return {
      kind: 'hours',
      hours: roundToOne(totalMilliseconds / (SECONDS_PER_HOUR * MILLISECONDS_PER_SECOND)),
    };
  }
  return {
    kind: 'days',
    days: roundToOne(totalMilliseconds / (SECONDS_PER_DAY * MILLISECONDS_PER_SECOND)),
  };
}
