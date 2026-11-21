import { useReadContract, useReadContracts } from 'wagmi';
import { submitAbi, voteAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';

/**
 * 单个提案的读模型（`/vote/:proposalId` 详情页）。
 *
 * 三件事分开读、分开失败：提案正文（`Submit.proposalInfosByProposalIds`）、本轮该提案
 * 收到的总票数（`Vote.voteAmountByProposalId`）、我在这个提案上已投的票数
 * （`Vote.voteAmountByMemberIdByProposalId`）。任一项读失败都只标 `error`，不拿 0 顶替。
 */
export type ProposalDetailStatus = 'unconfigured' | 'loading' | 'error' | 'not-found' | 'ready';

export interface ProposalDetail {
  readonly proposalId: bigint;
  readonly status: ProposalDetailStatus;
  readonly authorId: bigint | undefined;
  readonly title: string | undefined;
  readonly details: string | undefined;
  readonly target: HexAddress | undefined;
  /** 0 = NoCallback，1 = Callback（`ISubmit.TargetMode`）。 */
  readonly targetMode: number | undefined;
  readonly mine: bigint | undefined;
  readonly total: bigint | undefined;
  readonly refetch: () => void;
}

export function useProposalDetail(
  tokenAddress: HexAddress | undefined,
  round: bigint | undefined,
  memberId: bigint | undefined,
  proposalId: bigint | undefined,
): ProposalDetail {
  const submitAddress = configuredAddress('submit');
  const voteAddress = configuredAddress('vote');
  const infoEnabled =
    submitAddress !== undefined && tokenAddress !== undefined && proposalId !== undefined;

  const info = useReadContract({
    address: submitAddress,
    abi: submitAbi,
    functionName: 'proposalInfosByProposalIds',
    args: infoEnabled ? [tokenAddress as HexAddress, [proposalId as bigint]] : undefined,
    query: { enabled: infoEnabled },
  });

  const roundEnabled =
    voteAddress !== undefined && tokenAddress !== undefined && round !== undefined;
  const totals = useReadContracts({
    contracts: [
      {
        address: voteAddress as HexAddress,
        abi: voteAbi,
        functionName: 'voteAmountByProposalId' as const,
        args: roundEnabled
          ? [tokenAddress as HexAddress, round as bigint, proposalId as bigint]
          : undefined,
      },
      {
        address: voteAddress as HexAddress,
        abi: voteAbi,
        functionName: 'voteAmountByMemberIdByProposalId' as const,
        args:
          roundEnabled && memberId !== undefined
            ? [tokenAddress as HexAddress, round as bigint, memberId, proposalId as bigint]
            : undefined,
      },
    ],
    query: { enabled: roundEnabled && proposalId !== undefined },
  });

  const refetch = () => {
    void info.refetch();
    void totals.refetch();
  };

  if (submitAddress === undefined || voteAddress === undefined || tokenAddress === undefined) {
    return empty(proposalId ?? 0n, 'unconfigured', refetch);
  }
  if (proposalId === undefined) return empty(0n, 'unconfigured', refetch);
  if (info.status === 'error' || totals.status === 'error') {
    return empty(proposalId, 'error', refetch);
  }
  if (info.status === 'pending' || totals.status === 'pending') {
    return empty(proposalId, 'loading', refetch);
  }

  const entry = info.data?.[0];
  if (entry === undefined) return empty(proposalId, 'not-found', refetch);

  const totalResult = totals.data?.[0];
  const mineResult = totals.data?.[1];
  return {
    proposalId,
    status: 'ready',
    authorId: entry.head.author,
    title: entry.body.title,
    details: entry.body.details,
    target: entry.body.target,
    targetMode: Number(entry.body.targetMode),
    mine: mineResult?.status === 'success' ? mineResult.result : undefined,
    total: totalResult?.status === 'success' ? totalResult.result : undefined,
    refetch,
  };
}

function empty(
  proposalId: bigint,
  status: ProposalDetailStatus,
  refetch: () => void,
): ProposalDetail {
  return {
    proposalId,
    status,
    authorId: undefined,
    title: undefined,
    details: undefined,
    target: undefined,
    targetMode: undefined,
    mine: undefined,
    total: undefined,
    refetch,
  };
}
