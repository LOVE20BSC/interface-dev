import { copy } from '@/shared/config/copy-pages';
import {
  approvalKind,
  UNLIMITED_APPROVAL_THRESHOLD,
  type ApprovalKind,
} from '@/shared/lib/approval-kind';
import { TOKEN_AMOUNT_MAX_FRACTION_DIGITS, formatTokenAmount } from '@/shared/lib/format';

export { approvalKind, UNLIMITED_APPROVAL_THRESHOLD, type ApprovalKind };

/**
 * 代币授权三态 (owner 2026-11-14).
 *
 * The old TKM page (`../LOVE20TKM/interface/src/lib/tokenApproval.ts`) treated
 * anything above `maxUint256 / 2` as an unlimited approval. This module keeps
 * that semantic but writes the threshold down as an exact constant so the
 * theory line, the chain script and the page can never disagree:
 *
 *   value === 0                    → 未授权
 *   value >= 2^255                 → 长期授权
 *   0 < value < 2^255              → 具体额度
 *
 * Pure module: no React, no wagmi, no chain SDK, so every boundary is provable
 * in `approval-amount.test.ts`.
 */

/** The value a 「长期授权」 button writes; 撤销 writes 0. */
export const UNLIMITED_APPROVAL_VALUE = 2n ** 256n - 1n;

/** Smallest amount `formatTokenAmount` can show without collapsing to `0`. */
function smallestVisibleAmount(decimals: number): bigint {
  if (decimals <= TOKEN_AMOUNT_MAX_FRACTION_DIGITS) return 1n;
  return 10n ** BigInt(decimals - TOKEN_AMOUNT_MAX_FRACTION_DIGITS);
}

/**
 * One row's amount text. Never renders ok-looking `0` for a non-zero allowance
 * that the 6-digit display rule truncates away — that would read as 「未授权」.
 */
export function approvalDisplayText(allowance: bigint, symbol: string, decimals: number): string {
  const kind = approvalKind(allowance);
  if (kind === 'unapproved') return copy.approvals.states.unapproved;
  if (kind === 'unlimited') return copy.approvals.states.unlimited;
  const formatted = formatTokenAmount(allowance, decimals);
  if (formatted === '0') {
    return copy.approvals.states.belowMinimum(
      formatTokenAmount(smallestVisibleAmount(decimals), decimals),
      symbol,
    );
  }
  return `${formatted} ${symbol}`;
}

/** Whether the row can still grow its allowance through the 长期授权 button. */
export function canRaiseAllowance(allowance: bigint | undefined): boolean {
  return allowance !== undefined && approvalKind(allowance) !== 'unlimited';
}

/** Whether there is anything to undo through the 撤销 button. */
export function canRevokeAllowance(allowance: bigint | undefined): boolean {
  return allowance !== undefined && allowance > 0n;
}
