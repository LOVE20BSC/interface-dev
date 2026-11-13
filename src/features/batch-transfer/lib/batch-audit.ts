import type { HexAddress } from '@/config/networks';

/**
 * Post-confirmation audit for 批量转账 (pure, no React, no chain).
 *
 * The page reads the recipients' balances before submitting and again after the
 * batch transaction is mined. Every row is judged from the *integer wei*
 * difference — never from the rounded display text — so a 1 wei arrival cannot
 * look like 「未变化」.
 *
 * - `matched`   — delta equals the amount this row was promised;
 * - `unchanged` — delta is exactly 0 (should not happen for an atomic success);
 * - `anomaly`   — any other delta (negative / partial / larger), highlighted;
 * - `unknown`   — a balance read failed, so the page shows 「—」 honestly.
 */
export type BatchAuditStatus = 'matched' | 'unchanged' | 'anomaly' | 'unknown';

export interface BatchAuditRow {
  readonly address: HexAddress;
  readonly amount: bigint;
  readonly before: bigint | undefined;
  readonly after: bigint | undefined;
  readonly delta: bigint | undefined;
  readonly status: BatchAuditStatus;
}

export interface BatchAuditInputRow {
  readonly address: HexAddress;
  readonly amount: bigint;
}

function auditStatus(delta: bigint | undefined, amount: bigint): BatchAuditStatus {
  if (delta === undefined) return 'unknown';
  if (delta === amount) return 'matched';
  if (delta === 0n) return 'unchanged';
  return 'anomaly';
}

export function buildBatchAudit(
  rows: readonly BatchAuditInputRow[],
  before: readonly (bigint | undefined)[],
  after: readonly (bigint | undefined)[],
): readonly BatchAuditRow[] {
  return rows.map((row, index) => {
    const beforeValue = before[index];
    const afterValue = after[index];
    const delta =
      beforeValue !== undefined && afterValue !== undefined ? afterValue - beforeValue : undefined;
    return {
      address: row.address,
      amount: row.amount,
      before: beforeValue,
      after: afterValue,
      delta,
      status: auditStatus(delta, row.amount),
    };
  });
}

/** Number of rows the chain did not deliver as promised (used by the receipt note). */
export function countAuditMismatches(rows: readonly BatchAuditRow[]): number {
  return rows.filter((row) => row.status === 'anomaly' || row.status === 'unchanged').length;
}
