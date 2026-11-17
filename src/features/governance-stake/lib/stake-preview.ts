import { liquiditySharesAdded, optimalAmounts, projectedGovVotesAdded } from '@/domain/gov-stake';
import { estimateLpMinted } from './stake-form';

/**
 * 「这一笔质押大概能得到多少治理权」的纯计算。
 *
 * 输入全部来自链上 view（pool 储备与 LP 总供应、社区质押总量、成员当前份额与
 * 治理权）与用户输入；输出只用于「预计」提示——页面同时写「成交后以回执为准」。
 * 任何一项读不到都返回 `unavailable`：不显示数字，而不是显示 0。
 */
export interface StakePreviewInput {
  readonly tokenAmount: bigint | undefined;
  readonly parentTokenAmount: bigint | undefined;
  readonly promisedWaitingPhases: bigint | undefined;
  readonly reserveToken: bigint | undefined;
  readonly reserveParent: bigint | undefined;
  readonly lpTotalSupply: bigint | undefined;
  readonly totalLiquidityShares: bigint | undefined;
  readonly withdrawableLp: bigint | undefined;
  readonly currentLiquidityShares: bigint | undefined;
  readonly currentGovVotes: bigint | undefined;
}

export interface StakePreview {
  readonly status: 'idle' | 'ready' | 'unavailable';
  /** 按池子比例实际会存入的两侧（合约 `_optimalAmounts` 的口径）。 */
  readonly optimalTokenAmount: bigint | undefined;
  readonly optimalParentAmount: bigint | undefined;
  /** 本次预计新增的治理权。 */
  readonly votesAdded: bigint | undefined;
}

const IDLE: StakePreview = {
  status: 'idle',
  optimalTokenAmount: undefined,
  optimalParentAmount: undefined,
  votesAdded: undefined,
};

const UNAVAILABLE: StakePreview = {
  status: 'unavailable',
  optimalTokenAmount: undefined,
  optimalParentAmount: undefined,
  votesAdded: undefined,
};

export function computeStakePreview(input: StakePreviewInput): StakePreview {
  const {
    tokenAmount,
    parentTokenAmount,
    promisedWaitingPhases,
    reserveToken,
    reserveParent,
    lpTotalSupply,
    totalLiquidityShares,
    withdrawableLp,
    currentLiquidityShares,
    currentGovVotes,
  } = input;

  if (tokenAmount === undefined || parentTokenAmount === undefined) return IDLE;
  if (tokenAmount <= 0n || parentTokenAmount <= 0n) return IDLE;

  if (
    reserveToken === undefined ||
    reserveParent === undefined ||
    lpTotalSupply === undefined ||
    totalLiquidityShares === undefined ||
    withdrawableLp === undefined ||
    currentLiquidityShares === undefined ||
    currentGovVotes === undefined ||
    promisedWaitingPhases === undefined
  ) {
    return UNAVAILABLE;
  }

  const optimal = optimalAmounts({
    tokenAmount,
    parentTokenAmount,
    reserveToken,
    reserveParent,
  });

  const lpMinted = estimateLpMinted({
    tokenAmount,
    parentTokenAmount,
    reserveToken,
    reserveParent,
    lpTotalSupply,
  });
  if (lpMinted === null) return UNAVAILABLE;

  const sharesAdded = liquiditySharesAdded({
    totalLiquidityShares,
    withdrawableLp,
    lpMinted,
  });
  const votesAdded = projectedGovVotesAdded({
    currentLiquidityShares,
    currentGovVotes,
    sharesAdded,
    promisedWaitingPhases,
  });

  return {
    status: 'ready',
    optimalTokenAmount: optimal.tokenAmount,
    optimalParentAmount: optimal.parentTokenAmount,
    votesAdded,
  };
}
