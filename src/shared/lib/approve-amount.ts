/**
 * 一次授权按钮写多少额度 (owner 2026-11-16).
 *
 * The owner spotted that the 「默认使用长期授权」 switch on `/approvals` only changed
 * that page's button styling: swap / mint / liquidity / batch-transfer kept
 * writing the exact amount they needed, so the preference never reached the
 * chain. This module is the single decision point every approve ladder calls:
 *
 *   preference off → the exact amount this transaction needs (existing rule)
 *   preference on  → `maxUint256`, i.e. 长期授权 (same value the approvals page writes)
 *
 * Pure module: no React, no storage, no chain SDK, so the on/off boundary is
 * provable in `approve-amount.test.ts`. The preference itself is read by
 * `shared/lib/approval-preference.ts`; this file only maps boolean → bigint.
 */

/** The value a 长期授权 writes: `maxUint256`. 撤销 writes `0`. */
export const UNLIMITED_APPROVAL_VALUE = 2n ** 256n - 1n;

/**
 * @param useUnlimited 默认使用长期授权偏好（设备级；关闭时写精确额度）
 * @param exact 这一笔实际需要的额度（swap 的输入额、mint 的报价+缓冲、批量转账合计…）
 */
export function decideApproveAmount(useUnlimited: boolean, exact: bigint): bigint {
  return useUnlimited ? UNLIMITED_APPROVAL_VALUE : exact;
}
