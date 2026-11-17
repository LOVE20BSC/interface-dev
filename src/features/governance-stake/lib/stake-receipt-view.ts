import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';
import type { StakeReceipt } from './stake-receipt';

const VOTE_DECIMALS = 18;

/** 回执标题按动作取自 copy；纯函数，便于页面与单测共用。 */
export function stakeReceiptTitle(receipt: StakeReceipt): string {
  switch (receipt.action) {
    case 'stakeLiquidity':
      return copy.gov.receipt.liquidity;
    case 'stakeBoost':
      return copy.gov.receipt.boost;
    case 'increasePhases':
      return copy.gov.receipt.increasePhases;
    case 'unstake':
      return copy.gov.receipt.unstake;
    case 'withdraw':
      return copy.gov.receipt.withdraw;
  }
}

export interface StakeReceiptUnits {
  readonly tokenSymbol: string;
  readonly tokenDecimals: number | undefined;
  readonly parentSymbol: string;
  readonly parentDecimals: number | undefined;
}

/**
 * 回执明细：数值全部来自交易事件（`stake-receipt.ts` 解码），不是前端估算。
 * 撤出时回执给**实际到账**——LP 折算 + 加速质押退还，父币单列。
 */
export function stakeReceiptLines(
  receipt: StakeReceipt,
  units: StakeReceiptUnits,
): readonly string[] {
  const { detail } = receipt;
  switch (receipt.action) {
    case 'stakeLiquidity': {
      const lines: string[] = [];
      if (detail.govVotesAdded !== undefined) {
        lines.push(copy.gov.receipt.votes(formatTokenAmount(detail.govVotesAdded, VOTE_DECIMALS)));
      }
      if (detail.liquiditySharesAdded !== undefined) {
        lines.push(
          copy.gov.receipt.shares(formatTokenAmount(detail.liquiditySharesAdded, VOTE_DECIMALS)),
        );
      }
      return lines;
    }
    case 'stakeBoost':
      return detail.boostAmount !== undefined
        ? [
            copy.gov.receipt.boostAmount(
              formatTokenAmount(detail.boostAmount, units.tokenDecimals),
              units.tokenSymbol,
            ),
          ]
        : [];
    case 'increasePhases': {
      const lines: string[] = [];
      if (detail.promisedWaitingPhases !== undefined) {
        lines.push(
          copy.gov.receipt.increasePhasesNote(formatTokenAmount(detail.promisedWaitingPhases, 0)),
        );
      }
      if (detail.govVotesAdded !== undefined) {
        lines.push(copy.gov.receipt.votes(formatTokenAmount(detail.govVotesAdded, VOTE_DECIMALS)));
      }
      return lines;
    }
    case 'unstake':
      return [copy.gov.receipt.unstakeNote];
    case 'withdraw': {
      if (detail.tokenAmount === undefined || detail.parentTokenAmount === undefined) return [];
      const tokenTotal = detail.tokenAmount + (detail.boostAmount ?? 0n);
      return [
        copy.gov.receipt.withdrawNote(
          formatTokenAmount(tokenTotal, units.tokenDecimals),
          units.tokenSymbol,
          formatTokenAmount(detail.parentTokenAmount, units.parentDecimals),
          units.parentSymbol,
        ),
      ];
    }
  }
}
