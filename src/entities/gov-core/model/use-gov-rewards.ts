import { useMemo, useState } from 'react';
import { useReadContracts } from 'wagmi';
import { mintAbi, voteAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';

/**
 * 「铸造治理激励」的逐轮读模型。
 *
 * 为什么是**倒序扫描**而不是链上索引：`Mint.govRewardByMemberId(token, round, memberId)`
 * 是 `(token, round, memberId)` 三维键，链上没有「我参加过哪些轮」的反向索引
 * （[CI-001](../../../../docs/contract-issues/001-no-member-round-index.md)）。所以前端从
 * `currentPhase - 1`（只有**已结束**的轮次能铸）往回扫，一页 20 轮，滚到底再往前。
 *
 * 不承诺「一次铸完」：`Mint.mintGovRewards` 要的是**明确的轮次数组**，其中任何一轮
 * 不满足条件就整笔回滚，所以批量铸造只收「已扫描到、确认可铸」的轮次。
 */

export const GOV_REWARDS_PAGE_SIZE = 20;

export type GovRewardsStatus = 'unconfigured' | 'loading' | 'error' | 'ready';

export interface GovRewardRow {
  readonly round: bigint;
  /** 这一轮预留给治理激励的总额（`Mint.govReward`）。 */
  readonly roundPool: bigint;
  /** 我的投票激励（`Mint.govRewardByMemberId` 第一项）。 */
  readonly voteReward: bigint;
  /** 我的加速激励（同一调用的第二项）。 */
  readonly boostReward: bigint;
  readonly minted: boolean;
  /** 我在这一轮投出去的票数；为 0 说明没参与。 */
  readonly myVoteAmount: bigint;
}

export interface GovRewards {
  readonly status: GovRewardsStatus;
  readonly rows: readonly GovRewardRow[];
  readonly oldestLoadedRound: bigint | undefined;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly refetch: () => void;
}

export interface GovRewardsOptions {
  readonly memberId: bigint | undefined;
  /** 当前阶段；只扫 `< currentPhase` 的轮次（合约 `_checkSettlementRound` 要求轮次已结束）。 */
  readonly currentPhase: bigint | undefined;
  readonly pageSize?: number;
}

export function useGovRewards(
  tokenAddress: HexAddress | undefined,
  options: GovRewardsOptions,
): GovRewards {
  const mintAddress = configuredAddress('mint');
  const voteAddress = configuredAddress('vote');
  const { memberId, currentPhase, pageSize = GOV_REWARDS_PAGE_SIZE } = options;
  const [pageCount, setPageCount] = useState(1);

  const newestRound =
    currentPhase !== undefined && currentPhase > 1n ? currentPhase - 1n : undefined;
  const enabled =
    mintAddress !== undefined &&
    voteAddress !== undefined &&
    tokenAddress !== undefined &&
    memberId !== undefined &&
    newestRound !== undefined;

  const rounds = useMemo(() => {
    if (newestRound === undefined) return [] as bigint[];
    const list: bigint[] = [];
    const lowest = 1n;
    let round = newestRound;
    for (let index = 0; index < pageSize * pageCount; index += 1) {
      list.push(round);
      if (round === lowest) break;
      round -= 1n;
    }
    return list;
  }, [newestRound, pageCount, pageSize]);

  const reads = useReadContracts({
    contracts: enabled
      ? rounds.flatMap((round) => [
          {
            address: mintAddress,
            abi: mintAbi,
            functionName: 'govReward' as const,
            args: [tokenAddress, round] as const,
          },
          {
            address: mintAddress,
            abi: mintAbi,
            functionName: 'govRewardByMemberId' as const,
            args: [tokenAddress, round, memberId as bigint] as const,
          },
          {
            address: voteAddress,
            abi: voteAbi,
            functionName: 'voteAmountByMemberId' as const,
            args: [tokenAddress, round, memberId as bigint] as const,
          },
        ])
      : [],
    query: { enabled },
  });

  const rows = useMemo(() => {
    const data = reads.data;
    if (data === undefined) return [] as GovRewardRow[];
    const result: GovRewardRow[] = [];
    rounds.forEach((round, index) => {
      const pool = data?.[index * 3]?.result;
      const mine = data?.[index * 3 + 1]?.result;
      const myVotes = data?.[index * 3 + 2]?.result;
      if (typeof pool !== 'bigint' || mine === undefined || typeof myVotes !== 'bigint') return;
      const [voteReward, boostReward, minted] = mine as readonly [bigint, bigint, boolean];
      result.push({
        round,
        roundPool: pool,
        voteReward,
        boostReward,
        minted,
        myVoteAmount: myVotes,
      });
    });
    return result;
  }, [reads.data, rounds]);

  const oldestLoadedRound = rows.length > 0 ? rows[rows.length - 1]?.round : undefined;
  const hasMore = oldestLoadedRound !== undefined && oldestLoadedRound > 1n;
  const status: GovRewardsStatus =
    mintAddress === undefined || voteAddress === undefined || tokenAddress === undefined
      ? 'unconfigured'
      : memberId === undefined || newestRound === undefined
        ? 'loading'
        : reads.isError
          ? 'error'
          : reads.isLoading
            ? 'loading'
            : 'ready';

  return {
    status,
    rows,
    oldestLoadedRound,
    hasMore,
    loadMore: () => setPageCount((count) => count + 1),
    refetch: () => reads.refetch(),
  };
}
