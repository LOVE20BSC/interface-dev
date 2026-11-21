import { formatSharePercent } from '@/shared/lib/share-percent';

/**
 * 我的投票占比（owner 2026-11-21 明确口径）：
 * **我在这个提案投出的票数 / 这个提案在本轮收到的总票数**。
 *
 * 注意分母不是「该轮总投出票数」——同一轮里不同提案的票数可能差很多，
 * 用轮总票数会把「我在 A 提案占 90%」显示成「占本轮 45%」这种误导性数字。
 *
 * `proposalTotalVotes < 0` 表示这一项没读回来：返回 `undefined`，页面不显示占比，
 * 绝不拿「我的票数」当分母凑一个 100%（硬规则 4：未知不给假值）。
 */
export function myVoteSharePercent(
  myVotes: bigint,
  proposalTotalVotes: bigint,
): string | undefined {
  if (proposalTotalVotes < 0n) return undefined;
  return formatSharePercent(myVotes, proposalTotalVotes);
}
