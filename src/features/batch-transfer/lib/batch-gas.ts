/**
 * Gas-budget rules for 批量转账 (pure, no React, no chain).
 *
 * The contract forwards `gasLimit` to every recipient call, so it is one budget
 * per recipient, not a total. A plain address needs 21000; an ERC20
 * `transferFrom` needs roughly 50000–70000 depending on the token. The defaults
 * below leave headroom, the advanced option can raise them, and the bounds stop
 * values that can only ever fail (0 / absurdly small / a batch larger than one
 * block). Errors are returned as keys; copy lives in `shared/config/copy-pages`.
 */

export const BATCH_GAS_MIN = 21_000;
export const BATCH_GAS_MAX = 1_000_000;
export const BATCH_GAS_DEFAULT_NATIVE = 30_000;
export const BATCH_GAS_DEFAULT_TOKEN = 60_000;

/** anvil / BSC block gas limit; `recipients × gasLimit` beyond this cannot mine. */
export const BATCH_BLOCK_GAS_LIMIT = 30_000_000;

/** Display-only reserve for the native batch (the fee is paid in the same asset). */
export const NATIVE_FEE_RESERVE_WEI = 10n ** 15n;

/** Conservative gas price used only to size the reserve; never shown in the UI. */
const GAS_PRICE_ASSUMPTION_WEI = 10n ** 9n;

export type BatchGasError = 'empty' | 'invalid' | 'belowMin' | 'aboveMax';

export type ParsedBatchGas =
  | { readonly kind: 'ok'; readonly value: number }
  | { readonly kind: 'error'; readonly reason: BatchGasError };

export function parseBatchGas(raw: string): ParsedBatchGas {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'error', reason: 'empty' };
  if (!/^\d+$/.test(trimmed)) return { kind: 'error', reason: 'invalid' };
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(value) || value <= 0) return { kind: 'error', reason: 'invalid' };
  if (value < BATCH_GAS_MIN) return { kind: 'error', reason: 'belowMin' };
  if (value > BATCH_GAS_MAX) return { kind: 'error', reason: 'aboveMax' };
  return { kind: 'ok', value };
}

export function isBatchGasOverBlock(recipientCount: number, gasLimit: number): boolean {
  return recipientCount * gasLimit > BATCH_BLOCK_GAS_LIMIT;
}

/**
 * Native balance kept back for the batch transaction itself:
 * `max(0.001 ETH, recipients × gasLimit × 1 gwei)`. The page never prints a fee;
 * this only decides whether 「合计」 still fits and how much is missing.
 */
export function nativeBatchReserve(recipientCount: number, gasLimit: number): bigint {
  const dynamic = BigInt(Math.max(0, recipientCount)) * BigInt(Math.max(0, gasLimit)) * GAS_PRICE_ASSUMPTION_WEI;
  return dynamic > NATIVE_FEE_RESERVE_WEI ? dynamic : NATIVE_FEE_RESERVE_WEI;
}

/** Balance that can actually be sent in a native batch. Never negative. */
export function nativeBatchAvailable(
  balance: bigint | undefined,
  recipientCount: number,
  gasLimit: number,
): bigint | undefined {
  if (balance === undefined) return undefined;
  const reserve = nativeBatchReserve(recipientCount, gasLimit);
  return balance > reserve ? balance - reserve : 0n;
}
