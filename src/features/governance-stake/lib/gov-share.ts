/**
 * 占比口径（首页「我的占比 / 加速质押占比」与治理权查询共用一份实现）。
 *
 * 旧版 TKM 的「治理票占比」是 `我的 / 社区总数`，保留 2 位小数并**向下截断**
 * （`4.765%` → `4.76`，与旧版一致）。这里保持同一口径，避免首页、查询面板、
 * `/stake/liquid` 三处算出三个不同的百分数。
 *
 * 未知与 0 分开：任一侧没读回来 → `undefined`（页面渲染「—」）；两边都读到、
 * 分子为 0 → `0`（真实的 0，不是未知）。
 */
export function sharePercent(
  part: bigint | undefined,
  total: bigint | undefined,
): number | undefined {
  if (part === undefined || total === undefined) return undefined;
  if (total === 0n) return part === 0n ? 0 : undefined;
  return Number((part * 10_000n) / total) / 100;
}
