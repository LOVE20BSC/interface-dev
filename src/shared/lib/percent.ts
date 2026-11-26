/**
 * 百分比换算与滑点取整的唯一实现（C2 收口，2026-11-26）。
 *
 * 三个页面原先各写一份 `percentToBps` 与 `applySlippage*`，范围处理不一致：
 * - 兑换：`bps <= 0` 原样返回；正数上限 9999
 * - 加池：`clamp(0, 9999)` 后再算；为 0 时原样返回
 * - 质押：**不 clamp**（输入校验在页面层挡住，纯函数不防御）
 *
 * 前两者对上界与 0 的处理结果相同，合并成默认口径；质押页显式传 `clamp: false`
 * 保留它原有的可观察行为。`bps` 一律是整数（唯一来源是 `percentToBps`）。
 */

/** 百分数 → 基点（0.5% → 50）。 */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export interface ApplySlippageDownOptions {
  /** 是否把 bps 夹到 `[0, 9999]`。默认 true（兑换/加池口径）；质押页传 false。 */
  readonly clamp?: boolean;
}

/**
 * `amount × (10000 − bps) / 10000`，向下取整（「最少获得」）。
 *
 * `bps` 为 0 时原样返回；`clamp: false` 时不做范围保护（与质押页历史实现一致，
 * `bps > 10000` 会得到负值——页面层的输入校验负责挡住）。
 */
export function applySlippageDown(
  amount: bigint,
  bps: number,
  options: ApplySlippageDownOptions = {},
): bigint {
  const clamp = options.clamp ?? true;
  const bounded = clamp ? Math.min(Math.max(0, Math.round(bps)), 9_999) : Math.round(bps);
  if (bounded === 0) return amount;
  return (amount * BigInt(10_000 - bounded)) / 10_000n;
}
