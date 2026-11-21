import { parseEventLogs, type TransactionReceipt } from 'viem';
import { voteAbi } from '@/config/abis';

/**
 * 从回执里解析这一次投票实际记下的票数（`VoteCast` 事件，`Vote.sol:329-339`）。
 *
 * 回执是链上事实，比「刚才填了多少」可信：钱包可能只发送了部分输入、或者同一笔里
 * 有提案被合约拒绝（整笔回滚则不产生回执）。页面拿它做回执面板的数字来源。
 */
export interface VoteReceiptLine {
  readonly proposalId: bigint;
  readonly voteAmount: bigint;
}

export function parseVoteReceipt(receipt: TransactionReceipt): VoteReceiptLine[] {
  const logs = parseEventLogs({
    abi: voteAbi,
    eventName: 'VoteCast',
    logs: receipt.logs,
  });
  return logs.map((log) => ({
    proposalId: log.args.proposalId,
    voteAmount: log.args.voteAmount,
  }));
}
