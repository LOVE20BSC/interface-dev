export type SwapRouteStatus =
  'idle' | 'loading' | 'ready' | 'missing-pair' | 'empty-pool' | 'error';

export type SwapScreenState =
  | 'unconfigured'
  | 'disconnected'
  | 'wrong-chain'
  | 'resolving'
  | 'invalid-pair'
  | 'route-loading'
  | 'no-route'
  | 'empty-pool'
  | 'route-error'
  | 'ready';

export interface SwapScreenInput {
  readonly configured: boolean;
  readonly connected: boolean;
  readonly wrongChain: boolean;
  /** False while token lookups/metadata are still in flight. */
  readonly pairResolved: boolean;
  /** from/to unknown, equal, or otherwise unusable. */
  readonly pairInvalid: boolean;
  readonly routeStatus: SwapRouteStatus;
}

/**
 * One mutually-exclusive page state. Invalid pair is checked before route
 * loading so a bad deep link never flashes a quote skeleton, and empty-pool is
 * distinct from no-route because the copy and next steps differ (spec §3.5).
 */
export function selectSwapScreenState(input: SwapScreenInput): SwapScreenState {
  if (!input.configured) return 'unconfigured';
  if (!input.connected) return 'disconnected';
  if (input.wrongChain) return 'wrong-chain';
  if (input.pairInvalid) return 'invalid-pair';
  if (!input.pairResolved) return 'resolving';
  switch (input.routeStatus) {
    case 'ready':
      return 'ready';
    case 'empty-pool':
      return 'empty-pool';
    case 'missing-pair':
      return 'no-route';
    case 'error':
      return 'route-error';
    case 'loading':
      return 'route-loading';
    case 'idle':
    default:
      return 'resolving';
  }
}
