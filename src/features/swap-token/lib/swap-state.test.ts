import { describe, expect, it } from 'vitest';
import { selectSwapScreenState, type SwapScreenInput } from './swap-state';

const base: SwapScreenInput = {
  configured: true,
  connected: true,
  wrongChain: false,
  pairResolved: true,
  pairInvalid: false,
  routeStatus: 'ready',
};

describe('swap screen state selector', () => {
  it('prioritizes unconfigured over disconnected so no empty-book connect prompt appears', () => {
    expect(selectSwapScreenState({ ...base, configured: false, connected: false })).toBe(
      'unconfigured',
    );
  });

  it('shows the connection state before any pair or route work', () => {
    expect(selectSwapScreenState({ ...base, connected: false, pairResolved: false })).toBe(
      'disconnected',
    );
  });

  it('shows the wrong-chain state before resolving the pair', () => {
    expect(selectSwapScreenState({ ...base, wrongChain: true, pairResolved: false })).toBe(
      'wrong-chain',
    );
  });

  it('never flashes a quote for an invalid deep link', () => {
    expect(selectSwapScreenState({ ...base, pairInvalid: true, routeStatus: 'loading' })).toBe(
      'invalid-pair',
    );
  });

  it('keeps empty-pool and no-route distinct', () => {
    expect(selectSwapScreenState({ ...base, routeStatus: 'empty-pool' })).toBe('empty-pool');
    expect(selectSwapScreenState({ ...base, routeStatus: 'missing-pair' })).toBe('no-route');
  });

  it('maps a failed route read to the retry state', () => {
    expect(selectSwapScreenState({ ...base, routeStatus: 'error' })).toBe('route-error');
  });

  it('renders route-loading as its own screen instead of a dead final form (R8)', () => {
    expect(selectSwapScreenState({ ...base, routeStatus: 'loading' })).toBe('route-loading');
  });

  it('turns a route load that outlived the timeout into the retryable route-error (R8)', () => {
    expect(
      selectSwapScreenState({ ...base, routeStatus: 'loading', routeLoadingTimedOut: true }),
    ).toBe('route-error');
  });

  it('ignores a stale timeout flag once the route is ready', () => {
    expect(selectSwapScreenState({ ...base, routeStatus: 'ready', routeLoadingTimedOut: true })).toBe(
      'ready',
    );
  });

  it('waits on the pair metadata before route loading', () => {
    expect(selectSwapScreenState({ ...base, pairResolved: false, routeStatus: 'ready' })).toBe(
      'resolving',
    );
  });
});
