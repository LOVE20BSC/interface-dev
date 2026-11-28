import { useReadContracts } from 'wagmi';
import { voteAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';

export interface ProposalVotes {
  readonly mine: bigint | undefined;
  readonly total: bigint | undefined;
}

export interface ProposalVotesRead {
  readonly status: 'unavailable' | 'loading' | 'error' | 'ready';
  readonly byId: ReadonlyMap<bigint, ProposalVotes>;
  readonly refetch: () => void;
}

export function useProposalVotes(
  tokenAddress: HexAddress | undefined,
  round: bigint | undefined,
  memberId: bigint | undefined,
  proposalIds: readonly bigint[],
): ProposalVotesRead {
  const address = configuredAddress('vote');
  const enabled =
    address !== undefined &&
    tokenAddress !== undefined &&
    round !== undefined &&
    memberId !== undefined &&
    proposalIds.length > 0;
  const batch = useReadContracts({
    contracts: enabled
      ? proposalIds.flatMap((proposalId) => [
          {
            address,
            abi: voteAbi,
            functionName: 'voteAmountByMemberIdByProposalId' as const,
            args: [tokenAddress, round, memberId, proposalId] as const,
          },
          {
            address,
            abi: voteAbi,
            functionName: 'voteAmountByProposalId' as const,
            args: [tokenAddress, round, proposalId] as const,
          },
        ])
      : [],
    // Voting happens on the detail page. Refresh cached list counts on return.
    query: { enabled, staleTime: 0 },
  });

  const byId = new Map<bigint, ProposalVotes>();
  if (enabled && !batch.isError && batch.data !== undefined) {
    proposalIds.forEach((proposalId, index) => {
      byId.set(proposalId, {
        mine: batch.data?.[index * 2]?.result,
        total: batch.data?.[index * 2 + 1]?.result,
      });
    });
  }
  const failed = batch.isError || batch.data?.some((result) => result.status === 'failure');
  return {
    status: !enabled ? 'unavailable' : failed ? 'error' : batch.isPending ? 'loading' : 'ready',
    byId,
    refetch: () => {
      if (enabled) void batch.refetch();
    },
  };
}
