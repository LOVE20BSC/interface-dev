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

/**
 * How long `route-loading` may last before it becomes a retryable `route-error`.
 *
 * The route read is a handful of multicalls; 15 s is far beyond a slow mobile RPC.
 * Before R8 this state had no UI branch at all: `selectSwapScreenState` returned
 * `route-loading`, `swap-token-panel` fell through to the final form with
 * `route === null`, the 到 amount showed `—` and the quote request never fired
 * (`quote.enabled` needs a ready route) — a 30 s dead screen for the user.
 */
export const ROUTE_LOADING_TIMEOUT_MS = 15_000;

export interface SwapScreenInput {
  readonly configured: boolean;
  readonly connected: boolean;
  readonly wrongChain: boolean;
  /** False while token lookups/metadata are still in flight. */
  readonly pairResolved: boolean;
  /** from/to unknown, equal, or otherwise unusable. */
  readonly pairInvalid: boolean;
  readonly routeStatus: SwapRouteStatus;
  /**
   * True once `route-loading` has outlived `ROUTE_LOADING_TIMEOUT_MS`. The screen
   * then becomes the retryable `route-error` card instead of an endless skeleton.
   */
  readonly routeLoadingTimedOut?: boolean;
}

/**
 * One mutually-exclusive page state. Invalid pair is checked before route
 * loading so a bad deep link never flashes a quote skeleton, and empty-pool is
 * distinct from no-route because the copy and next steps differ (spec §3.5).
 *
 * `resolving` (token metadata still in flight) is bounded by the same deadline
 * as `route-loading`: with the RPC unreachable, `isLoading` never settles and
 * the panel used to sit on a text-less skeleton forever (T006 P1-1). Past the
 * deadline it becomes the retryable `route-error` card, so a dead network is a
 * retry, not a dead end.
 */
export function selectSwapScreenState(input: SwapScreenInput): SwapScreenState {
  if (!input.configured) return 'unconfigured';
  if (!input.connected) return 'disconnected';
  if (input.wrongChain) return 'wrong-chain';
  if (input.pairInvalid) return 'invalid-pair';
  if (!input.pairResolved) {
    return input.routeLoadingTimedOut === true ? 'route-error' : 'resolving';
  }
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
      return input.routeLoadingTimedOut === true ? 'route-error' : 'route-loading';
    case 'idle':
    default:
      return input.routeLoadingTimedOut === true ? 'route-error' : 'resolving';
  }
}
