import { useState } from 'react';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import type { WriteStage } from '@/shared/lib/write-attempt';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import { useWriteAttempt } from '@/shared/model/use-write-attempt';
import { useProposalRewardWriteAdapter } from './proposal-reward-write-adapter';

/**
 * 提案激励销毁的写链状态机：一笔 `Mint.burnProposalReward(token, round, proposalId)`。
 *
 * 合约口径（`Mint.sol:152-191`）：
 * - 只有**已结束**轮次能结算（`_checkSettlementRound`，`round >= currentPhase` 直接 revert）；
 * - 票数为 0、票数到门槛、已经销毁过 → **静默返回**（这笔交易会成功但不产生事件）；
 * - 真正销毁时发 `ProposalRewardBurned`，带本次金额。
 *
 * 所以回执里的数字只从事件取（`lib/proposal-reward-receipt`），拿不到就只显示标题；
 * 页面上的「销毁中…」只按 `activeProposalId` 标在正在提交的那一行。
 *
 * 达标提案的激励只能由提案目标合约铸造（`mintProposalReward` 的 `onlyProposalTarget`），
 * core 覆盖范围内这一页**不给铸造按钮**，只有这一笔写操作。
 *
 * 写链生命周期由 `useWriteAttempt` 纯核持有；这里只投影 `activeProposalId` 与面需要的字段。
 */
export interface ProposalRewardBurnInput {
  readonly mintAddress: HexAddress;
  readonly tokenAddress: HexAddress;
  readonly round: bigint;
  readonly proposalId: bigint;
}

export interface ProposalRewardReceipt {
  readonly proposalId: bigint;
  /** 回执里 `ProposalRewardBurned.amount`；解析不到时为 null（页面不编数字）。 */
  readonly amount: bigint | null;
}

export interface ProposalRewardWrite {
  readonly stage: WriteStage;
  readonly error: string | null;
  readonly watch: TxWatch;
  readonly receipt: ProposalRewardReceipt | null;
  /** 正在（或最近一次）提交销毁的提案，用来只把那一行显示成「销毁中…」。 */
  readonly activeProposalId: bigint | null;
  readonly submit: (input: ProposalRewardBurnInput) => void;
  readonly closeReceipt: () => void;
}

export function useProposalRewardWrite(onConfirmed: () => void): ProposalRewardWrite {
  const [activeProposalId, setActiveProposalId] = useState<bigint | null>(null);
  const adapter = useProposalRewardWriteAdapter({
    reverted: copy.gov.proposalRewards.revert,
    onConfirmed,
  });
  const write = useWriteAttempt(adapter);

  const submit = (input: ProposalRewardBurnInput): void => {
    setActiveProposalId(input.proposalId);
    void write.run(input);
  };

  return {
    stage: write.stage,
    error: write.error?.message ?? null,
    watch: write.watch,
    receipt: write.receipt,
    activeProposalId,
    submit,
    closeReceipt: () => {
      setActiveProposalId(null);
      write.clearReceipt();
    },
  };
}
