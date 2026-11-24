import { describe, expect, it } from 'vitest';
import {
  initialWriteAttemptState,
  isWriteAttemptOwner,
  reduceWriteAttempt,
  type WriteAttempt,
  type WriteAttemptEvent,
} from './write-attempt';

type Receipt = { readonly value: string };
const owner = { chainId: 31337, account: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' as const };
const OTHER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as const;
const hash = `0x${'ab'.repeat(32)}` as const;

function reduce(
  state: ReturnType<typeof initialWriteAttemptState<string, Receipt>>,
  event: WriteAttemptEvent<string, Receipt>,
  persist: 'afterHash' | 'none' = 'afterHash',
) {
  return reduceWriteAttempt(state, event, { persist, approve: 'single' });
}

describe('write-attempt reducer', () => {
  it('checks owner on a restored attempt (R3)', () => {
    const attempt = { intent: 'stake', owner, step: 'main' as const };
    expect(isWriteAttemptOwner(attempt, owner)).toBe(true);
    expect(isWriteAttemptOwner(attempt, { chainId: 31337, account: OTHER })).toBe(false);
  });
  it('run → nonce → sign → persist only after a hash', () => {
    let state = initialWriteAttemptState<string, Receipt>(false);
    let out = reduce(state, { type: 'run', intent: 'stake', owner });
    expect(out.state.main.phase).toBe('wallet');
    expect(out.effects).toEqual([{ type: 'readNonce', step: 'main' }]);
    state = out.state;

    out = reduce(state, { type: 'nonceRead', step: 'main', nonce: 7 });
    expect(out.effects).toEqual([{ type: 'sign', step: 'main', intent: 'stake', nonce: 7 }]);
    state = out.state;

    out = reduce(state, { type: 'signed', step: 'main', hash, nonce: 7 });
    expect(out.state.main.phase).toBe('pending');
    expect(out.effects).toEqual([
      { type: 'persist', attempt: { intent: 'stake', owner, step: 'main', hash, nonce: 7 } },
    ]);
  });

  it('does not persist when policy is none', () => {
    let state = initialWriteAttemptState<string, Receipt>(false);
    state = reduce(state, { type: 'run', intent: 'vote', owner }).state;
    state = reduce(state, { type: 'nonceRead', step: 'main', nonce: 1 }).state;
    const out = reduce(state, { type: 'signed', step: 'main', hash, nonce: 1 }, 'none');
    expect(out.effects).toEqual([]);
    expect(out.state.main.phase).toBe('pending');
  });

  it('settles to receipt and clears the record; revert goes to error', () => {
    let state = initialWriteAttemptState<string, Receipt>(false);
    state = reduce(state, { type: 'run', intent: 'transfer', owner }).state;
    state = reduce(state, { type: 'nonceRead', step: 'main', nonce: 1 }).state;
    state = reduce(state, { type: 'signed', step: 'main', hash, nonce: 1 }).state;

    const ok = reduce(state, { type: 'mainReceipt', receipt: { value: 'ok' } });
    expect(ok.state.receipt).toEqual({ value: 'ok' });
    expect(ok.state.main.phase).toBe('idle');
    expect(ok.effects).toEqual([{ type: 'clear', step: 'main' }, { type: 'notifySettled' }]);

    const bad = reduce(state, { type: 'mainRevert', error: { message: 'revert' } });
    expect(bad.state.receipt).toBeNull();
    expect(bad.state.error?.message).toBe('revert');
    expect(bad.state.main.phase).toBe('idle');
  });

  it('hydrate restores only a pending attempt; owner mismatch is an error', () => {
    const attempt: WriteAttempt<string> = {
      intent: 'stake',
      owner,
      step: 'main',
      hash,
      nonce: 3,
    };
    const restored = reduce(initialWriteAttemptState<string, Receipt>(true), {
      type: 'hydrateDone',
      attempt,
    });
    expect(restored.state.main).toEqual({ phase: 'pending', attempt });
    expect(restored.state.isHydrating).toBe(false);

    const mismatch = reduce(initialWriteAttemptState<string, Receipt>(true), {
      type: 'hydrateDone',
      attempt: null,
      error: { message: 'owner changed' },
    });
    expect(mismatch.state.error?.message).toBe('owner changed');
  });

  it('a wallet/chain change drops the receipt so the CTA is usable again', () => {
    // T005 G3 regression: `run` is gated on `receipt === null`; a receipt left over
    // from the previous wallet would silently swallow every new submission.
    let state = initialWriteAttemptState<string, Receipt>(false);
    state = reduce(state, { type: 'run', intent: 'transfer', owner }).state;
    state = reduce(state, { type: 'nonceRead', step: 'main', nonce: 1 }).state;
    state = reduce(state, { type: 'signed', step: 'main', hash, nonce: 1 }).state;
    state = reduce(state, { type: 'mainReceipt', receipt: { value: 'ok' } }).state;
    expect(state.receipt).toEqual({ value: 'ok' });

    const switched = reduce(state, { type: 'hydrateDone', attempt: null });
    expect(switched.state.receipt).toBeNull();
    const nextRun = reduce(switched.state, { type: 'run', intent: 'transfer', owner });
    expect(nextRun.state.main.phase).toBe('wallet');
    expect(nextRun.effects).toEqual([{ type: 'readNonce', step: 'main' }]);

    // Governance-style flows never gate on a receipt, so hydration keeps it.
    const governance = reduce({ ...state }, { type: 'hydrateDone', attempt: null }, 'none');
    expect(governance.state.receipt).toEqual({ value: 'ok' });
  });

  it('approve increments revision after a receipt, and clearReceipt releases main', () => {
    let state = initialWriteAttemptState<string, Receipt>(false);
    state = reduce(state, { type: 'approve', intent: 'approve', owner, key: 'token' }).state;
    expect(state.approval.phase).toBe('wallet');
    state = reduce(state, { type: 'nonceRead', step: 'approve', nonce: 2 }).state;
    state = reduce(state, { type: 'signed', step: 'approve', hash, nonce: 2 }).state;

    const approved = reduce(state, { type: 'approveReceipt' });
    expect(approved.state.approveRevision).toBe(1);
    expect(approved.state.approval.phase).toBe('idle');

    const cleared = reduce(approved.state, { type: 'clearReceipt' });
    expect(cleared.state.main.phase).toBe('idle');
    expect(cleared.state.receipt).toBeNull();
  });

  it('refuses a second main run while one is pending', () => {
    let state = initialWriteAttemptState<string, Receipt>(false);
    state = reduce(state, { type: 'run', intent: 'a', owner }).state;
    const second = reduce(state, { type: 'run', intent: 'b', owner });
    expect(second.state).toBe(state);
    expect(second.effects).toEqual([]);
  });
});
