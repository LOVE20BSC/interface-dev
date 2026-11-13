import type { HexAddress } from '@/config/networks';

/**
 * 批量转账 page vocabulary (pure data, no React, no chain).
 *
 * `BatchMode` is the asset family; the write itself is one BatchTransfer call
 * with `recipients` / `amounts` / `gasLimit`. A request always carries the exact
 * wei amounts that will be submitted, the total carried as `msg.value` (native),
 * and the pre-submit recipient balances used by the post-confirmation audit.
 */
export type BatchMode = 'native' | 'token';

export interface BatchRequestRow {
  readonly address: HexAddress;
  readonly amount: bigint;
}

export interface BatchRequest {
  readonly mode: BatchMode;
  readonly tokenAddress: HexAddress | undefined;
  readonly tokenSymbol: string;
  readonly tokenDecimals: number;
  readonly rows: readonly BatchRequestRow[];
  readonly total: bigint;
  readonly gasLimit: number;
  /** Balances read right before submitting; `undefined` when unreadable. */
  readonly preBalances: readonly (bigint | undefined)[];
  /** Bytecode presence per recipient (drives the failure explanation). */
  readonly recipientHasCode: readonly (boolean | undefined)[];
}
