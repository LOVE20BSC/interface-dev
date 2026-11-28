import { useQuery } from '@tanstack/react-query';
import { useConfig } from 'wagmi';
import { getBlockNumber, readContracts } from 'wagmi/actions';
import { voteAbi } from '@/config/abis';
import { NETWORK, configuredAddress, type HexAddress } from '@/config/networks';
import { remainingVotes } from '@/domain/gov-core';

const VOTE_QUOTA_POLL_MS = 15_000;

export interface VoteQuota {
  readonly status: 'unconfigured' | 'loading' | 'error' | 'ready';
  readonly maxVoteAmount: bigint | undefined;
  readonly usedVoteAmount: bigint | undefined;
  readonly remaining: bigint | undefined;
  readonly refetch: () => void;
}

export function useVoteQuota(
  tokenAddress: HexAddress | undefined,
  round: bigint | undefined,
  memberId: bigint | undefined,
): VoteQuota {
  const config = useConfig();
  const voteAddress = configuredAddress('vote');
  const configured =
    voteAddress !== undefined && tokenAddress !== undefined && memberId !== undefined;
  const enabled = configured && round !== undefined;

  const quota = useQuery({
    queryKey: [
      'vote-quota',
      NETWORK.chainId,
      voteAddress,
      tokenAddress,
      round?.toString(),
      memberId?.toString(),
    ],
    enabled,
    staleTime: 0,
    refetchInterval: VOTE_QUOTA_POLL_MS,
    queryFn: async () => {
      if (!enabled) throw new Error('Vote quota requires a token, round and member');
      const chainId = NETWORK.chainId;
      // maxVoteAmount uses the current round. Pin every call to one block even when
      // wagmi falls back to individual calls, then check the round against the page.
      const blockNumber = await getBlockNumber(config, { chainId, cacheTime: 0 });
      const contract = { address: voteAddress, abi: voteAbi, chainId } as const;
      const [currentRound, maxVoteAmount, usedVoteAmount] = await readContracts(config, {
        blockNumber,
        allowFailure: false,
        contracts: [
          { ...contract, functionName: 'currentRound' },
          { ...contract, functionName: 'maxVoteAmount', args: [tokenAddress, memberId] },
          {
            ...contract,
            functionName: 'voteAmountByMemberId',
            args: [tokenAddress, round, memberId],
          },
        ],
      });
      return { currentRound, maxVoteAmount, usedVoteAmount };
    },
  });

  const snapshot = !quota.isError && quota.data?.currentRound === round ? quota.data : undefined;

  return {
    status: !configured ? 'unconfigured' : quota.isError ? 'error' : snapshot ? 'ready' : 'loading',
    maxVoteAmount: snapshot?.maxVoteAmount,
    usedVoteAmount: snapshot?.usedVoteAmount,
    remaining: snapshot && remainingVotes(snapshot.maxVoteAmount, snapshot.usedVoteAmount),
    refetch: () => {
      if (enabled) void quota.refetch();
    },
  };
}
