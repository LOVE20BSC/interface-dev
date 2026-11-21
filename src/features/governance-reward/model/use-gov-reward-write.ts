import { useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
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
import { parseGovRewardReceipt, type GovRewardReceipt } from '../lib/gov-reward-receipt';

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
 */
export interface GovRewardWriteInput {
  readonly mintAddress: HexAddress;
  readonly tokenAddress: HexAddress;
  readonly memberId: bigint;
  /** 要铸的轮次；长度为 1 时走单轮函数，多个走批量函数。 */
  readonly rounds: readonly bigint[];
}

export interface GovRewardWrite {
  readonly stage: ContractWriteStage;
  readonly error: string | null;
  readonly watch: TxWatch;
  /** 回执（由 `watch.receipt` 现算，关闭回执等于 `reset()`）。 */
  readonly receipt: GovRewardReceipt | null;
  /** 正在签 / 在途的轮次；列表据此把对应行标成「铸造中…」。 */
  readonly submittingRounds: readonly bigint[];
  readonly submit: (input: GovRewardWriteInput) => void;
  readonly resubmit: () => void;
  readonly closeReceipt: () => void;
}

export function useGovRewardWrite(onConfirmed: () => void): GovRewardWrite {
  const { address: account } = useAccount();
  const write = useContractWrite(
    {
      wallet: copy.gov.rewards.waitingWallet,
      reverted: copy.gov.rewards.revert,
      ownerChanged: copy.gov.tx.ownerChanged,
    },
    toUserMessage,
    onConfirmed,
  );
  const [submittingRounds, setSubmittingRounds] = useState<readonly bigint[]>([]);

  const receiptData = write.watch.receipt;
  // 回执是 watch 的派生值：不回填 state，关闭回执就是 `write.reset()`（哈希清空后
  // watch 的 receipt 自然变 null）。这样也不会在 effect 里 setState。
  const receipt = useMemo(
    () =>
      receiptData !== null && receiptData.status === 'success'
        ? parseGovRewardReceipt(receiptData, submittingRounds)
        : null,
    [receiptData, submittingRounds],
  );

  const submit = (input: GovRewardWriteInput): void => {
    if (account === undefined) return;
    const [first] = input.rounds;
    if (first === undefined) return;
    setSubmittingRounds(input.rounds);
    const call: ContractCall =
      input.rounds.length === 1
        ? {
            address: input.mintAddress,
            abi: mintAbi,
            functionName: 'mintGovReward',
            args: [input.tokenAddress, first, input.memberId, account],
          }
        : {
            address: input.mintAddress,
            abi: mintAbi,
            functionName: 'mintGovRewards',
            args: [input.tokenAddress, input.rounds, input.memberId, account],
          };
    void write.run(call);
  };

  return {
    stage: write.stage,
    error: write.error,
    watch: write.watch,
    receipt,
    submittingRounds,
    submit,
    resubmit: write.resubmit,
    closeReceipt: () => {
      // 不在这里清 `submittingRounds`：回执是 `watch.receipt` 的派生值，等 watch
      // 自己把哈希清掉（下一帧）后回执自然消失，避免中间一帧出现空轮次文案。
      write.reset();
    },
  };
}
