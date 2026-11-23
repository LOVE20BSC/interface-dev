import { useMemo } from 'react';
import { voteAbi } from '@/config/abis';
import { toUserMessage } from '@/shared/lib/errors';
import { useContractWrite, type ContractCall } from '@/shared/model/use-contract-write';
import { parseVoteReceipt, type VoteReceiptLine } from '../lib/vote-receipt';

/**
 * 治理域没有代币授权，所以只有「签名 → 上链 → 回执」一段；要显示什么数字由回执里的
 * `VoteCast` 事件决定（`lib/vote-receipt`），不拿页面输入冒充链上结果。
 */
export interface VoteInput {
  readonly voteAddress: `0x${string}`;
  readonly tokenAddress: `0x${string}`;
  readonly memberId: bigint;
  readonly proposalIds: readonly bigint[];
  readonly voteAmounts: readonly bigint[];
}

export interface VoteWrite {
  readonly stage: 'idle' | 'wallet' | 'pending';
  readonly error: string | null;
  readonly watch: ReturnType<typeof useContractWrite>['watch'];
  readonly receipt: readonly VoteReceiptLine[] | null;
  readonly submit: (input: VoteInput) => void;
  readonly closeReceipt: () => void;
}

export interface VoteWriteMessages {
  readonly waitingWallet: string;
  readonly pending: string;
  readonly revert: string;
}

export function useVoteWrite(messages: VoteWriteMessages, onConfirmed: () => void): VoteWrite {
  const write = useContractWrite(
    {
      wallet: messages.waitingWallet,
      reverted: messages.revert,
    },
    toUserMessage,
    onConfirmed,
  );
  // 回执是派生值：`watch.receipt` 一旦结算就不会再变，不需要再用 state/effect 同步。
  const receiptData = write.watch.receipt;
  const receipt = useMemo(
    () => (receiptData?.status === 'success' ? parseVoteReceipt(receiptData) : null),
    [receiptData],
  );

  const submit = (input: VoteInput): void => {
    const call: ContractCall = {
      address: input.voteAddress,
      abi: voteAbi,
      functionName: 'vote',
      args: [input.tokenAddress, input.memberId, input.proposalIds, input.voteAmounts, []],
    };
    void write.run(call);
  };

  return {
    stage: write.stage,
    error: write.error,
    watch: write.watch,
    receipt,
    submit,
    closeReceipt: () => write.reset(),
  };
}
