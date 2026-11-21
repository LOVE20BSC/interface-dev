import { formatUnits } from 'viem';

/**
 * 「提案投票详情页」的快捷百分比（owner 2026-11-22）。
 *
 * 口径：百分比作用在**还能投的票数**（`Vote.maxVoteAmount − 本轮已投`）上，
 * 与 `domain/gov-core#remainingVotes` 同一个来源；不在组件里做减法。
 */
export const VOTE_QUICK_PERCENTS = [25, 50, 100] as const;
export type VoteQuickPercent = (typeof VOTE_QUICK_PERCENTS)[number];

/**
 * 百分比 → 票数（wei 级 `bigint`）。
 *
 * - 向下截断：合约按整数票记，多给的一点不能凭空出现（§4.5.1 一律截断）；
 * - 非零额度至少 1 票：额度只剩 0.001 票时点「25%」不该得到 0（合约会 `ZeroVoteAmount`）；
 * - 额度未知或为 0 时返回 `undefined`：页面据此禁用按钮，而不是显示「0 票」。
 */
export function votesForPercent(
  remaining: bigint | undefined,
  percent: VoteQuickPercent,
  decimals = 18,
): bigint | undefined {
  if (remaining === undefined || remaining <= 0n) return undefined;
  const oneVote = 10n ** BigInt(decimals);
  const exact = (remaining * BigInt(percent)) / 100n;
  if (exact > 0n) return exact;
  // 余量不足 1 票时向上取 1 票仍会超额度，所以只在余量本身够 1 票时才兜底。
  return remaining >= oneVote ? oneVote : undefined;
}

/** 票数 → 输入框文本：整数不带小数点，小数去掉尾随 0（与页面其他金额输入同一形）。 */
export function votesToInputText(value: bigint, decimals = 18): string {
  const text = formatUnits(value, decimals);
  if (!text.includes('.')) return text;
  return text.replace(/0+$/, '').replace(/\.$/, '');
}
