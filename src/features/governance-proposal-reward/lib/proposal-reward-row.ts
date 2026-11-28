import { proposalRewardShare } from '@/domain/gov-core';
import type { ProposalRewardRow } from '@/entities/gov-core/model/use-proposal-rewards';
import { copy } from '@/shared/config/copy-pages';

export type ProposalRewardTone = 'neutral' | 'success' | 'danger';

export interface ProposalRewardRowView {
  readonly status: string;
  readonly hint: string;
  readonly tone: ProposalRewardTone;
  /** 这一行是否应该出现「销毁这部分」按钮。 */
  readonly canBurn: boolean;
}

/**
 * 一行的状态词 / 说明 / 能否销毁（`Mint.sol:152-191`）。
 *
 * 只有「未结算 + 票数 > 0 + 票数 < 门槛」的提案实际会销毁：票数为 0 或票数到门槛时
 * 合约**静默返回**（无事件、状态不变），所以这两类不给按钮，只用说明写清原因
 * （`copy.gov.proposalRewards.noVoteHint` / `eligibleHint`）。已铸造 / 已销毁的提案
 * 也不再给按钮——达标提案的激励只能由提案目标合约铸造（`onlyProposalTarget`）。
 */
export function proposalRewardRowView(row: ProposalRewardRow): ProposalRewardRowView {
  const minted = row.settlement === 1;
  const burned = row.settlement === 2;
  const canBurn = row.settlement === 0 && row.voteAmount > 0n && !row.eligible;
  const status = minted
    ? copy.gov.proposalRewards.statusMinted
    : burned
      ? copy.gov.proposalRewards.statusBurned
      : copy.gov.proposalRewards.statusPending;
  const hint = row.eligible
    ? copy.gov.proposalRewards.eligibleHint
    : row.voteAmount === 0n
      ? copy.gov.proposalRewards.noVoteHint
      : copy.gov.proposalRewards.ineligibleHint;
  const tone: ProposalRewardTone = minted ? 'success' : burned ? 'danger' : 'neutral';
  return { status, hint, tone, canBurn };
}

/**
 * 行内「激励」金额。
 *
 * `Mint.proposalRewardSettlement` 只在「已销毁」或「票数到门槛」时返回金额；对
 * **不达标且未销毁**的提案返回 0（[CI-011](../../../../docs/contract-issues/011-silent-zero-ambiguity.md)
 * 的歧义 0：既可能是真的 0，也可能是「还能被销毁的那部分」）。这一页拿到的是同一轮的
 * 真实读值（池子 / 总票数 / 该提案票数），按 `Mint.sol:311-318` 的公式
 * （`domain/gov-core#proposalRewardShare`）能还原出确切金额——它就是销毁事件里的
 * `amount`，也是达标提案铸造出来的那个数。
 *
 * 口径：结算值本身 > 0 时直接用结算值（链上事实优先）；池子或总票数还读不到时返回
 * `undefined`，页面渲染「—」，**不拿 0 冒充未知**。
 */
export function proposalRewardRowAmount(
  row: ProposalRewardRow,
  pool: bigint | undefined,
  totalVoteAmount: bigint | undefined,
): bigint | undefined {
  if (row.amount > 0n) return row.amount;
  if (pool === undefined || totalVoteAmount === undefined) return undefined;
  return proposalRewardShare(pool, row.voteAmount, totalVoteAmount);
}
