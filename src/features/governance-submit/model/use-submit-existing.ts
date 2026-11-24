import { parseEventLogs, type TransactionReceipt } from 'viem';
import { submitAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import { useWriteAttempt } from '@/shared/model/use-write-attempt';
import { useSubmitExistingAdapter } from './submit-existing-adapter';

/**
 * 「推举历史提案」的写链状态机（owner 2026-11-22）。
 *
 * 与新建提案分开：合约调用是 `Submit.submit(token, memberId, proposalId, submitData)`，
 * 没有 `ProposalCreated`（提案不是新建的），回执事实来自 `ProposalSubmitted` 事件
 * （轮次 + 提案编号 + 推举人）。
 *
 * 写链生命周期由 `useWriteAttempt` 纯核持有；这里只做投影（`submit` void、
 * `closeReceipt` → `clearReceipt`、`error` 取 message）。
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
  readonly watch: TxWatch;
  readonly receipt: SubmitExistingReceipt | null;
  readonly submit: (input: SubmitExistingInput) => void;
  readonly closeReceipt: () => void;
}

export function useSubmitExisting(
  messages: { readonly waitingWallet: string; readonly revert: string },
  onConfirmed: () => void,
): SubmitExistingWrite {
  const adapter = useSubmitExistingAdapter({
    reverted: messages.revert,
    onConfirmed,
    parse: parseSubmitExistingReceipt,
  });
  const write = useWriteAttempt(adapter);

  const submit = (input: SubmitExistingInput): void => {
    void write.run(input);
  };

  return {
    stage: write.stage,
    error: write.error?.message ?? null,
    watch: write.watch,
    receipt: write.receipt,
    submit,
    closeReceipt: write.clearReceipt,
  };
}
