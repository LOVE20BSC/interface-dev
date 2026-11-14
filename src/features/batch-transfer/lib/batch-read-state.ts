import type { BatchMode } from '@/features/batch-transfer/lib/batch-types';

/**
 * Read-degradation state machine for 批量转账 (pure, no React, no chain).
 *
 * The QA review (D2 / D8 / D9) found that "not loaded" was being collapsed into
 * an affirmative answer: an unread allowance rendered 「额度已足够」 next to
 * 「额度暂时读不到」, and an unread sender balance silently skipped the
 * insufficient-funds check. These helpers write the three-way distinction down
 * so the panel can only render a state it actually knows.
 */

export type AllowanceReadState = 'loading' | 'unknown' | 'need' | 'ready';

/**
 * D2: token-mode allowance. `unknown` is its own state — 「已足够」 and
 * 「需要授权」 are only allowed when the allowance value was actually read.
 */
export function allowanceReadState(input: {
  readonly mode: BatchMode;
  readonly total: bigint;
  readonly allowance: bigint | undefined;
  readonly isLoading: boolean;
}): AllowanceReadState {
  if (input.mode !== 'token') return 'ready';
  if (input.isLoading) return 'loading';
  if (input.allowance === undefined) return 'unknown';
  if (input.total > 0n && input.allowance < input.total) return 'need';
  return 'ready';
}

/**
 * D8: with the sender balance unread while the batch is non-empty, the page
 * cannot claim the batch is affordable, so submission is blocked until the read
 * succeeds (loading itself is not a failure — the button stays available while
 * the first read is in flight, the transaction simulation still guards it).
 */
export function balanceReadBlocksSubmit(
  total: bigint,
  balance: bigint | undefined,
  isLoading: boolean,
): boolean {
  return total > 0n && balance === undefined && !isLoading;
}

export type BalanceLineState = 'loading' | 'error' | 'unknownToken' | 'value';

/**
 * D9: in 「代币」 mode the balance line must never fall back to the native
 * symbol (`ETH 余额 —`) just because the token catalog has not resolved yet.
 * `unknownToken` is rendered as 「代币余额暂时读不到…」 instead.
 */
export function balanceLineState(input: {
  readonly mode: BatchMode;
  readonly tokenResolved: boolean;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly balance: bigint | undefined;
}): BalanceLineState {
  if (input.mode === 'token' && !input.tokenResolved) return 'unknownToken';
  if (input.isLoading) return 'loading';
  if (input.balance === undefined) return input.isError ? 'error' : 'loading';
  return 'value';
}
