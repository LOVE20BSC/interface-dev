import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';

/**
 * The one balance line on a 兑换 card, used by both 「从」 and 「到」 (owner
 * 2026-11-14: 「到：这个代币，也应该显示余额」).
 *
 * Rules, identical on both sides:
 * - one 「余额 {symbol}」 label followed by the amount — the symbol is written
 *   once, never repeated after the number;
 * - six fraction digits at most (the shared `formatTokenAmount` rule);
 * - no 「精度 18 位」 tag: swap cards never render a precision label;
 * - an unknown balance is `—`, never `0` (a zero balance still renders `0`).
 */
export function swapBalanceLine(
  symbol: string,
  balance: bigint | undefined,
  decimals: number | undefined,
): string {
  return `${copy.swap.balanceLabel(symbol)} ${formatTokenAmount(balance, decimals)}`;
}
