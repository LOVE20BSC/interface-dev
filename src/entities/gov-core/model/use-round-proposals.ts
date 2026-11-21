import { useReadContract } from 'wagmi';
import { submitAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';

/**
 * 一轮里**已被推举**的提案（`Submit.submitInfos`），再批量补上正文
 * （`Submit.proposalInfosByProposalIds`）。
 *
 * 为什么要两次读：`submitInfos` 只返回 `{submitterId, proposalId}`，标题/详情/目标要去
 * `ProposalInfo` 里拿；链上没有「按轮拿到提案正文」的合并 view，只能分两步。
 *
 * 语义提醒（与合约一致，页面不要自行假设）：
 * - 列表是**推举顺序**（`Submit._recordSubmission` 的 push 顺序），合约不排序；
 * - `totalCount` 是这一轮的推举总数，分页按 `offset/limit`；
 * - 提案属于哪个目标（`target`）只有正文里才有，所以投票页要等第二步读完才能判断
 *   该提案是「无回调」（可以直接投）还是「回调」（应在目标页投票）。
 */

export const ROUND_PROPOSALS_PAGE_SIZE = 20;

export type RoundProposalsStatus = 'unconfigured' | 'loading' | 'error' | 'ready';

export interface RoundProposal {
  readonly proposalId: bigint;
  readonly submitterId: bigint;
  readonly title: string;
  readonly details: string;
  readonly target: HexAddress;
  /** 0 = NoCallback，1 = Callback（`ISubmit.TargetMode`）。 */
  readonly targetMode: number;
}

export interface RoundProposals {
  readonly status: RoundProposalsStatus;
  readonly items: readonly RoundProposal[];
  readonly total: bigint | undefined;
  readonly refetch: () => void;
}

export interface RoundProposalsOptions {
  /** 轮次 / 阶段号；未就绪时传 undefined，hook 不发请求。 */
  readonly round: bigint | undefined;
  readonly limit?: number;
  readonly offset?: number;
}

export function useRoundProposals(
  tokenAddress: HexAddress | undefined,
  options: RoundProposalsOptions,
): RoundProposals {
  const submitAddress = configuredAddress('submit');
  const { round, limit = ROUND_PROPOSALS_PAGE_SIZE, offset = 0 } = options;
  const enabled = submitAddress !== undefined && tokenAddress !== undefined && round !== undefined;

  const submits = useReadContract({
    address: submitAddress,
    abi: submitAbi,
    functionName: 'submitInfos',
    args:
      tokenAddress !== undefined && round !== undefined
        ? [tokenAddress, round, BigInt(offset), BigInt(limit), false]
        : undefined,
    query: { enabled },
  });

  const submitInfoList = submits.data?.[0];
  const total = submits.data?.[1];
  const proposalIds = submitInfoList?.map((info) => info.proposalId) ?? [];
  const idsReady = proposalIds.length > 0;

  const infos = useReadContract({
    address: submitAddress,
    abi: submitAbi,
    functionName: 'proposalInfosByProposalIds',
    args: tokenAddress !== undefined && idsReady ? [tokenAddress, proposalIds] : undefined,
    query: { enabled: idsReady },
  });

  const items: RoundProposal[] = [];
  if (submitInfoList !== undefined && infos.data !== undefined) {
    const byId = new Map<bigint, (typeof infos.data)[number]>();
    for (const info of infos.data) byId.set(info.head.id, info);
    for (const submitted of submitInfoList) {
      const info = byId.get(submitted.proposalId);
      // 正文还没回来时不编造占位行：列表等第二步读齐再渲染，避免闪一行空标题。
      if (info === undefined) continue;
      items.push({
        proposalId: submitted.proposalId,
        submitterId: submitted.submitterId,
        title: info.body.title,
        details: info.body.details,
        target: info.body.target,
        targetMode: Number(info.body.targetMode),
      });
    }
  }

  const status: RoundProposalsStatus =
    submitAddress === undefined || tokenAddress === undefined
      ? 'unconfigured'
      : submits.isError || infos.isError
        ? 'error'
        : submits.isLoading || (idsReady && infos.isLoading)
          ? 'loading'
          : 'ready';

  return {
    status,
    items,
    total,
    refetch: () => {
      if (!enabled) return;
      submits.refetch();
      if (idsReady) infos.refetch();
    },
  };
}
