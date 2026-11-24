import { useState } from 'react';
import { useAccount } from 'wagmi';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import type { WriteStage } from '@/shared/lib/write-attempt';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import { useWriteAttempt } from '@/shared/model/use-write-attempt';
import type { GovRewardReceipt } from '../lib/gov-reward-receipt';
import { useGovRewardWriteAdapter } from './gov-reward-write-adapter';

/**
 * 治理激励的写链状态机：一笔 `Mint.mintGovReward`（单轮）或 `Mint.mintGovRewards`（批量）。
 *
 * 治理域没有代币授权，所以只有「签名 → 上链 → 回执」一段；显示什么数字由回执里的
 * `GovRewardMinted` 事件决定（`lib/gov-reward-receipt`），不拿列表里的读模型数字冒充
 * 链上结果。
 *
 * 两条合约语义直接写进调用参数：
 * - `recipient` **固定是当前钱包地址**：合约要求 `msg.sender` 持有该身份 NFT
 *   （`Mint.sol:287` 的 `onlyMemberOwner`），界面上没有「收款人」这个概念；
 * - 批量只传调用方给的轮次数组（页面只放「确认可铸」的轮次）：中间任何一轮失败
 *   整笔回滚，所以这里不再二次筛选、也不补轮次。
 *
 * 写链生命周期由 `useWriteAttempt` 纯核持有；`submittingRounds` 与 `receipt` 的投影
 * 仍按提交入参派生（adapter 在 `send` 时记下轮次，回执文案与迁移前一致）。
 */
export interface GovRewardWriteInput {
  readonly mintAddress: HexAddress;
  readonly tokenAddress: HexAddress;
  readonly memberId: bigint;
  /** 要铸的轮次；长度为 1 时走单轮函数，多个走批量函数。 */
  readonly rounds: readonly bigint[];
}

export interface GovRewardWrite {
  readonly stage: WriteStage;
  readonly error: string | null;
  readonly watch: TxWatch;
  /** 回执（由纯核持有，关闭回执等于 `clearReceipt()`）。 */
  readonly receipt: GovRewardReceipt | null;
  /** 正在签 / 在途的轮次；列表据此把对应行标成「铸造中…」。 */
  readonly submittingRounds: readonly bigint[];
  readonly submit: (input: GovRewardWriteInput) => void;
  readonly closeReceipt: () => void;
}

export function useGovRewardWrite(onConfirmed: () => void): GovRewardWrite {
  const { address: account } = useAccount();
  const [submittingRounds, setSubmittingRounds] = useState<readonly bigint[]>([]);
  const adapter = useGovRewardWriteAdapter({
    reverted: copy.gov.rewards.revert,
    onConfirmed,
  });
  const write = useWriteAttempt(adapter);

  const submit = (input: GovRewardWriteInput): void => {
    if (account === undefined) return;
    const [first] = input.rounds;
    if (first === undefined) return;
    setSubmittingRounds(input.rounds);
    // 收款人在提交时定死（而不是签名时再读钱包），与迁移前的调用参数一致。
    void write.run({ ...input, recipient: account });
  };

  return {
    stage: write.stage,
    error: write.error?.message ?? null,
    watch: write.watch,
    receipt: write.receipt,
    submittingRounds,
    submit,
    closeReceipt: write.clearReceipt,
  };
}
