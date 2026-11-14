/**
 * Bounded transaction watching — pure state machine (no React, no wagmi).
 *
 * A submitted transaction is not done when the wallet returns a hash: the hash
 * still has to be mined. Watching `eth_getTransactionReceipt` without a deadline
 * traps the page in 确认中 forever whenever the transaction is dropped, replaced,
 * underpriced, cancelled in the wallet, or signed with a nonce ahead of the
 * chain (the confirmed /mint bug: wallet nonce 68 vs on-chain nonce 3). This
 * module gives the watcher one place to decide, from plain chain observations,
 * whether it is still waiting, done, or stuck — and which kind of stuck.
 *
 * The React poller lives in `shared/model/use-tx-watch.ts`; this file is tested
 * with plain functions so every transition is provable without a browser.
 */

export type HexHash = `0x${string}`;

/**
 * Default deadline for a submitted transaction, in milliseconds.
 *
 * 90 s covers BSC block time (~3 s) with a wide margin while leaving a slow
 * mobile wallet plenty of time; the UI never prints the raw number (it shows
 * 「约 X 秒」). `VITE_TX_DEADLINE_MS` overrides it (Playwright shortens the wait);
 * a malformed or absurd value falls back to this default.
 */
export const DEFAULT_TX_DEADLINE_MS = 90_000;

/** Smallest accepted override; below this the recovery card would flicker. */
export const MIN_TX_DEADLINE_MS = 1_000;

/** Parses the build-time override; anything unusable becomes the 90 s default. */
export function resolveTxDeadlineMs(raw: unknown): number {
  const candidate =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseFloat(raw) : Number.NaN;
  if (!Number.isFinite(candidate) || candidate <= 0) return DEFAULT_TX_DEADLINE_MS;
  return Math.max(MIN_TX_DEADLINE_MS, Math.floor(candidate));
}

/**
 * Every state the UI can render.
 *
 * - `wallet`   — waiting for the wallet to return a signature/hash (no hash yet)
 * - `pending`  — hash known, inside the deadline, receipt not mined yet
 * - `confirmed`— mined successfully (caller gets the receipt)
 * - `reverted` — mined but the contract rejected it (existing error copy)
 * - `slow`     — deadline passed but the transaction still exists in the pool
 * - `dropped`  — deadline passed and `eth_getTransactionByHash` returns null
 * - `replaced` — a different transaction with the same wallet+nonce was mined
 * - `nonceGap` — the transaction nonce is ahead of the wallet's on-chain nonce
 */
export type TxWatchStatus =
  | 'idle'
  | 'wallet'
  | 'pending'
  | 'confirmed'
  | 'reverted'
  | 'slow'
  | 'dropped'
  | 'replaced'
  | 'nonceGap';

/** The transaction produced a final receipt; the caller owns what happens next. */
export type TxWatchSettledStatus = 'confirmed' | 'reverted';

/** The hash will not produce a receipt by itself; the page must offer a way out. */
export type TxWatchRecoveryStatus = 'slow' | 'dropped' | 'replaced' | 'nonceGap';

/**
 * How long the same nonce gap must persist before it becomes the 「卡在钱包里」
 * recovery card.
 *
 * The submitter now pins the nonce read from the same chain the watcher polls, so
 * a mined-and-consecutive transaction never looks gapped. The remaining risk is a
 * read race: `eth_getTransactionByHash` (pool, fresh) can disagree with
 * `eth_getTransactionCount` (latest block) for a beat, and a single disagreeing
 * read used to freeze the page on a card that told the user to clear the wallet's
 * activity records. A 10 s sustained gap is a fact; a one-poll residue is noise.
 */
export const TX_WATCH_NONCE_GAP_GRACE_MS = 10_000;

export interface TxWatchTxObservation {
  readonly nonce: number;
  readonly from: string;
}

export interface TxWatchReceiptObservation {
  readonly status: 'success' | 'reverted';
}

/**
 * One chain read of the watched transaction.
 *
 * `tx` is deliberately three-valued: `null` means the node answered "no such
 * transaction" (so a passed deadline means dropped), while `undefined` means the
 * read itself failed (so a passed deadline must not claim "dropped" — the
 * watcher keeps the conservative `slow` verdict until a read succeeds).
 */
export interface TxWatchObservation {
  readonly receipt: TxWatchReceiptObservation | null;
  readonly tx: TxWatchTxObservation | null | undefined;
  /** Mined-transaction count for the wallet (`latest` block). */
  readonly walletNonce: number | undefined;
  /**
   * Pool-aware count for the wallet (`pending` block): it already includes this
   * transaction and every cheaper nonce queued ahead of it. A transaction that is
   * merely waiting behind another pending transaction of the same wallet is NOT a
   * nonce gap — only a nonce the pool cannot reach is.
   */
  readonly walletPendingNonce?: number | undefined;
  /** Hash of a different, mined transaction sharing this wallet+nonce. */
  readonly replacementHash: HexHash | null | undefined;
}

export const EMPTY_TX_WATCH_OBSERVATION: TxWatchObservation = Object.freeze({
  receipt: null,
  tx: undefined,
  walletNonce: undefined,
  walletPendingNonce: undefined,
  replacementHash: undefined,
});

export interface TxWatchState {
  readonly status: TxWatchStatus;
  readonly hash: HexHash | null;
  /** Local time (ms) the hash became known; persisted hashes restart the clock on load. */
  readonly startedAt: number;
  readonly deadlineMs: number;
  readonly observation: TxWatchObservation;
  /** When the observation above was read; the countdown renders against it. */
  readonly observedAt: number;
  /** First time this nonce gap was observed; null whenever the last read had none. */
  readonly gapSince: number | null;
}

export interface CreateTxWatchStateInput {
  readonly hash: HexHash;
  readonly deadlineMs?: number;
  readonly startedAt?: number;
}

export function idleTxWatchState(deadlineMs: number = DEFAULT_TX_DEADLINE_MS): TxWatchState {
  return {
    status: 'idle',
    hash: null,
    startedAt: 0,
    deadlineMs,
    observation: EMPTY_TX_WATCH_OBSERVATION,
    observedAt: 0,
    gapSince: null,
  };
}

/** A hash known but not yet observed starts at `pending` with a fresh clock. */
export function createTxWatchState(input: CreateTxWatchStateInput): TxWatchState {
  const startedAt = input.startedAt ?? Date.now();
  return {
    status: 'pending',
    hash: input.hash,
    startedAt,
    deadlineMs: input.deadlineMs ?? DEFAULT_TX_DEADLINE_MS,
    observation: EMPTY_TX_WATCH_OBSERVATION,
    observedAt: startedAt,
    gapSince: null,
  };
}

export type TxWatchEvent =
  | { readonly type: 'observe'; readonly observation: TxWatchObservation; readonly now: number }
  | { readonly type: 'reset' };

/** Polling is pointless once the hash can only ever change through user action. */
export function isTxWatchPollingStopped(status: TxWatchStatus): boolean {
  return (
    status === 'confirmed' ||
    status === 'reverted' ||
    status === 'replaced' ||
    status === 'nonceGap'
  );
}

export function isTxWatchSettled(status: TxWatchStatus): status is TxWatchSettledStatus {
  return status === 'confirmed' || status === 'reverted';
}

/**
 * States that leave a pending transaction in limbo. The page must render the
 * recovery card AND re-enable the primary action — never a dead end.
 */
export function isTxWatchRecovery(status: TxWatchStatus): status is TxWatchRecoveryStatus {
  return (
    status === 'slow' || status === 'dropped' || status === 'replaced' || status === 'nonceGap'
  );
}

/** Time left before the deadline; 0 once the transaction is no longer `pending`. */
export function txWatchRemainingMs(state: TxWatchState, now: number): number {
  if (state.hash === null || state.status !== 'pending') return 0;
  return Math.max(0, state.startedAt + state.deadlineMs - now);
}

/** Countdown in whole seconds, rounded up: never render 0 while still waiting. */
export function txWatchRemainingSeconds(state: TxWatchState, now: number): number {
  if (state.hash === null || state.status !== 'pending') return 0;
  return Math.ceil(txWatchRemainingMs(state, now) / 1000);
}

/** True when the submitted nonce cannot be reached by the wallet's pool. */
function isNonceGapped(observation: TxWatchObservation): boolean {
  if (observation.tx === null || observation.tx === undefined) return false;
  const poolAware = observation.walletPendingNonce ?? observation.walletNonce;
  if (poolAware === undefined) return false;
  return observation.tx.nonce > poolAware;
}

function classify(
  observation: TxWatchObservation,
  deadlineAt: number,
  now: number,
  gapSince: number | null,
): TxWatchStatus {
  // A receipt is the only terminal truth, and it wins over every heuristic.
  if (observation.receipt !== null) {
    return observation.receipt.status === 'reverted' ? 'reverted' : 'confirmed';
  }
  if (observation.replacementHash !== null && observation.replacementHash !== undefined) {
    return 'replaced';
  }
  // A transaction queued behind another pending transaction is not stuck; only a
  // gap the pool cannot reach is. It has to survive the grace window first, so a
  // single read race can never freeze the page on a recovery card.
  if (isNonceGapped(observation)) {
    const since = gapSince ?? now;
    if (now - since >= TX_WATCH_NONCE_GAP_GRACE_MS) return 'nonceGap';
    return 'pending';
  }
  if (now >= deadlineAt) {
    // Unknown (failed read) stays `slow`: we cannot prove the hash is gone.
    return observation.tx === null ? 'dropped' : 'slow';
  }
  return 'pending';
}

/** Folds a chain observation into the next state. Terminal states are frozen. */
export function reduceTxWatch(state: TxWatchState, event: TxWatchEvent): TxWatchState {
  if (event.type === 'reset') return idleTxWatchState(state.deadlineMs);
  if (state.hash === null) return state;
  if (isTxWatchPollingStopped(state.status)) return state;

  const gapped = isNonceGapped(event.observation);
  const nextStatus = classify(
    event.observation,
    state.startedAt + state.deadlineMs,
    event.now,
    state.gapSince,
  );
  return {
    ...state,
    status: nextStatus,
    observation: event.observation,
    observedAt: event.now,
    gapSince: gapped ? (state.gapSince ?? event.now) : null,
  };
}
