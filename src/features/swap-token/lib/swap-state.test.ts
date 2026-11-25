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
    expect(
      selectSwapScreenState({ ...base, routeStatus: 'ready', routeLoadingTimedOut: true }),
    ).toBe('ready');
  });

  it('waits on the pair metadata before route loading', () => {
    expect(selectSwapScreenState({ ...base, pairResolved: false, routeStatus: 'ready' })).toBe(
      'resolving',
    );
  });

  // T006 P1-1: with the RPC unreachable `pair.status` stays `loading` forever, so
  // `resolving` was an endless text-less skeleton with no retry. It now shares the
  // route-loading deadline and falls through to the retryable error card.
  it('bounds the resolving state with the same deadline (T006 P1-1)', () => {
    expect(
      selectSwapScreenState({ ...base, pairResolved: false, routeLoadingTimedOut: true }),
    ).toBe('route-error');
  });

  it('bounds the idle route state too, so no unbounded state is left', () => {
    expect(
      selectSwapScreenState({ ...base, routeStatus: 'idle', routeLoadingTimedOut: true }),
    ).toBe('route-error');
  });

  it('keeps resolving while the pair is still in flight and the deadline has not passed', () => {
    expect(
      selectSwapScreenState({ ...base, pairResolved: false, routeLoadingTimedOut: false }),
    ).toBe('resolving');
  });
});
