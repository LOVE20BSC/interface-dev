import { useMemo, useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { useReadContracts } from 'wagmi';
import { submitAbi, voteAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';

/**
 * 「我的投票」读模型：按**轮次倒序**扫描我投过票的提案，用于治理首页的「我的投票」卡
 * （对应旧库 `/vote/records` 的按轮分组明细）。
 *
 * 为什么是扫描：`Vote.votedProposalIdsByMemberId(token, round, memberId, …)` 仍然是
 * `(token, 轮次, 身份)` 三维键，链上没有「我投过哪些轮」的反向索引
 * （[CI-001](../../../../docs/contract-issues/001-no-member-round-index.md)）。所以从
 * `currentPhase`（含当前轮，当轮投票要能立刻看到）往回扫，一页 10 轮，滚到底再往前。
 *
 * 空轮不渲染：扫到没有投票的轮次时只推进页码，不产生空卡（旧库每个轮次都渲染
 * 「该轮次没有投票」，在治理首页上只是噪音）。
 */

export const MY_VOTES_ROUNDS_PER_PAGE = 10;
/** 单轮最多取多少条投票记录；超出的轮次只显示前 50 条（合约分页上限由调用方决定）。 */
const VOTES_PER_ROUND_LIMIT = 50n;

export type MyVotesStatus = 'unconfigured' | 'loading' | 'error' | 'ready';

export interface MyVoteEntry {
  readonly proposalId: bigint;
  readonly title: string;
  /** 我在这个提案上累计投出的票数。 */
  readonly myVotes: bigint;
}

export interface MyVoteRound {
  readonly round: bigint;
  /** 这一轮我投出的票合计。 */
  readonly myTotalVotes: bigint;
  /** 这一轮全社区投出的票合计，用于算「占本轮」。 */
  readonly roundTotalVotes: bigint;
  readonly entries: readonly MyVoteEntry[];
}

export interface MyVotes {
  readonly status: MyVotesStatus;
  readonly rounds: readonly MyVoteRound[];
  /** 已经翻过页、正在读下一页（页面保留上一页内容，不整块闪成骨架）。 */
  readonly isLoadingMore: boolean;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly refetch: () => void;
}

export interface MyVotesOptions {
  readonly memberId: bigint | undefined;
  readonly currentPhase: bigint | undefined;
  readonly pageSize?: number;
}

export function useMyVotes(tokenAddress: HexAddress | undefined, options: MyVotesOptions): MyVotes {
  const voteAddress = configuredAddress('vote');
  const submitAddress = configuredAddress('submit');
  const { memberId, currentPhase, pageSize = MY_VOTES_ROUNDS_PER_PAGE } = options;
  const [pageCount, setPageCount] = useState(1);

  const enabled =
    voteAddress !== undefined &&
    submitAddress !== undefined &&
    tokenAddress !== undefined &&
    memberId !== undefined &&
    currentPhase !== undefined &&
    currentPhase >= 1n;

  const rounds = useMemo(() => {
    if (currentPhase === undefined || currentPhase < 1n) return [] as bigint[];
    const lowest = 1n;
    const depth = BigInt(pageSize) * BigInt(pageCount);
    const first = currentPhase - depth + 1n;
    const start = first > lowest ? first : lowest;
    const list: bigint[] = [];
    for (let round = currentPhase; round >= start; round -= 1n) list.push(round);
    return list;
  }, [currentPhase, pageCount, pageSize]);

  const votes = useReadContracts({
    contracts: enabled
      ? rounds.flatMap((round) => [
          {
            address: voteAddress,
            abi: voteAbi,
            functionName: 'votedProposalIdsByMemberId' as const,
            args: [
              tokenAddress,
              round,
              memberId as bigint,
              0n,
              VOTES_PER_ROUND_LIMIT,
              false,
            ] as const,
          },
          {
            address: voteAddress,
            abi: voteAbi,
            functionName: 'totalVoteAmount' as const,
            args: [tokenAddress, round] as const,
          },
        ])
      : [],
    // 翻页时 key 变了：保留上一页数据，列表不整块闪成骨架。
    query: { enabled, placeholderData: keepPreviousData },
  });

  // 第一段：把每轮的 (提案 id, 我的票数) 拆出来；标题要等第二次 `proposalInfosByProposalIds`。
  const perRound = useMemo(() => {
    const data = votes.data;
    if (data === undefined)
      return [] as {
        round: bigint;
        ids: readonly bigint[];
        amounts: readonly bigint[];
        roundTotalVotes: bigint;
      }[];
    const result: {
      round: bigint;
      ids: readonly bigint[];
      amounts: readonly bigint[];
      roundTotalVotes: bigint;
    }[] = [];
    rounds.forEach((round, index) => {
      const page = data[index * 2]?.result;
      const roundTotal = data[index * 2 + 1]?.result;
      if (page === undefined || typeof roundTotal !== 'bigint') return;
      const [ids, amounts] = page as readonly [readonly bigint[], readonly bigint[], bigint];
      if (ids.length === 0) return;
      result.push({ round, ids, amounts, roundTotalVotes: roundTotal });
    });
    return result;
  }, [rounds, votes.data]);

  const allProposalIds = useMemo(() => {
    const ids = new Set<bigint>();
    for (const item of perRound) for (const id of item.ids) ids.add(id);
    return [...ids];
  }, [perRound]);

  const infos = useReadContracts({
    contracts:
      submitAddress !== undefined && tokenAddress !== undefined && allProposalIds.length > 0
        ? [
            {
              address: submitAddress,
              abi: submitAbi,
              functionName: 'proposalInfosByProposalIds' as const,
              args: [tokenAddress, allProposalIds] as const,
            },
          ]
        : [],
    query: { enabled: allProposalIds.length > 0, placeholderData: keepPreviousData },
  });

  const titleById = useMemo(() => {
    const map = new Map<bigint, string>();
    const infoList = infos.data?.[0]?.result;
    if (infoList === undefined) return map;
    for (const info of infoList) map.set(info.head.id, info.body.title);
    return map;
  }, [infos.data]);

  const roundsWithVotes = useMemo<readonly MyVoteRound[]>(
    () =>
      perRound.map((item) => ({
        round: item.round,
        myTotalVotes: item.amounts.reduce((sum, amount) => sum + amount, 0n),
        roundTotalVotes: item.roundTotalVotes,
        entries: item.ids.map((proposalId, index) => ({
          proposalId,
          // 标题还没读回来时不给占位串：卡片按「条目数已齐」渲染，标题缺就是空串，
          // 由 UI 用「#编号」兜底，不编造数据。
          title: titleById.get(proposalId) ?? '',
          myVotes: item.amounts[index] ?? 0n,
        })),
      })),
    [perRound, titleById],
  );

  const lowestScanned = rounds.length > 0 ? rounds[rounds.length - 1] : undefined;
  const hasMore = lowestScanned !== undefined && lowestScanned > 1n;
  const status: MyVotesStatus =
    voteAddress === undefined || submitAddress === undefined || tokenAddress === undefined
      ? 'unconfigured'
      : memberId === undefined || currentPhase === undefined
        ? 'loading'
        : votes.isError || infos.isError
          ? 'error'
          : votes.isLoading || infos.isLoading
            ? 'loading'
            : 'ready';

  return {
    status,
    rounds: roundsWithVotes,
    isLoadingMore: pageCount > 1 && (votes.isFetching || infos.isFetching),
    hasMore,
    loadMore: () => setPageCount((count) => count + 1),
    refetch: () => {
      votes.refetch();
      infos.refetch();
    },
  };
}
