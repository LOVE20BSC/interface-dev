import { parseEventLogs, type TransactionReceipt } from 'viem';
import { submitAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { toUserMessage } from '@/shared/lib/errors';
import { useContractWrite, type ContractCall } from '@/shared/model/use-contract-write';

/**
 * 「推举历史提案」的写链状态机（owner 2026-11-22）。
 *
 * 与新建提案分开：合约调用是 `Submit.submit(token, memberId, proposalId, submitData)`，
 * 没有 `ProposalCreated`（提案不是新建的），回执事实来自 `ProposalSubmitted` 事件
 * （轮次 + 提案编号 + 推举人）。
 */

export interface SubmitExistingInput {
  readonly submitAddress: HexAddress;
  readonly tokenAddress: HexAddress;
  readonly memberId: bigint;
  readonly proposalId: bigint;
}

export interface SubmitExistingReceipt {
  readonly round: bigint | null;
  readonly proposalId: bigint | null;
}

export function parseSubmitExistingReceipt(receipt: TransactionReceipt): SubmitExistingReceipt {
  const submitted = parseEventLogs({
    abi: submitAbi,
    eventName: 'ProposalSubmitted',
    logs: receipt.logs,
  })[0];
  if (submitted === undefined) return { round: null, proposalId: null };
  return { round: submitted.args.round, proposalId: submitted.args.proposalId };
}

export interface SubmitExistingWrite {
  readonly stage: 'idle' | 'wallet' | 'pending';
  readonly error: string | null;
  readonly watch: ReturnType<typeof useContractWrite>['watch'];
  readonly receipt: SubmitExistingReceipt | null;
  readonly submit: (input: SubmitExistingInput) => void;
  readonly closeReceipt: () => void;
}

export function useSubmitExisting(
  messages: { readonly waitingWallet: string; readonly revert: string },
  onConfirmed: () => void,
): SubmitExistingWrite {
  const write = useContractWrite(
    {
      wallet: messages.waitingWallet,
      reverted: messages.revert,
    },
    toUserMessage,
    onConfirmed,
  );

  const settled = write.watch.receipt;
  const receipt: SubmitExistingReceipt | null =
    settled !== null && settled.status === 'success' ? parseSubmitExistingReceipt(settled) : null;

  const submit = (input: SubmitExistingInput): void => {
    const call: ContractCall = {
      address: input.submitAddress,
      abi: submitAbi,
      functionName: 'submit',
      args: [input.tokenAddress, input.memberId, input.proposalId, '0x'],
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
