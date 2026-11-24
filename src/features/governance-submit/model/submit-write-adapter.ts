import type { TransactionReceipt } from 'viem';
import { useWriteContract } from 'wagmi';
import { submitAbi } from '@/config/abis';
import { toUserMessage } from '@/shared/lib/errors';
import type { WriteAttemptAdapter } from '@/shared/model/use-write-attempt';
import type { SubmitInput, SubmitReceipt } from './use-submit-write';

/**
 * 治理域「推举新提案」的写链 adapter：`persist:'none'`（治理不落盘）、`approve:'none'`
 * （治理域没有代币授权），所以只接 `send` / `parseReceipt` / `translate` 三个端口。
 *
 * - `send` 保留原来的 `Submit.submitNewProposal(...)` 参数与 nonce 透传；
 * - 回执解析由投影 hook 注入（`parseSubmitReceipt` 仍是唯一真相），core 只决定何时拿到回执；
 * - 错误文案仍是 `toUserMessage`，与迁移前的 `useContractWrite` 一致。
 */
export interface SubmitWriteAdapterOptions {
  /** 上链失败 / 回滚时的中文提示（沿用 hook 入参给的 copy，不新增文案）。 */
  readonly reverted: string;
  readonly onConfirmed: () => void;
  parse(receipt: TransactionReceipt): SubmitReceipt;
}

export function useSubmitWriteAdapter(
  options: SubmitWriteAdapterOptions,
): WriteAttemptAdapter<SubmitInput, SubmitReceipt, void> {
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
        functionName: 'submitNewProposal',
        args: [intent.tokenAddress, intent.memberId, intent.body, '0x'],
        ...(nonce !== undefined ? { nonce } : {}),
      }),
    parseReceipt: (_step, receipt) => options.parse(receipt),
    translate: (cause) => ({ message: toUserMessage(cause) }),
    onConfirmed: options.onConfirmed,
  };
}
