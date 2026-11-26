import { useRef } from 'react';
import { useWriteContract } from 'wagmi';
import { mintAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import type { WriteAttemptAdapter } from '@/shared/model/use-write-attempt';
import { parseGovRewardReceipt, type GovRewardReceipt } from '../lib/gov-reward-receipt';
import type { GovRewardWriteInput } from './use-gov-reward-write';

/**
 * 治理激励铸造的写链 adapter（`Mint.mintGovReward` / `mintGovRewards`）：
 * `persist:'none'`、`approve:'none'`。
 *
 * 两条合约语义原样保留：
 * - `recipient` 固定是**提交时的当前钱包**（`Mint.sol:287` 的 `onlyMemberOwner`），
 *   所以在 `submit` 时就把地址写进 intent，而不是等到签名时再读一次钱包；
 * - 轮次只传调用方给的数组：长度为 1 走单轮函数，多个走批量函数，这里不二次筛选。
 *
 * `parseReceipt` 用 `send` 记下的 intent（提交时的轮次）做回执文案，与迁移前用
 * `submittingRounds` 派生回执等价；core 的 `parseReceipt` 端口不带 intent，所以留一个 ref。
 */
export interface GovRewardWriteIntent extends GovRewardWriteInput {
  /** 收款人 = 提交时的当前钱包（合约要求 `msg.sender` 持有该身份 NFT）。 */
  readonly recipient: HexAddress;
}

export interface GovRewardWriteAdapterOptions {
  /** 上链失败 / 回滚时的中文提示（沿用面板 copy，不新增文案）。 */
  readonly reverted: string;
  readonly onConfirmed: () => void;
}

export function useGovRewardWriteAdapter(
  options: GovRewardWriteAdapterOptions,
): WriteAttemptAdapter<GovRewardWriteIntent, GovRewardReceipt, void> {
  const { writeContractAsync } = useWriteContract();
  const intentRef = useRef<GovRewardWriteIntent | null>(null);
  return {
    persist: 'none',
    reverted: options.reverted,
    send: async (_step, intent, nonce) => {
      intentRef.current = intent;
      const [first] = intent.rounds;
      // 空轮次在投影 hook 的 submit 里已经挡住；这里再挡一次，顺带收窄类型。
      if (first === undefined) throw new Error('gov-reward: empty rounds');
      return intent.rounds.length === 1
        ? writeContractAsync({
            address: intent.mintAddress,
            abi: mintAbi,
            functionName: 'mintGovReward',
            args: [intent.tokenAddress, first, intent.memberId, intent.recipient],
            ...(nonce !== undefined ? { nonce } : {}),
          })
        : writeContractAsync({
            address: intent.mintAddress,
            abi: mintAbi,
            functionName: 'mintGovRewards',
            args: [intent.tokenAddress, intent.rounds, intent.memberId, intent.recipient],
            ...(nonce !== undefined ? { nonce } : {}),
          });
    },
    parseReceipt: (_step, receipt) => {
      const intent = intentRef.current;
      if (intent === null) return null;
      return parseGovRewardReceipt(receipt, intent.rounds);
    },
    onConfirmed: options.onConfirmed,
  };
}
