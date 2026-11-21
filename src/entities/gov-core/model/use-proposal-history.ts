import { useReadContract, useReadContracts } from 'wagmi';
import { submitAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';
import type { RoundProposal } from '@/entities/gov-core/model/use-round-proposals';

/**
 * 历史提案读模型（`/submit` 的「推举历史提案」段，owner 2026-11-22）。
 *
 * 合约口径：`Submit.proposalIds(token, offset, limit, reverse)` 给出按创建顺序的提案编号与总数，
 * 再用 `proposalInfosByProposalIds` 批量取正文。**不在前端猜编号，也不扫事件**。
 *
 * 额外读当前轮 `isSubmitted(round, id)`：同一轮一个身份只能推举一个提案，已在本轮的提案
 * 要标出来并禁用按钮（避免点了才被合约拒）。
 */
export type ProposalHistoryStatus = 'unconfigured' | 'loading' | 'error' | 'ready';

export interface HistoryProposal extends RoundProposal {
  /** 这个提案已经在本轮被推举过（任何身份）。 */
  readonly submittedThisRound: boolean;
}

export interface ProposalHistory {
  readonly status: ProposalHistoryStatus;
  readonly items: readonly HistoryProposal[];
  readonly total: bigint | undefined;
  readonly refetch: () => void;
}

export interface ProposalHistoryOptions {
  readonly limit: number;
  /** 已创建提案的总数上限；用于「加载更多」。 */
  readonly offset?: number;
  /** 当前轮次；给了就读 isSubmitted 并标出本轮已推举的提案。 */
  readonly round?: bigint | undefined;
}

export function useProposalHistory(
  tokenAddress: HexAddress | undefined,
  options: ProposalHistoryOptions,
): ProposalHistory {
  const submitAddress = configuredAddress('submit');
  const { limit, offset = 0, round } = options;
  const enabled = submitAddress !== undefined && tokenAddress !== undefined;

  const ids = useReadContract({
    address: submitAddress,
    abi: submitAbi,
    functionName: 'proposalIds',
    args: enabled ? [tokenAddress as HexAddress, BigInt(offset), BigInt(limit), true] : undefined,
    query: { enabled },
  });

  const proposalIds = ids.data?.[0] ?? [];
  const infos = useReadContract({
    address: submitAddress,
    abi: submitAbi,
    functionName: 'proposalInfosByProposalIds',
    args: enabled && proposalIds.length > 0 ? [tokenAddress as HexAddress, proposalIds] : undefined,
    query: { enabled: enabled && proposalIds.length > 0 },
  });

  const submitted = useReadContracts({
    contracts:
      ids.data?.[0]?.map((proposalId) => ({
        address: submitAddress as HexAddress,
        abi: submitAbi,
        functionName: 'isSubmitted' as const,
        args: [tokenAddress as HexAddress, round as bigint, proposalId],
      })) ?? [],
    query: { enabled: enabled && round !== undefined && proposalIds.length > 0 },
  });

  const refetch = () => {
    void ids.refetch();
    void infos.refetch();
    void submitted.refetch();
  };

  if (submitAddress === undefined || tokenAddress === undefined) {
    return { status: 'unconfigured', items: [], total: undefined, refetch };
  }
  if (ids.status === 'error' || infos.status === 'error') {
    return { status: 'error', items: [], total: ids.data?.[1], refetch };
  }
  if (ids.status === 'pending' || (proposalIds.length > 0 && infos.status === 'pending')) {
    return { status: 'loading', items: [], total: undefined, refetch };
  }

  const items = (infos.data ?? []).map((entry, index): HistoryProposal => {
    // 读失败/未就绪时不臆测「已推举」：宁可不标，也不能把别人的轮次状态算到它头上。
    const flag = submitted.data?.[index];
    return {
      proposalId: entry.head.id,
      submitterId: entry.head.author,
      title: entry.body.title,
      details: entry.body.details,
      target: entry.body.target,
      targetMode: Number(entry.body.targetMode),
      submittedThisRound: flag?.status === 'success' ? flag.result : false,
    };
  });
  return { status: 'ready', items, total: ids.data?.[1], refetch };
}
