/**
 * Share percentages for the airdrop surfaces.
 *
 * Shares are uint256 values (the snapshot uses 1e18 for 100%). 显示规则与治理占比
 * 一致（owner 2026-11-19）：>= 0.01% 保留两位小数、截断不进位；< 0.01% 用
 * `0.{x}yyyy`（x = 前导 0 个数、yyyy = 随后最多 4 位非零数字），x 不设上限，
 * 极小占比绝不显示成 0%。全程 BigInt，避免 Number 先把 1/1e24 截成 0。
 *
 * `null` means "cannot be displayed", never 0.
 */
const HUNDREDTHS_SCALE = 100n;

export function formatSharePercent(share: bigint, totalShare: bigint): string | null {
  if (share < 0n || totalShare <= 0n) return null;
  if (share === 0n) return '0%';

  // 百分数 × 100（两位小数），BigInt 运算保证边界值精确截断。
  const hundredths = (share * 10_000n) / totalShare;
  if (hundredths > 0n) {
    const whole = hundredths / HUNDREDTHS_SCALE;
    const fraction = (hundredths % HUNDREDTHS_SCALE).toString().padStart(2, '0').replace(/0+$/, '');
    return fraction.length > 0 ? `${whole}.${fraction}%` : `${whole}%`;
  }

  // 极小占比：找到第一个有效位，再多取 3 位（合计最多 4 位非零数字）。
  const base = share * 100n;
  let exponent = 1;
  while ((base * 10n ** BigInt(exponent)) / totalShare === 0n && exponent < 80) exponent += 1;
  const scaled = (base * 10n ** BigInt(exponent + 3)) / totalShare;
  const digits = scaled.toString().slice(0, 4).replace(/0+$/, '');
  return `0.${'0'.repeat(exponent - 1)}${digits}%`;
}
