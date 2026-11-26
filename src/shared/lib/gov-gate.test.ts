import { describe, expect, it } from 'vitest';
import { govGateState, type GovGateInput } from '@/shared/lib/gov-gate';

const BASE: GovGateInput = {
  unconfigured: false,
  connected: true,
  identityStatus: 'ready',
  communityKnown: true,
};

function state(patch: Partial<GovGateInput>) {
  return govGateState({ ...BASE, ...patch });
}

describe('govGateState', () => {
  it('reports unconfigured before everything else', () => {
    expect(state({ unconfigured: true, connected: false, identityStatus: 'loading' })).toBe(
      'unconfigured',
    );
  });

  it('asks to connect when the wallet is missing or disconnected', () => {
    expect(state({ connected: false })).toBe('connect');
    expect(state({ identityStatus: 'disconnected' })).toBe('connect');
  });

  it('maps every identity state to its own gate', () => {
    expect(state({ identityStatus: 'loading' })).toBe('identity-loading');
    expect(state({ identityStatus: 'unconfigured' })).toBe('identity-unconfigured');
    expect(state({ identityStatus: 'error' })).toBe('identity-error');
    expect(state({ identityStatus: 'empty' })).toBe('no-identity');
    expect(state({ identityStatus: 'needs-selection' })).toBe('needs-selection');
  });

  it('reports a community it cannot read only after identity is settled', () => {
    expect(state({ communityKnown: false })).toBe('community-unknown');
    // 身份没就绪时先报身份态，不能把「社区读不到」挡在前面。
    expect(state({ communityKnown: false, identityStatus: 'loading' })).toBe('identity-loading');
  });

  it('is ready only when everything is in place', () => {
    expect(state({})).toBe('ready');
  });

  it('keeps the ladder order stable (regression: two copies had drifted)', () => {
    const ladder = [
      state({ unconfigured: true }),
      state({ connected: false }),
      state({ identityStatus: 'loading' }),
      state({ identityStatus: 'unconfigured' }),
      state({ identityStatus: 'error' }),
      state({ identityStatus: 'empty' }),
      state({ identityStatus: 'needs-selection' }),
      state({ communityKnown: false }),
      state({}),
    ];
    expect(ladder).toEqual([
      'unconfigured',
      'connect',
      'identity-loading',
      'identity-unconfigured',
      'identity-error',
      'no-identity',
      'needs-selection',
      'community-unknown',
      'ready',
    ]);
  });
});
