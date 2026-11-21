import { parseEventLogs, type TransactionReceipt } from 'viem';
import { mintAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { isSameAddress } from '@/shared/lib/format';

/**
 * 从回执里解析这一次销毁实际烧掉的金额（`Mint.sol:179-185` 的 `ProposalRewardBurned`）。
 *
 * 回执是链上事实：页面不拿「按公式估算的那个数」冒充销毁结果。事件可能一次都不出现
 * （票数 0 / 票数到门槛时合约静默返回，或者交易根本没进这一步），这时返回 `null`，
 * 页面只显示回执标题与关闭按钮，不编数字。
 */
export interface ProposalRewardBurnedEvent {
  readonly proposalId: bigint;
  readonly amount: bigint;
}

export function parseProposalRewardBurned(
  receipt: TransactionReceipt,
  tokenAddress: HexAddress,
  round: bigint,
  proposalId: bigint,
): ProposalRewardBurnedEvent | null {
  const logs = parseEventLogs({
    abi: mintAbi,
    eventName: 'ProposalRewardBurned',
    logs: receipt.logs,
  });
  for (const log of logs) {
    if (!isSameAddress(log.args.tokenAddress, tokenAddress)) continue;
    if (log.args.round !== round) continue;
    if (log.args.proposalId !== proposalId) continue;
    return { proposalId: log.args.proposalId, amount: log.args.amount };
  }
  return null;
}
