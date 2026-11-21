import { useMemo } from 'react';
import { voteAbi } from '@/config/abis';
import { copy } from '@/shared/config/copy-pages';
import { toUserMessage } from '@/shared/lib/errors';
import { useContractWrite, type ContractCall } from '@/shared/model/use-contract-write';
import { parseVoteReceipt, type VoteReceiptLine } from '../lib/vote-receipt';

/**
 * 投票的写链状态机：一笔 `Vote.vote(token, memberId, proposalIds[], voteAmounts[], targetData[][])`。
 *
 * 治理域没有代币授权，所以只有「签名 → 上链 → 回执」一段；要显示什么数字由回执里的
 * `VoteCast` 事件决定（`lib/vote-receipt`），不拿页面输入冒充链上结果。
 *
 * `targetData`：不回调的提案传空数组（长度必须与 `proposalIds` 一致，否则合约
 * `TargetDataLengthMismatch`）。回调提案本页不投，所以在 core 覆盖范围内永远是空。
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
  readonly resubmit: () => void;
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
      ownerChanged: copy.gov.tx.ownerChanged,
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
      args: [
        input.tokenAddress,
        input.memberId,
        input.proposalIds,
        input.voteAmounts,
        input.proposalIds.map(() => [] as `0x${string}`[]),
      ],
    };
    void write.run(call);
  };

  return {
    stage: write.stage,
    error: write.error,
    watch: write.watch,
    receipt,
    submit,
    resubmit: write.resubmit,
    closeReceipt: () => write.reset(),
  };
}
