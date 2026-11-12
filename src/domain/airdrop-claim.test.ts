import { describe, expect, it } from 'vitest';
import { selectAirdropClaimState, type AirdropClaimSelectionInput } from './airdrop-claim';

const BASE: AirdropClaimSelectionInput = {
  connected: true,
  configured: true,
  snapshot: 'loaded',
  root: 'loaded',
  rootMatches: true,
  hasEntry: true,
  reads: 'ready',
  claimed: false,
  roundReached: true,
  share: 100n,
  claimableAmount: 1_000n,
  poolBalance: 10_000n,
  remainingShare: 1_000n,
};

function select(overrides: Partial<AirdropClaimSelectionInput>) {
  return selectAirdropClaimState({ ...BASE, ...overrides });
}

describe('selectAirdropClaimState', () => {
  it('starts with connection and configuration', () => {
    expect(select({ connected: false })).toEqual({ status: 'disconnected' });
    expect(select({ configured: false })).toEqual({ status: 'unconfigured' });
  });

  it('never trusts an unverified or unavailable snapshot', () => {
    expect(select({ snapshot: 'unavailable' })).toEqual({
      status: 'error',
      errorKind: 'snapshot',
    });
    expect(select({ rootMatches: false })).toEqual({
      status: 'error',
      errorKind: 'snapshot',
    });
  });

  it('shows loading until both the snapshot and the claim reads are ready', () => {
    expect(select({ snapshot: 'loading' })).toEqual({ status: 'loading' });
    expect(select({ root: 'loading' })).toEqual({ status: 'loading' });
    expect(select({ reads: 'loading' })).toEqual({ status: 'loading' });
    expect(select({ reads: 'idle' })).toEqual({ status: 'loading' });
  });

  it('separates a failed read from a missing snapshot entry', () => {
    expect(select({ root: 'error' })).toEqual({ status: 'error', errorKind: 'read' });
    expect(select({ snapshot: 'error' })).toEqual({ status: 'error', errorKind: 'read' });
    expect(select({ reads: 'error' })).toEqual({ status: 'error', errorKind: 'read' });
    expect(select({ hasEntry: false })).toEqual({ status: 'ineligible' });
  });

  it('shows the eligible state only for a positive dynamic amount', () => {
    expect(select({})).toEqual({ status: 'eligible' });
    expect(select({ claimableAmount: 0n, poolBalance: 1_000n, share: 1n })).toEqual({
      status: 'unavailable',
      reason: 'zero-amount',
    });
  });

  it('reports already claimed even though claimableAmount is 0', () => {
    expect(select({ claimed: true, claimableAmount: 0n })).toEqual({ status: 'claimed' });
  });

  it('shows the round gate before the zero-amount reasons', () => {
    expect(select({ roundReached: false, claimableAmount: 0n, poolBalance: 0n })).toEqual({
      status: 'round-gated',
    });
    expect(select({ roundReached: null })).toEqual({ status: 'error', errorKind: 'read' });
    // Already claimed wins even if the gate read is stale/unavailable.
    expect(select({ claimed: true, roundReached: false })).toEqual({ status: 'claimed' });
  });

  it('distinguishes an empty pool from a zero share and a floor-to-zero amount', () => {
    expect(select({ claimableAmount: 0n, poolBalance: 0n })).toEqual({
      status: 'unavailable',
      reason: 'pool-empty',
    });
    expect(select({ claimableAmount: 0n, poolBalance: 1_000n, share: 0n })).toEqual({
      status: 'unavailable',
      reason: 'share-zero',
    });
    expect(
      select({
        claimableAmount: 0n,
        poolBalance: 1_000n,
        share: 100n,
        remainingShare: 99n,
      }),
    ).toEqual({ status: 'unavailable', reason: 'share-exceeds-remaining' });
    expect(
      select({
        claimableAmount: 0n,
        poolBalance: 1n,
        share: 100n,
        remainingShare: 1_000n,
      }),
    ).toEqual({ status: 'unavailable', reason: 'zero-amount' });
  });

  it('treats a missing required read as an error, not as zero', () => {
    expect(select({ claimableAmount: null })).toEqual({
      status: 'error',
      errorKind: 'read',
    });
    expect(select({ poolBalance: null })).toEqual({
      status: 'error',
      errorKind: 'read',
    });
  });
});
