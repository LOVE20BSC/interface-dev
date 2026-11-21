import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { voteAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';
import { remainingVotes } from '@/domain/gov-core';

/**
 * 本轮投票额度与逐提案票数。
 *
 * 合约口径（`Vote.sol`）：
 * - `maxVoteAmount(token, memberId)` 内部用**当前轮**读 `Stake.govVotes`（`Vote.sol:117-119`），
 *   所以它天然是本轮可投的票数上限；
 * - 一次投票可以投多个提案，累计 `voteAmountByMemberId` 不得超过上限（`Vote.sol:282-286`）；
 * - 同一个提案可以分多次加票（`_voteAmountByMemberIdByProposalId` 是累加，`Vote.sol:291`）。
 *
 * 页面只消费这里的派生值：`remaining = max - used`（`domain/gov-core#remainingVotes`），
 * 不在组件里做减法。
 */

export type VotePowerStatus = 'unconfigured' | 'loading' | 'error' | 'ready';

export interface ProposalVotes {
  /** 我在这个提案上已投的票数。 */
  readonly mine: bigint;
  /** 本轮这个提案收到的总票数（全社区）。 */
  readonly total: bigint;
}

export interface VotePower {
  readonly status: VotePowerStatus;
  readonly maxVoteAmount: bigint | undefined;
  readonly usedVoteAmount: bigint | undefined;
  readonly remaining: bigint | undefined;
  readonly totalVoteAmount: bigint | undefined;
  readonly perProposal: ReadonlyMap<bigint, ProposalVotes>;
  readonly refetch: () => void;
}

export function useVotePower(
  tokenAddress: HexAddress | undefined,
  round: bigint | undefined,
  memberId: bigint | undefined,
  proposalIds: readonly bigint[],
): VotePower {
  const voteAddress = configuredAddress('vote');
  const baseEnabled =
    voteAddress !== undefined && tokenAddress !== undefined && memberId !== undefined;

  const maxVote = useReadContract({
    address: voteAddress,
    abi: voteAbi,
    functionName: 'maxVoteAmount',
    args: baseEnabled ? [tokenAddress, memberId] : undefined,
    query: { enabled: baseEnabled },
  });

  const roundEnabled = baseEnabled && round !== undefined;
  const used = useReadContract({
    address: voteAddress,
    abi: voteAbi,
    functionName: 'voteAmountByMemberId',
    args: roundEnabled ? [tokenAddress, round, memberId] : undefined,
    query: { enabled: roundEnabled },
  });
  const total = useReadContract({
    address: voteAddress,
    abi: voteAbi,
    functionName: 'totalVoteAmount',
    args: roundEnabled ? [tokenAddress, round] : undefined,
    query: { enabled: roundEnabled },
  });

  const perProposal = useReadContracts({
    contracts:
      roundEnabled && proposalIds.length > 0
        ? proposalIds.flatMap((proposalId) => [
            {
              address: voteAddress,
              abi: voteAbi,
              functionName: 'voteAmountByMemberIdByProposalId' as const,
              args: [tokenAddress, round as bigint, memberId as bigint, proposalId] as const,
            },
            {
              address: voteAddress,
              abi: voteAbi,
              functionName: 'voteAmountByProposalId' as const,
              args: [tokenAddress, round as bigint, proposalId] as const,
            },
          ])
        : [],
    query: { enabled: roundEnabled && proposalIds.length > 0 },
  });

  const map = useMemo(() => {
    const result = new Map<bigint, ProposalVotes>();
    if (perProposal.data === undefined) return result;
    proposalIds.forEach((proposalId, index) => {
      const mine = perProposal.data?.[index * 2]?.result;
      const proposalTotal = perProposal.data?.[index * 2 + 1]?.result;
      if (typeof mine !== 'bigint' || typeof proposalTotal !== 'bigint') return;
      result.set(proposalId, { mine, total: proposalTotal });
    });
    return result;
  }, [perProposal.data, proposalIds]);

  const isError = maxVote.isError || used.isError || total.isError || perProposal.isError;
  const isLoading = maxVote.isLoading || used.isLoading || total.isLoading || perProposal.isLoading;
  const status: VotePowerStatus =
    voteAddress === undefined || tokenAddress === undefined || memberId === undefined
      ? 'unconfigured'
      : isError
        ? 'error'
        : isLoading
          ? 'loading'
          : 'ready';

  const maxVoteAmount = typeof maxVote.data === 'bigint' ? maxVote.data : undefined;
  const usedVoteAmount = typeof used.data === 'bigint' ? used.data : undefined;

  return {
    status,
    maxVoteAmount,
    usedVoteAmount,
    remaining:
      maxVoteAmount !== undefined && usedVoteAmount !== undefined
        ? remainingVotes(maxVoteAmount, usedVoteAmount)
        : undefined,
    totalVoteAmount: typeof total.data === 'bigint' ? total.data : undefined,
    perProposal: map,
    refetch: () => {
      maxVote.refetch();
      if (roundEnabled) {
        used.refetch();
        total.refetch();
        perProposal.refetch();
      }
    },
  };
}
