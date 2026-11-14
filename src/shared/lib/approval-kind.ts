/**
 * 授权额度三态 (owner 2026-11-14).
 *
 * Shared by every page that renders a token-approval button (兑换 / 流动性 /
 * 批量转账 / 代币授权). The owner asked for one global rule: if the token was
 * approved long-term on the approvals page, every other page must say so too
 * instead of quietly asking for another approval.
 *
 *   value === 0                    → 未授权 (unapproved)
 *   value >= 2^255                 → 长期授权 (unlimited)
 *   0 < value < 2^255              → 具体额度 (limited)
 *
 * Kept in shared so no feature has to import another feature (eslint
 * dependency-direction rule).
 */

/** 长期授权 after this value (inclusive). `2^255 - 1` is still a concrete amount. */
export const UNLIMITED_APPROVAL_THRESHOLD = 2n ** 255n;

export type ApprovalKind = 'unapproved' | 'unlimited' | 'limited';

export function approvalKind(allowance: bigint): ApprovalKind {
  if (allowance <= 0n) return 'unapproved';
  if (allowance >= UNLIMITED_APPROVAL_THRESHOLD) return 'unlimited';
  return 'limited';
}
