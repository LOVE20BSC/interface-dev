import type { TxWatch } from '@/shared/model/use-tx-watch';
import { useWriteAttempt } from '@/shared/model/use-write-attempt';
import type { VoteReceiptLine } from '../lib/vote-receipt';
import { useVoteWriteAdapter } from './vote-write-adapter';

/**
 * 治理域没有代币授权，所以只有「签名 → 上链 → 回执」一段；要显示什么数字由回执里的
 * `VoteCast` 事件决定（`lib/vote-receipt`），不拿页面输入冒充链上结果。
 *
 * 写链生命周期由 `useWriteAttempt` 纯核持有；这里只做投影（`submit` void、
 * `closeReceipt` → `clearReceipt`、`error` 取 message、回执数组由 adapter 解析）。
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
  readonly watch: TxWatch;
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
  const adapter = useVoteWriteAdapter({
    reverted: messages.revert,
    onConfirmed,
  });
  const write = useWriteAttempt(adapter);

  const submit = (input: VoteInput): void => {
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
