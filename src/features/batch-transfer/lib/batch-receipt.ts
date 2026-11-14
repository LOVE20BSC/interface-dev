import { buildBatchAudit, type BatchAuditRow } from '@/features/batch-transfer/lib/batch-audit';
import type { BatchRequest } from '@/features/batch-transfer/lib/batch-types';

/**
 * Everything the 批量转账 receipt renders. Built from the submitted request plus
 * a *post-mined read* of the recipient balances — the numbers are chain facts,
 * not estimates. `total` is the exact wei the batch carried (native `msg.value`).
 */
export interface BatchReceiptRecord {
  readonly hash: `0x${string}`;
  readonly mode: BatchRequest['mode'];
  readonly symbol: string;
  readonly decimals: number;
  readonly total: bigint;
  readonly gasLimit: number;
  readonly rows: readonly BatchAuditRow[];
  /**
   * ERC20 mode only: allowance still left on the token after the batch mined
   * (D7 — approving the original total, then submitting a smaller list, leaves
   * a residual allowance). `undefined` when the read failed or in native mode.
   */
  readonly residualAllowance: bigint | undefined;
  readonly recordedAt: number;
}

export function buildBatchReceipt(
  hash: `0x${string}`,
  request: BatchRequest,
  postBalances: readonly (bigint | undefined)[],
  residualAllowance?: bigint | undefined,
): BatchReceiptRecord {
  return {
    hash,
    mode: request.mode,
    symbol: request.tokenSymbol,
    decimals: request.tokenDecimals,
    total: request.total,
    gasLimit: request.gasLimit,
    rows: buildBatchAudit(request.rows, request.preBalances, postBalances),
    residualAllowance,
    recordedAt: Date.now(),
  };
}
