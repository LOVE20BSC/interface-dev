/**
 * 占比显示的统一实现（治理权占比 / 加速份额占比 / LP 占比 / 空投份额外的份额类百分比）。
 *
 * 规则（owner 2026-11-19）：`部分 / 总数` × 100；
 *
 * - `≥ 0.01%`：最多 2 位小数、**截断不进位**（`4.765%` → `4.76`、`99.9999%` → `99.99%`）；
 * - `< 0.01%`：用 `0.{x}yyyy`——`x` = 小数点后前导 0 的个数、`yyyy` = 随后最多
 *   4 位非零数字；`x` 不设上限，永不落成 `0%`。
 *
 * 全程 BigInt：避免 `Number` 先把 1/10^24 这种极小占比截成 0，也避免 99.9999%
 * 被浮点进位成 100%。返回不带 `%` 的数字文本。
 */
export function formatSharePercent(
  part: bigint | undefined,
  total: bigint | undefined,
): string | undefined {
  if (part === undefined || total === undefined) return undefined;
  if (total === 0n) return part === 0n ? '0' : undefined;
  if (part === 0n) return '0';

  // 百分数 × 100（两位小数），整数除法即「向下截断」。
  const hundredths = (part * 10_000n) / total;
  if (hundredths > 0n) {
    const whole = hundredths / 100n;
    const fraction = (hundredths % 100n).toString().padStart(2, '0').replace(/0+$/, '');
    return fraction.length > 0 ? `${whole}.${fraction}` : whole.toString();
  }

  // 极小占比：找到第一个有效位，再多取 3 位（合计最多 4 位非零数字）。
  const base = part * 100n;
  let exponent = 1;
  while ((base * 10n ** BigInt(exponent)) / total === 0n && exponent < 80) exponent += 1;
  const scaled = (base * 10n ** BigInt(exponent + 3)) / total;
  const digits = scaled.toString().slice(0, 4).replace(/0+$/, '');
  return `0.${'0'.repeat(exponent - 1)}${digits}`;
}
