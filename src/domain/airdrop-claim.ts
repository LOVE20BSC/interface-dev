/**
 * The 铸造空投份额 state machine (UX spec §3.4).
 *
 * `claimableAmount` returns 0 for seven different on-chain reasons, so this
 * selector never treats the raw amount alone as "no eligibility". It separates:
 *   - not in the snapshot              → ineligible (S3)
 *   - already claimed                  → claimed (S6)
 *   - empty/insufficient pool          → unavailable: pool-empty (S4)
 *   - share is zero / exceeds remaining→ unavailable: share-* (S4)
 *   - genuinely floors to zero         → unavailable: zero-amount (S4)
 *   - read failed                      → error (S2)
 *
 * Pure TypeScript: no React, no chain SDKs, no copy (the UI owns wording).
 */

export type AirdropClaimStatus =
  | 'disconnected'
  | 'unconfigured'
  | 'loading'
  | 'error'
  | 'round-gated'
  | 'ineligible'
  | 'unavailable'
  | 'eligible'
  | 'claimed';

export type AirdropClaimErrorKind = 'snapshot' | 'read';

export type AirdropClaimUnavailableReason =
  'pool-empty' | 'share-zero' | 'share-exceeds-remaining' | 'zero-amount';

export type AirdropSnapshotLoadStatus = 'loading' | 'loaded' | 'error' | 'unavailable';
export type AirdropRootReadStatus = 'loading' | 'loaded' | 'error';
export type AirdropClaimReadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AirdropClaimSelectionInput {
  readonly connected: boolean;
  readonly configured: boolean;
  readonly snapshot: AirdropSnapshotLoadStatus;
  readonly root: AirdropRootReadStatus;
  readonly rootMatches: boolean;
  readonly hasEntry: boolean;
  readonly reads: AirdropClaimReadStatus;
  /** undefined/null mean unknown until the reads are ready, never 0. */
  readonly claimed: boolean | null;
  /** currentPhase >= claimableFromRound; null while unknown. */
  readonly roundReached: boolean | null;
  readonly share: bigint | null;
  readonly claimableAmount: bigint | null;
  readonly poolBalance: bigint | null;
  readonly remainingShare: bigint | null;
}

export interface AirdropClaimSelection {
  readonly status: AirdropClaimStatus;
  readonly errorKind?: AirdropClaimErrorKind;
  readonly reason?: AirdropClaimUnavailableReason;
}

export function selectAirdropClaimState(input: AirdropClaimSelectionInput): AirdropClaimSelection {
  if (!input.connected) return { status: 'disconnected' };
  if (!input.configured) return { status: 'unconfigured' };

  // A snapshot without a matching root is untrusted: show the neutral retry
  // state rather than a wrong eligibility answer.
  if (input.snapshot === 'unavailable') return { status: 'error', errorKind: 'snapshot' };

  if (input.snapshot === 'loading' || input.root === 'loading') return { status: 'loading' };
  if (input.snapshot === 'error' || input.root === 'error') {
    return { status: 'error', errorKind: 'read' };
  }
  if (!input.rootMatches) return { status: 'error', errorKind: 'snapshot' };
  if (!input.hasEntry) return { status: 'ineligible' };

  if (input.reads === 'idle' || input.reads === 'loading') return { status: 'loading' };
  if (input.reads === 'error') return { status: 'error', errorKind: 'read' };

  if (
    input.claimed === null ||
    input.claimableAmount === null ||
    input.poolBalance === null ||
    input.share === null
  ) {
    return { status: 'error', errorKind: 'read' };
  }

  if (input.claimed) return { status: 'claimed' };
  // The distributor's claim() reverts before the round; claimableAmount is 0
  // during that window, so the gate must be checked before "no amount".
  if (input.roundReached === false) return { status: 'round-gated' };
  if (input.roundReached === null) return { status: 'error', errorKind: 'read' };
  if (input.claimableAmount > 0n) return { status: 'eligible' };

  if (input.poolBalance === 0n) {
    return { status: 'unavailable', reason: 'pool-empty' };
  }
  if (input.share === 0n) {
    return { status: 'unavailable', reason: 'share-zero' };
  }
  if (input.remainingShare !== null && input.share > input.remainingShare) {
    return { status: 'unavailable', reason: 'share-exceeds-remaining' };
  }
  return { status: 'unavailable', reason: 'zero-amount' };
}
