import { useWriteContract } from 'wagmi';
import { voteAbi } from '@/config/abis';
import { toUserMessage } from '@/shared/lib/errors';
import type { WriteAttemptAdapter } from '@/shared/model/use-write-attempt';
import { parseVoteReceipt, type VoteReceiptLine } from '../lib/vote-receipt';
import type { VoteInput } from './use-vote-write';

/**
 * 治理域「投票」的写链 adapter：`persist:'none'`、`approve:'none'`。
 *
 * 回执里的数字只认链上事实（`VoteCast` 事件），解析仍走 `lib/vote-receipt` 的
 * `parseVoteReceipt`；`send` 逐参保留迁移前的 `Vote.vote(...)` 调用与 nonce 透传。
 */
export interface VoteWriteAdapterOptions {
  /** 上链失败 / 回滚时的中文提示（沿用 hook 入参给的 copy，不新增文案）。 */
  readonly reverted: string;
  readonly onConfirmed: () => void;
}

export function useVoteWriteAdapter(
  options: VoteWriteAdapterOptions,
): WriteAttemptAdapter<VoteInput, readonly VoteReceiptLine[], void> {
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
        address: intent.voteAddress,
        abi: voteAbi,
        functionName: 'vote',
        args: [intent.tokenAddress, intent.memberId, intent.proposalIds, intent.voteAmounts, []],
        ...(nonce !== undefined ? { nonce } : {}),
      }),
    parseReceipt: (_step, receipt) => parseVoteReceipt(receipt),
    translate: (cause) => ({ message: toUserMessage(cause) }),
    onConfirmed: options.onConfirmed,
  };
}
