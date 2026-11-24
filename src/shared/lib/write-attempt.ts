/** Pure write-attempt state machine: no React, no wagmi, no feature types. */
import { isSameTxOwner } from './tx-owner';

export type WriteHash = `0x${string}`;
export type WriteStep = 'main' | 'approve';
export type WriteStage = 'idle' | 'wallet' | 'pending';
export type PersistPolicy = 'afterHash' | 'none';
export type ApprovePolicy = 'none' | 'single' | 'keyed';

export interface WriteOwner {
  readonly chainId: number;
  readonly account: `0x${string}`;
}

export function isWriteAttemptOwner(attempt: WriteAttempt<unknown>, owner: WriteOwner): boolean {
  return isSameTxOwner(attempt.owner, owner);
}

export interface WriteAttempt<Intent> {
  readonly intent: Intent;
  readonly owner: WriteOwner;
  readonly step: WriteStep;
  /** Approve key (token address/kind); undefined for main. */
  readonly key?: string;
  readonly hash?: WriteHash;
  readonly nonce?: number;
}

export interface WriteAttemptError {
  readonly message: string;
  readonly kind?: 'nonce' | 'staleBlock';
}

interface Slot<Intent> {
  readonly phase: WriteStage;
  readonly attempt: WriteAttempt<Intent> | null;
}

export interface WriteAttemptState<Intent, Receipt> {
  readonly main: Slot<Intent>;
  readonly approval: Slot<Intent>;
  readonly receipt: Receipt | null;
  readonly error: WriteAttemptError | null;
  readonly isHydrating: boolean;
  readonly approveRevision: number;
  /** Last approved intent; projections derive isApproved/approvedAmount/address. */
  readonly lastApproval: { readonly key?: string; readonly intent: Intent } | null;
}

export type WriteAttemptEvent<Intent, Receipt> =
  | {
      readonly type: 'hydrateDone';
      readonly attempt: WriteAttempt<Intent> | null;
      readonly error?: WriteAttemptError;
    }
  | { readonly type: 'run'; readonly intent: Intent; readonly owner: WriteOwner }
  | {
      readonly type: 'approve';
      readonly intent: Intent;
      readonly owner: WriteOwner;
      readonly key: string;
    }
  | { readonly type: 'nonceRead'; readonly step: WriteStep; readonly nonce: number | undefined }
  | {
      readonly type: 'signed';
      readonly step: WriteStep;
      readonly hash: WriteHash;
      readonly nonce?: number;
      readonly key?: string;
    }
  | { readonly type: 'sendFailed'; readonly step: WriteStep; readonly error: WriteAttemptError }
  | { readonly type: 'recallFailed'; readonly step: WriteStep; readonly error: WriteAttemptError }
  | { readonly type: 'mainReceipt'; readonly receipt: Receipt }
  | { readonly type: 'mainRevert'; readonly error: WriteAttemptError }
  | { readonly type: 'approveReceipt' }
  | { readonly type: 'approveRevert'; readonly error: WriteAttemptError }
  | { readonly type: 'clearReceipt' }
  | { readonly type: 'clearError' };

export type WriteAttemptEffect<Intent> =
  | { readonly type: 'readNonce'; readonly step: WriteStep }
  | {
      readonly type: 'sign';
      readonly step: WriteStep;
      readonly intent: Intent;
      readonly nonce?: number;
      readonly key?: string;
    }
  | { readonly type: 'persist'; readonly attempt: WriteAttempt<Intent> }
  | { readonly type: 'clear'; readonly step: WriteStep }
  | { readonly type: 'notifySettled' }
  | { readonly type: 'notifyApproved' };

const IDLE = <Intent>(): Slot<Intent> => ({ phase: 'idle', attempt: null });

export function initialWriteAttemptState<Intent, Receipt>(
  hydrating: boolean,
): WriteAttemptState<Intent, Receipt> {
  return {
    main: IDLE(),
    approval: IDLE(),
    receipt: null,
    error: null,
    isHydrating: hydrating,
    approveRevision: 0,
    lastApproval: null,
  };
}

/** Pure transition; only emits data effects. All policies are explicit. */
export function reduceWriteAttempt<Intent, Receipt>(
  state: WriteAttemptState<Intent, Receipt>,
  event: WriteAttemptEvent<Intent, Receipt>,
  policies: { readonly persist: PersistPolicy; readonly approve: ApprovePolicy },
): {
  readonly state: WriteAttemptState<Intent, Receipt>;
  readonly effects: readonly WriteAttemptEffect<Intent>[];
} {
  const effects: WriteAttemptEffect<Intent>[] = [];

  switch (event.type) {
    case 'hydrateDone': {
      const attempt = event.attempt;
      const main: Slot<Intent> =
        attempt !== null && attempt.step === 'main' ? { phase: 'pending', attempt } : IDLE();
      const approval: Slot<Intent> =
        attempt !== null && attempt.step === 'approve' ? { phase: 'pending', attempt } : IDLE();
      return {
        state: {
          ...state,
          main,
          approval,
          error: event.error ?? null,
          isHydrating: false,
          // A wallet/chain change must drop the previous owner's receipt: `run` is
          // gated on `receipt === null`, so keeping it would leave the CTA dead.
          ...(policies.persist === 'afterHash' ? { receipt: null } : {}),
        },
        effects,
      };
    }
    case 'run': {
      if (state.isHydrating || state.receipt !== null) return { state, effects };
      if (state.main.phase !== 'idle') return { state, effects };
      const attempt: WriteAttempt<Intent> = {
        intent: event.intent,
        owner: event.owner,
        step: 'main',
      };
      return {
        state: {
          ...state,
          main: { phase: 'wallet', attempt },
          error: null,
        },
        effects: [{ type: 'readNonce', step: 'main' }],
      };
    }
    case 'approve': {
      if (policies.approve === 'none') return { state, effects };
      if (state.isHydrating || state.main.phase !== 'idle') return { state, effects };
      if (state.approval.phase !== 'idle') return { state, effects };
      const attempt: WriteAttempt<Intent> = {
        intent: event.intent,
        owner: event.owner,
        step: 'approve',
        key: event.key,
      };
      return {
        state: {
          ...state,
          approval: { phase: 'wallet', attempt },
          error: null,
        },
        effects: [{ type: 'readNonce', step: 'approve' }],
      };
    }
    case 'nonceRead': {
      const slot = event.step === 'main' ? state.main : state.approval;
      if (slot.attempt === null || slot.phase !== 'wallet') return { state, effects };
      return {
        state,
        effects: [
          {
            type: 'sign',
            step: event.step,
            intent: slot.attempt.intent,
            ...(event.nonce !== undefined ? { nonce: event.nonce } : {}),
            ...(slot.attempt.key !== undefined ? { key: slot.attempt.key } : {}),
          },
        ],
      };
    }
    case 'signed': {
      const slot = event.step === 'main' ? state.main : state.approval;
      if (slot.attempt === null) return { state, effects };
      const attempt: WriteAttempt<Intent> = {
        ...slot.attempt,
        hash: event.hash,
        ...(event.nonce !== undefined ? { nonce: event.nonce } : {}),
      };
      if (event.step === 'main') {
        if (policies.persist === 'afterHash') effects.push({ type: 'persist', attempt });
        return {
          state: { ...state, main: { phase: 'pending', attempt }, error: null },
          effects,
        };
      }
      return { state: { ...state, approval: { phase: 'pending', attempt }, error: null }, effects };
    }
    case 'sendFailed': {
      const slot = event.step === 'main' ? state.main : state.approval;
      if (slot.attempt === null) return { state, effects };
      return {
        state: {
          ...state,
          ...(event.step === 'main' ? { main: IDLE<Intent>() } : { approval: IDLE<Intent>() }),
          error: event.error,
        },
        effects: [],
      };
    }
    case 'recallFailed': {
      return { state: { ...state, error: event.error }, effects };
    }
    case 'mainReceipt': {
      if (state.main.attempt === null) return { state, effects };
      return {
        state: {
          ...state,
          main: IDLE(),
          receipt: event.receipt,
          error: null,
        },
        effects: [
          ...(policies.persist === 'afterHash' ? [{ type: 'clear', step: 'main' } as const] : []),
          { type: 'notifySettled' },
        ],
      };
    }
    case 'mainRevert': {
      return {
        state: {
          ...state,
          main: IDLE(),
          receipt: null,
          error: event.error,
        },
        effects: [
          ...(policies.persist === 'afterHash' ? [{ type: 'clear', step: 'main' } as const] : []),
          { type: 'notifySettled' },
        ],
      };
    }
    case 'approveReceipt': {
      const approved = state.approval.attempt;
      return {
        state: {
          ...state,
          approval: IDLE(),
          approveRevision: state.approveRevision + 1,
          lastApproval:
            approved !== null
              ? {
                  ...(approved.key !== undefined ? { key: approved.key } : {}),
                  intent: approved.intent,
                }
              : state.lastApproval,
          error: null,
        },
        effects: [{ type: 'notifyApproved' }],
      };
    }
    case 'approveRevert': {
      return {
        state: { ...state, approval: IDLE(), lastApproval: null, error: event.error },
        effects: [{ type: 'notifyApproved' }],
      };
    }
    case 'clearReceipt': {
      return {
        state: { ...state, main: IDLE(), receipt: null, error: null },
        effects: policies.persist === 'afterHash' ? [{ type: 'clear', step: 'main' }] : [],
      };
    }
    case 'clearError':
      return { state: { ...state, error: null }, effects };
    default:
      return { state, effects };
  }
}
