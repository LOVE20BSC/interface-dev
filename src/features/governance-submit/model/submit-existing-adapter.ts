import type { TransactionReceipt } from 'viem';
import { useWriteContract } from 'wagmi';
import { submitAbi } from '@/config/abis';
import { toUserMessage } from '@/shared/lib/errors';
import type { WriteAttemptAdapter } from '@/shared/model/use-write-attempt';
import type { SubmitExistingInput, SubmitExistingReceipt } from './use-submit-existing';

/**
 * 治理域「推举历史提案」的写链 adapter：`persist:'none'`、`approve:'none'`。
 *
 * 合约调用是 `Submit.submit(token, memberId, proposalId, submitData)`（不新建提案，
 * 所以回执事实来自 `ProposalSubmitted`）；这里的 `send` 逐参保留迁移前的调用。
 */
export interface SubmitExistingAdapterOptions {
  /** 上链失败 / 回滚时的中文提示（沿用 hook 入参给的 copy，不新增文案）。 */
  readonly reverted: string;
  readonly onConfirmed: () => void;
  parse(receipt: TransactionReceipt): SubmitExistingReceipt;
}

export function useSubmitExistingAdapter(
  options: SubmitExistingAdapterOptions,
): WriteAttemptAdapter<SubmitExistingInput, SubmitExistingReceipt, void> {
  const { writeContractAsync } = useWriteContract();
  return {
    persist: 'none',
    approve: 'none',
    // `persist:'none'` 时 core 直接跳过 hydration 归属校验（治理本来就没有记录）。
    ownerChanged: options.reverted,
    reverted: options.reverted,
    readRecord: () => null,
    writeRecord: () => undefined,
    clearRecord: () => undefined,
    send: async (_step, intent, nonce) =>
      writeContractAsync({
        address: intent.submitAddress,
        abi: submitAbi,
        functionName: 'submit',
        args: [intent.tokenAddress, intent.memberId, intent.proposalId, '0x'],
        ...(nonce !== undefined ? { nonce } : {}),
      }),
    parseReceipt: (_step, receipt) => options.parse(receipt),
    translate: (cause) => ({ message: toUserMessage(cause) }),
    onConfirmed: options.onConfirmed,
  };
}
