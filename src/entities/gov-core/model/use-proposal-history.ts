import { useReadContract, useReadContracts } from 'wagmi';
import { submitAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';
import type { RoundProposal } from '@/entities/gov-core/model/use-round-proposals';
import type { SubmitContext } from '@/entities/gov-core/model/use-submit-context';

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
  /** 跳过的提案数。 */
  readonly offset?: number;
  /** 在推举资格的同一区块检查各提案是否已在本轮获推举。 */
  readonly round?: SubmitContext['round'];
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
    args: enabled ? [tokenAddress, BigInt(offset), BigInt(limit), true] : undefined,
    blockNumber: round?.blockNumber,
    query: { enabled },
  });

  const proposalIds = ids.data?.[0] ?? [];
  const infosEnabled = enabled && proposalIds.length > 0;
  const infos = useReadContract({
    address: submitAddress,
    abi: submitAbi,
    functionName: 'proposalInfosByProposalIds',
    args: infosEnabled ? [tokenAddress, proposalIds] : undefined,
    query: { enabled: infosEnabled },
  });

  const submittedEnabled = infosEnabled && round !== undefined;
  const submitted = useReadContracts({
    allowFailure: false,
    blockNumber: round?.blockNumber,
    contracts: submittedEnabled
      ? proposalIds.map((proposalId) => ({
          address: submitAddress,
          abi: submitAbi,
          functionName: 'isSubmitted' as const,
          args: [tokenAddress, round.number, proposalId] as const,
        }))
      : [],
    query: { enabled: submittedEnabled },
  });

  const refetch = () => {
    if (enabled) void ids.refetch();
    if (infosEnabled) void infos.refetch();
    if (submittedEnabled) void submitted.refetch();
  };

  if (!enabled) {
    return { status: 'unconfigured', items: [], total: undefined, refetch };
  }
  if (ids.isError || (infosEnabled && infos.isError) || (submittedEnabled && submitted.isError)) {
    return { status: 'error', items: [], total: ids.data?.[1], refetch };
  }
  if (
    ids.isPending ||
    (infosEnabled && infos.isPending) ||
    (submittedEnabled && submitted.isPending)
  ) {
    return { status: 'loading', items: [], total: undefined, refetch };
  }

  const items = (infos.data ?? []).map((entry, index): HistoryProposal => ({
    proposalId: entry.head.id,
    authorId: entry.head.author,
    title: entry.body.title,
    details: entry.body.details,
    target: entry.body.target,
    targetMode: Number(entry.body.targetMode),
    submittedThisRound: submitted.data?.[index] ?? false,
  }));
  return { status: 'ready', items, total: ids.data?.[1], refetch };
}
