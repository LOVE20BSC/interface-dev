import { useRef } from 'react';
import { useWriteContract } from 'wagmi';
import { mintAbi } from '@/config/abis';
import type { WriteAttemptAdapter } from '@/shared/model/use-write-attempt';
import { parseProposalRewardBurned } from '../lib/proposal-reward-receipt';
import type { ProposalRewardBurnInput, ProposalRewardReceipt } from './use-proposal-reward-write';

/**
 * 提案激励销毁的写链 adapter：`persist:'none'`、`approve:'none'`。
 *
 * 回执口径（`Mint.sol:152-191`）：合约在票数为 0 / 票数到门槛 / 已销毁过时**静默返回**
 * （交易成功但可能没有 `ProposalRewardBurned`）。所以解析用 `send` 记下的 intent
 * （token / round / proposalId）过滤事件，拿不到事件时只带提案编号、`amount:null`，
 * 绝不拿读模型数字冒充链上结果。
 */
export interface ProposalRewardWriteAdapterOptions {
  /** 上链失败 / 回滚时的中文提示（沿用面板 copy，不新增文案）。 */
  readonly reverted: string;
  readonly onConfirmed: () => void;
}

export function useProposalRewardWriteAdapter(
  options: ProposalRewardWriteAdapterOptions,
): WriteAttemptAdapter<ProposalRewardBurnInput, ProposalRewardReceipt, void> {
  const { writeContractAsync } = useWriteContract();
  const intentRef = useRef<ProposalRewardBurnInput | null>(null);
  return {
    persist: 'none',
    reverted: options.reverted,
    send: async (_step, intent, nonce) => {
      intentRef.current = intent;
      return writeContractAsync({
        address: intent.mintAddress,
        abi: mintAbi,
        functionName: 'burnProposalReward',
        args: [intent.tokenAddress, intent.round, intent.proposalId],
        ...(nonce !== undefined ? { nonce } : {}),
      });
    },
    parseReceipt: (_step, receipt) => {
      const intent = intentRef.current;
      if (intent === null) return null;
      const burned = parseProposalRewardBurned(
        receipt,
        intent.tokenAddress,
        intent.round,
        intent.proposalId,
      );
      return burned === null
        ? { proposalId: intent.proposalId, amount: null }
        : { proposalId: burned.proposalId, amount: burned.amount };
    },
    onConfirmed: options.onConfirmed,
  };
}
