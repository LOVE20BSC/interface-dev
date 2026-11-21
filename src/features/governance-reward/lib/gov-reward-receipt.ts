import { parseEventLogs, type TransactionReceipt } from 'viem';
import { mintAbi } from '@/config/abis';

/**
 * 回执里这一次铸造实际发出的数量。
 *
 * 数字只认链上事实：`GovRewardMinted` 事件（`Mint.sol:520-527`）里的
 * `voteReward + boostReward` 逐条累加。
 *
 * - 不能用 `totalRewardMinted`：那是这个代币**累计**铸出的总量（`Mint.sol:526`），
 *   不是这一笔的数量；
 * - 拿不到事件时 `amount` 是 `undefined`，页面只显示回执标题与关闭按钮，
 *   绝不拿提交前的读模型数字冒充链上结果。
 */
export interface GovRewardReceipt {
  /** 这一次提交的轮次（提交时的顺序），用于回执文案。 */
  readonly rounds: readonly bigint[];
  /** 这一次实际铸出的数量；没有解析到事件时为 `undefined`。 */
  readonly amount: bigint | undefined;
}

export function parseGovRewardReceipt(
  receipt: TransactionReceipt,
  rounds: readonly bigint[],
): GovRewardReceipt {
  const logs = parseEventLogs({ abi: mintAbi, eventName: 'GovRewardMinted', logs: receipt.logs });
  if (logs.length === 0) return { rounds, amount: undefined };
  let amount = 0n;
  for (const log of logs) {
    amount += log.args.voteReward + log.args.boostReward;
  }
  return { rounds, amount };
}
