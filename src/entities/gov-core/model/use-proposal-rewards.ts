import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { mintAbi, voteAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';
import { isProposalRewardEligible, minProposalVoteAmount } from '@/domain/gov-core';

/**
 * 一轮的**提案激励**结算读模型。
 *
 * 合约口径（`Mint.sol`）：
 * - 奖励池 `proposalReward(round)` 在**本轮第一次投票**时由 `Vote` 触发预留
 *   （`Vote.sol:304-307` → `Mint.reserveRoundReward`），没人投票的轮次池子为 0；
 * - 单个提案的激励 = `floor(pool * 提案票数 / 本轮总票数)`（`Mint.sol:311-318`）；
 * - 门槛 = `ceil(本轮总票数 * PROPOSAL_REWARD_MIN_VOTE_RATIO)`（`Mint.sol:416-419`），
 *   票数不到门槛的提案**铸不出来**，只能被任何人**销毁**（`burnProposalReward`，
 *   `Mint.sol:152-191`）；
 * - 到这里为止，**只有提案的目标合约**能铸（`mintProposalReward` 的 `onlyProposalTarget`，
 *   `Mint.sol:207-217`）——所以在 core 覆盖范围内，这一页只做「看结算状态 + 清理不达标」。
 */

export type ProposalRewardsStatus = 'unconfigured' | 'loading' | 'error' | 'ready';

export interface ProposalRewardRow {
  readonly proposalId: bigint;
  /** 本轮该提案收到的票数。 */
  readonly voteAmount: bigint;
  /** 本轮过门槛所需的最小票数。 */
  readonly minVoteAmount: bigint;
  /** 结算金额（`Mint.proposalRewardSettlement` 的 amount；不达标且未销毁时为 0）。 */
  readonly amount: bigint;
  /** 0 = 未结算，1 = 已铸造，2 = 已销毁（`IMint.ProposalRewardStatus`）。 */
  readonly settlement: number;
  readonly eligible: boolean;
}

export interface ProposalRewards {
  readonly status: ProposalRewardsStatus;
  readonly roundPool: bigint | undefined;
  readonly totalVoteAmount: bigint | undefined;
  readonly minVoteRatio: bigint | undefined;
  readonly rows: readonly ProposalRewardRow[];
  readonly refetch: () => void;
}

export function useProposalRewards(
  tokenAddress: HexAddress | undefined,
  round: bigint | undefined,
  proposalIds: readonly bigint[],
): ProposalRewards {
  const mintAddress = configuredAddress('mint');
  const voteAddress = configuredAddress('vote');
  const enabled =
    mintAddress !== undefined && voteAddress !== undefined && tokenAddress !== undefined;

  const pool = useReadContract({
    address: mintAddress,
    abi: mintAbi,
    functionName: 'proposalReward',
    args: enabled && round !== undefined ? [tokenAddress, round] : undefined,
    query: { enabled: enabled && round !== undefined },
  });
  const totalVotes = useReadContract({
    address: voteAddress,
    abi: voteAbi,
    functionName: 'totalVoteAmount',
    args: enabled && round !== undefined ? [tokenAddress, round] : undefined,
    query: { enabled: enabled && round !== undefined },
  });
  const minRatio = useReadContract({
    address: mintAddress,
    abi: mintAbi,
    functionName: 'PROPOSAL_REWARD_MIN_VOTE_RATIO',
    query: { enabled },
  });

  const perProposal = useReadContracts({
    contracts:
      enabled && round !== undefined
        ? proposalIds.flatMap((proposalId) => [
            {
              address: mintAddress,
              abi: mintAbi,
              functionName: 'proposalRewardSettlement' as const,
              args: [tokenAddress, round, proposalId] as const,
            },
            {
              address: voteAddress,
              abi: voteAbi,
              functionName: 'voteAmountByProposalId' as const,
              args: [tokenAddress, round, proposalId] as const,
            },
          ])
        : [],
    query: { enabled: enabled && round !== undefined && proposalIds.length > 0 },
  });

  const roundPool = typeof pool.data === 'bigint' ? pool.data : undefined;
  const totalVoteAmount = typeof totalVotes.data === 'bigint' ? totalVotes.data : undefined;
  const minVoteRatio = typeof minRatio.data === 'bigint' ? minRatio.data : undefined;

  const rows = useMemo(() => {
    const data = perProposal.data;
    if (data === undefined || totalVoteAmount === undefined || minVoteRatio === undefined) {
      return [] as ProposalRewardRow[];
    }
    const minVoteAmount = minProposalVoteAmount(totalVoteAmount, minVoteRatio);
    const result: ProposalRewardRow[] = [];
    proposalIds.forEach((proposalId, index) => {
      const settlement = data[index * 2]?.result;
      const voteAmount = data[index * 2 + 1]?.result;
      if (settlement === undefined || typeof voteAmount !== 'bigint') return;
      const [amount, status] = settlement as readonly [bigint, number];
      result.push({
        proposalId,
        voteAmount,
        minVoteAmount,
        amount,
        settlement: Number(status),
        eligible: isProposalRewardEligible(voteAmount, minVoteAmount),
      });
    });
    return result;
  }, [perProposal.data, proposalIds, totalVoteAmount, minVoteRatio]);

  const isError = pool.isError || totalVotes.isError || minRatio.isError || perProposal.isError;
  const isLoading =
    pool.isLoading || totalVotes.isLoading || minRatio.isLoading || perProposal.isLoading;
  const status: ProposalRewardsStatus =
    mintAddress === undefined || voteAddress === undefined || tokenAddress === undefined
      ? 'unconfigured'
      : isError
        ? 'error'
        : isLoading
          ? 'loading'
          : 'ready';

  return {
    status,
    roundPool,
    totalVoteAmount,
    minVoteRatio,
    rows,
    refetch: () => {
      pool.refetch();
      totalVotes.refetch();
      minRatio.refetch();
      perProposal.refetch();
    },
  };
}
