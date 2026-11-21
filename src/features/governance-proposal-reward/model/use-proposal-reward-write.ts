import { useEffect, useRef, useState } from 'react';
import type { TransactionReceipt } from 'viem';
import { mintAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { toUserMessage } from '@/shared/lib/errors';
import {
  useContractWrite,
  type ContractCall,
  type ContractWriteStage,
} from '@/shared/model/use-contract-write';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import { parseProposalRewardBurned } from '../lib/proposal-reward-receipt';

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
  readonly stage: ContractWriteStage;
  readonly error: string | null;
  readonly watch: TxWatch;
  readonly receipt: ProposalRewardReceipt | null;
  /** 正在（或最近一次）提交销毁的提案，用来只把那一行显示成「销毁中…」。 */
  readonly activeProposalId: bigint | null;
  readonly submit: (input: ProposalRewardBurnInput) => void;
  readonly resubmit: () => void;
  readonly closeReceipt: () => void;
}

export function useProposalRewardWrite(onConfirmed: () => void): ProposalRewardWrite {
  const write = useContractWrite(
    {
      wallet: copy.gov.proposalRewards.waitingWallet,
      reverted: copy.gov.proposalRewards.revert,
      ownerChanged: copy.gov.tx.ownerChanged,
    },
    toUserMessage,
    onConfirmed,
  );
  const [receipt, setReceipt] = useState<ProposalRewardReceipt | null>(null);
  const [activeProposalId, setActiveProposalId] = useState<bigint | null>(null);
  /** 回执对象只消费一次：同一条回执不能重复弹面板。 */
  const consumedRef = useRef<TransactionReceipt | null>(null);
  /** 最近一次提交的入参；回执里的 token / round 用它过滤事件，避免用户切轮后错配。 */
  const lastInputRef = useRef<ProposalRewardBurnInput | null>(null);

  const receiptData = write.watch.receipt;
  useEffect(() => {
    if (receiptData === null) return;
    if (consumedRef.current === receiptData) return;
    consumedRef.current = receiptData;
    if (receiptData.status !== 'success') return;
    const input = lastInputRef.current;
    if (input === null) return;
    const burned = parseProposalRewardBurned(
      receiptData,
      input.tokenAddress,
      input.round,
      input.proposalId,
    );
    setReceipt(
      burned === null
        ? { proposalId: input.proposalId, amount: null }
        : { proposalId: burned.proposalId, amount: burned.amount },
    );
  }, [receiptData]);

  const submit = (input: ProposalRewardBurnInput): void => {
    const call: ContractCall = {
      address: input.mintAddress,
      abi: mintAbi,
      functionName: 'burnProposalReward',
      args: [input.tokenAddress, input.round, input.proposalId],
    };
    lastInputRef.current = input;
    setActiveProposalId(input.proposalId);
    void write.run(call);
  };

  return {
    stage: write.stage,
    error: write.error,
    watch: write.watch,
    receipt,
    activeProposalId,
    submit,
    resubmit: write.resubmit,
    closeReceipt: () => {
      setReceipt(null);
      setActiveProposalId(null);
      consumedRef.current = null;
      lastInputRef.current = null;
      write.reset();
    },
  };
}
