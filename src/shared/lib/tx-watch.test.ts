import { describe, expect, it } from 'vitest';
import {
  createTxWatchState,
  DEFAULT_TX_DEADLINE_MS,
  EMPTY_TX_WATCH_OBSERVATION,
  idleTxWatchState,
  isTxWatchPollingStopped,
  isTxWatchRecovery,
  isTxWatchSettled,
  reduceTxWatch,
  resolveTxDeadlineMs,
  TX_WATCH_NONCE_GAP_GRACE_MS,
  txWatchRemainingMs,
  txWatchRemainingSeconds,
  type TxWatchObservation,
} from './tx-watch';

const HASH = `0x${'ab'.repeat(32)}` as const;
const OTHER_HASH = `0x${'cd'.repeat(32)}` as const;
const WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const STARTED_AT = 1_000_000;
const DEADLINE_MS = 90_000;
const DEADLINE_AT = STARTED_AT + DEADLINE_MS;

function observation(overrides: Partial<TxWatchObservation> = {}): TxWatchObservation {
  return { ...EMPTY_TX_WATCH_OBSERVATION, ...overrides };
}

function pendingState(): ReturnType<typeof createTxWatchState> {
  return createTxWatchState({ hash: HASH, startedAt: STARTED_AT, deadlineMs: DEADLINE_MS });
}

function observe(
  state: ReturnType<typeof createTxWatchState>,
  obs: TxWatchObservation,
  now: number,
) {
  return reduceTxWatch(state, { type: 'observe', observation: obs, now });
}

describe('resolveTxDeadlineMs', () => {
  it('defaults to 90 s for missing or malformed overrides', () => {
    expect(resolveTxDeadlineMs(undefined)).toBe(DEFAULT_TX_DEADLINE_MS);
    expect(resolveTxDeadlineMs('')).toBe(DEFAULT_TX_DEADLINE_MS);
    expect(resolveTxDeadlineMs('not-a-number')).toBe(DEFAULT_TX_DEADLINE_MS);
    expect(resolveTxDeadlineMs('-5')).toBe(DEFAULT_TX_DEADLINE_MS);
    expect(DEFAULT_TX_DEADLINE_MS).toBe(90_000);
  });

  it('accepts a numeric override and clamps an unusably small one', () => {
    expect(resolveTxDeadlineMs('5000')).toBe(5_000);
    expect(resolveTxDeadlineMs(4000)).toBe(4_000);
    expect(resolveTxDeadlineMs('1')).toBe(1_000);
  });
});

describe('tx-watch state machine', () => {
  it('starts pending with the deadline clock and reports the remaining time', () => {
    const state = pendingState();
    expect(state.status).toBe('pending');
    expect(txWatchRemainingMs(state, STARTED_AT + 30_000)).toBe(60_000);
    expect(txWatchRemainingSeconds(state, STARTED_AT + 89_001)).toBe(1);
    expect(txWatchRemainingSeconds(state, DEADLINE_AT)).toBe(0);
  });

  it('keeps pending inside the deadline, then turns slow when the tx is still in the pool', () => {
    const inside = observe(
      pendingState(),
      observation({ tx: { nonce: 3, from: WALLET }, walletNonce: 3 }),
      STARTED_AT + 10_000,
    );
    expect(inside.status).toBe('pending');

    const past = observe(
      inside,
      observation({ tx: { nonce: 3, from: WALLET }, walletNonce: 3 }),
      DEADLINE_AT + 1,
    );
    expect(past.status).toBe('slow');
    expect(isTxWatchRecovery(past.status)).toBe(true);
    expect(isTxWatchPollingStopped(past.status)).toBe(false);
  });

  it('turns dropped after the deadline only when the node says the hash is unknown', () => {
    const dropped = observe(pendingState(), observation({ tx: null }), DEADLINE_AT + 1);
    expect(dropped.status).toBe('dropped');

    // A failed read is not proof the transaction is gone: stay conservative.
    const unknown = observe(pendingState(), observation({ tx: undefined }), DEADLINE_AT + 1);
    expect(unknown.status).toBe('slow');
  });

  it('flags a nonce gap only once it survives the grace window (one stale read is noise)', () => {
    const first = observe(
      pendingState(),
      observation({ tx: { nonce: 68, from: WALLET }, walletNonce: 3 }),
      STARTED_AT + 1,
    );
    expect(first.status).toBe('pending');
    expect(first.gapSince).toBe(STARTED_AT + 1);

    // Still inside the grace window: keep waiting, never freeze the page.
    const inside = observe(
      first,
      observation({ tx: { nonce: 68, from: WALLET }, walletNonce: 3 }),
      STARTED_AT + TX_WATCH_NONCE_GAP_GRACE_MS - 1,
    );
    expect(inside.status).toBe('pending');

    const stuck = observe(
      inside,
      observation({ tx: { nonce: 68, from: WALLET }, walletNonce: 3 }),
      STARTED_AT + TX_WATCH_NONCE_GAP_GRACE_MS + 1,
    );
    expect(stuck.status).toBe('nonceGap');
    expect(isTxWatchRecovery(stuck.status)).toBe(true);
    expect(isTxWatchPollingStopped(stuck.status)).toBe(true);
  });

  it('clears the gap clock as soon as a read no longer shows a gap', () => {
    const gapped = observe(
      pendingState(),
      observation({ tx: { nonce: 68, from: WALLET }, walletNonce: 3 }),
      STARTED_AT + 1,
    );
    const healed = observe(
      gapped,
      observation({ tx: { nonce: 3, from: WALLET }, walletNonce: 3 }),
      STARTED_AT + 2_000,
    );
    expect(healed.status).toBe('pending');
    expect(healed.gapSince).toBeNull();
  });

  it('never calls a transaction queued behind another pending transaction a nonce gap', () => {
    // latest=4 mined, the pool already holds nonce 4 and this one at 5 (pending=6):
    // the wallet will mine it as soon as the cheaper transaction lands.
    const queued = observation({
      tx: { nonce: 5, from: WALLET },
      walletNonce: 4,
      walletPendingNonce: 6,
    });
    const first = observe(pendingState(), queued, STARTED_AT + 1);
    expect(first.status).toBe('pending');
    const longAfter = observe(first, queued, DEADLINE_AT + 1);
    expect(longAfter.status).toBe('slow');
    expect(longAfter.status).not.toBe('nonceGap');
  });

  it('treats a receipt as terminal truth: confirmed and reverted', () => {
    const confirmed = observe(
      pendingState(),
      observation({ receipt: { status: 'success' } }),
      STARTED_AT + 1,
    );
    expect(confirmed.status).toBe('confirmed');
    expect(isTxWatchSettled(confirmed.status)).toBe(true);
    expect(isTxWatchPollingStopped(confirmed.status)).toBe(true);

    const reverted = observe(
      pendingState(),
      observation({ receipt: { status: 'reverted' } }),
      STARTED_AT + 1,
    );
    expect(reverted.status).toBe('reverted');
    expect(isTxWatchSettled(reverted.status)).toBe(true);
  });

  it('detects a different mined transaction with the same wallet+nonce as replaced', () => {
    const state = observe(
      pendingState(),
      observation({ tx: null, replacementHash: OTHER_HASH }),
      STARTED_AT + 1,
    );
    expect(state.status).toBe('replaced');
    expect(isTxWatchPollingStopped(state.status)).toBe(true);
  });

  it('lets a stuck state recover when the receipt finally appears', () => {
    const slow = observe(
      pendingState(),
      observation({ tx: { nonce: 3, from: WALLET }, walletNonce: 3 }),
      DEADLINE_AT + 1,
    );
    expect(slow.status).toBe('slow');
    const confirmed = observe(
      slow,
      observation({ receipt: { status: 'success' } }),
      DEADLINE_AT + 500,
    );
    expect(confirmed.status).toBe('confirmed');
  });

  it('freezes terminal states and ignores observations after them', () => {
    const confirmed = observe(
      pendingState(),
      observation({ receipt: { status: 'success' } }),
      STARTED_AT + 1,
    );
    const after = observe(confirmed, observation({ tx: null }), DEADLINE_AT + 1);
    expect(after.status).toBe('confirmed');
    expect(after.observation).toBe(confirmed.observation);
  });

  it('resets to idle', () => {
    const reset = reduceTxWatch(pendingState(), { type: 'reset' });
    expect(reset.status).toBe('idle');
    expect(reset.hash).toBeNull();
  });

  it('never claims a deadline for an idle machine', () => {
    const idle = idleTxWatchState(DEADLINE_MS);
    expect(idle.status).toBe('idle');
    expect(txWatchRemainingMs(idle, STARTED_AT)).toBe(0);
  });
});
