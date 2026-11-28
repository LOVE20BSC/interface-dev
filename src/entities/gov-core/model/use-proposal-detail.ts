import { useReadContract } from 'wagmi';
import { mintAbi, stakeAbi, submitAbi, voteAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';
import { useProposalVotes } from './use-proposal-votes';

/**
 * 单个提案的读模型（`/vote/:proposalId` 详情页）。
 *
 * 提案正文与本轮推举状态决定能否投票。票数与激励数据可以独立重试。
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
  /** 我在这个提案上已投的票数（`voteAmountByMemberIdByProposalId`）。 */
  readonly mine: bigint | undefined;
  /** 这个提案当轮收到的票数（`voteAmountByProposalId`）。 */
  readonly total: bigint | undefined;
  /** 本轮把该提案推举进来的身份（`submitterIdByProposalId`）。 */
  readonly submitterId: bigint | undefined;
  /** 本轮所有提案合计票数（`totalVoteAmount`）→ 激励阈值与「当轮总投票占比」的分母。 */
  readonly roundTotalVotes: bigint | undefined;
  /** 本轮社区总治理权（`Stake.totalGovPower`）→「总治理权占比」的分母。 */
  readonly roundGovPower: bigint | undefined;
  /** 提案激励门槛比例（`Mint.PROPOSAL_REWARD_MIN_VOTE_RATIO`，1e18 定点）。 */
  readonly minVoteRatio: bigint | undefined;
  readonly votesStatus: 'loading' | 'error' | 'ready';
  readonly refetchVotes: () => void;
  readonly refetch: () => void;
}

export function useProposalDetail(
  tokenAddress: HexAddress | undefined,
  round: bigint | undefined,
  memberId: bigint | undefined,
  proposalId: bigint | undefined,
  refetchIntervalMs: number,
): ProposalDetail {
  const submitAddress = configuredAddress('submit');
  const voteAddress = configuredAddress('vote');
  const stakeAddress = configuredAddress('stake');
  const mintAddress = configuredAddress('mint');
  const infoEnabled =
    submitAddress !== undefined && tokenAddress !== undefined && proposalId !== undefined;

  const info = useReadContract({
    address: submitAddress,
    abi: submitAbi,
    functionName: 'proposalInfosByProposalIds',
    args: infoEnabled ? [tokenAddress, [proposalId]] : undefined,
    query: { enabled: infoEnabled },
  });

  const roundEnabled =
    voteAddress !== undefined && tokenAddress !== undefined && round !== undefined;
  const govPowerEnabled =
    stakeAddress !== undefined && tokenAddress !== undefined && round !== undefined;
  const votes = useProposalVotes(
    tokenAddress,
    round,
    memberId,
    proposalId === undefined ? [] : [proposalId],
  );

  // 本轮推举人（`Submit.submitterIdByProposalId`）。
  const submitterEnabled =
    submitAddress !== undefined &&
    tokenAddress !== undefined &&
    round !== undefined &&
    proposalId !== undefined;
  const submitter = useReadContract({
    address: submitAddress,
    abi: submitAbi,
    functionName: 'submitterIdByProposalId',
    args: submitterEnabled ? [tokenAddress, round, proposalId] : undefined,
    query: {
      enabled: submitterEnabled,
      // A proposal can enter the round after this page first checks it.
      refetchInterval: (query) => (query.state.data === 0n ? refetchIntervalMs : false),
    },
  });

  // 本轮总票数 / 本轮社区总治理权：两个「占比」的分母。
  const roundVotes = useReadContract({
    address: voteAddress,
    abi: voteAbi,
    functionName: 'totalVoteAmount',
    args: roundEnabled ? [tokenAddress, round] : undefined,
    query: { enabled: roundEnabled },
  });
  const roundGovPower = useReadContract({
    address: stakeAddress,
    abi: stakeAbi,
    functionName: 'totalGovPower',
    args: govPowerEnabled ? [tokenAddress, round] : undefined,
    query: { enabled: govPowerEnabled },
  });

  // 激励门槛比例（Mint 常量，不随轮次变）。
  const minVoteRatio = useReadContract({
    address: mintAddress,
    abi: mintAbi,
    functionName: 'PROPOSAL_REWARD_MIN_VOTE_RATIO',
    query: { enabled: mintAddress !== undefined },
  });

  const refetchVotes = () => {
    votes.refetch();
    if (roundEnabled) void roundVotes.refetch();
    if (govPowerEnabled) void roundGovPower.refetch();
    if (mintAddress !== undefined) void minVoteRatio.refetch();
  };

  const refetch = () => {
    if (infoEnabled) void info.refetch();
    if (submitterEnabled) void submitter.refetch();
    refetchVotes();
  };

  if (submitAddress === undefined || voteAddress === undefined || tokenAddress === undefined) {
    return empty(proposalId ?? 0n, 'unconfigured', refetch);
  }
  if (proposalId === undefined) return empty(0n, 'unconfigured', refetch);
  if (info.isError || (submitterEnabled && submitter.isError)) {
    return empty(proposalId, 'error', refetch);
  }
  if (info.isPending || !submitterEnabled || submitter.isPending) {
    return empty(proposalId, 'loading', refetch);
  }

  const entry = info.data?.[0];
  if (entry === undefined) return empty(proposalId, 'not-found', refetch);

  const proposalVotes = votes.byId.get(proposalId);
  const votesFailed =
    votes.status === 'error' ||
    (roundEnabled && roundVotes.isError) ||
    (govPowerEnabled && roundGovPower.isError) ||
    (mintAddress !== undefined && minVoteRatio.isError);
  const votesLoading =
    votes.status === 'loading' ||
    (roundEnabled && roundVotes.isPending) ||
    (govPowerEnabled && roundGovPower.isPending) ||
    (mintAddress !== undefined && minVoteRatio.isPending);
  return {
    proposalId,
    status: 'ready',
    authorId: entry.head.author,
    title: entry.body.title,
    details: entry.body.details,
    target: entry.body.target,
    targetMode: Number(entry.body.targetMode),
    mine: proposalVotes?.mine,
    total: proposalVotes?.total,
    submitterId: submitter.data,
    roundTotalVotes: roundVotes.isError ? undefined : roundVotes.data,
    roundGovPower: roundGovPower.isError ? undefined : roundGovPower.data,
    minVoteRatio: minVoteRatio.isError ? undefined : minVoteRatio.data,
    votesStatus: votesFailed ? 'error' : votesLoading ? 'loading' : 'ready',
    refetchVotes,
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
    submitterId: undefined,
    roundTotalVotes: undefined,
    roundGovPower: undefined,
    minVoteRatio: undefined,
    votesStatus: 'loading',
    refetchVotes: refetch,
    refetch,
  };
}
