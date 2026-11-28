/**
 * 治理域（core）纯口径：投票门槛、提案激励份额、治理激励拆分、提案正文校验。
 *
 * 这里每个公式都必须能对着合约逐行对上，行号写在函数注释里：
 * - `Mint._minProposalVoteAmount` / `Mint._proposalRewardShare` / `Mint._govRewardCalculation`
 * - `Submit._checkProposalBody` / `Submit._checkSubmitPower`
 *
 * 纯 TS：不碰 React / viem / window（`eslint.config.js` 对 `src/domain` 有硬约束）。
 * 页面只通过这些函数算「门槛 / 份额 / 剩余票数」，绝不就地用 `Math` 或浮点数重算。
 */

/** 合约里的 `PRECISION`。`Submit.sol:17`、`Mint.sol:14` 都是 `1e18`。 */
export const PRECISION = 10n ** 18n;

/** 治理票沿用治理权的 18 位小数精度。 */
export const VOTE_DECIMALS = 18;

/** 向上取整的 `mulDiv`，与 OpenZeppelin `Math.mulDiv(..., Rounding.Ceil)` 同义。 */
function mulDivCeil(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) return 0n;
  const product = a * b;
  const quotient = product / denominator;
  return product % denominator === 0n ? quotient : quotient + 1n;
}

/**
 * 提案拿到激励所需的最小票数：`Mint.sol:416-419`
 * `ceil(totalVoteAmount * PROPOSAL_REWARD_MIN_VOTE_RATIO / PRECISION)`。
 */
export function minProposalVoteAmount(totalVoteAmount: bigint, minVoteRatio: bigint): bigint {
  return mulDivCeil(totalVoteAmount, minVoteRatio, PRECISION);
}

/** 推举（`Submit`）所需治理权：`Submit.sol:84`，同样是向上取整。 */
export function requiredSubmitGovPower(totalGovPower: bigint, submitMinRatio: bigint): bigint {
  return mulDivCeil(totalGovPower, submitMinRatio, PRECISION);
}

/**
 * 提案激励份额：`Mint.sol:311-318`
 * `totalVoteAmount == 0 → 0`，否则 `floor(pool * proposalVoteAmount / totalVoteAmount)`。
 */
export function proposalRewardShare(
  proposalRewardPool: bigint,
  proposalVoteAmount: bigint,
  totalVoteAmount: bigint,
): bigint {
  if (totalVoteAmount === 0n) return 0n;
  return (proposalRewardPool * proposalVoteAmount) / totalVoteAmount;
}

/** 提案是否过门槛：`Mint.sol:395-404`，`voteAmount > 0 && voteAmount >= minVoteAmount`。 */
export function isProposalRewardEligible(
  proposalVoteAmount: bigint,
  minVoteAmount: bigint,
): boolean {
  return proposalVoteAmount > 0n && proposalVoteAmount >= minVoteAmount;
}

export interface GovRewardPools {
  readonly votePool: bigint;
  readonly boostPool: bigint;
}

/**
 * 治理激励的两个池子：`Mint.sol:359-360`
 * `votePool = govReward / VOTE_POOL_DIVISOR`，`boostPool = govReward - votePool`。
 */
export function govRewardPools(govRewardAmount: bigint, votePoolDivisor: bigint): GovRewardPools {
  if (votePoolDivisor === 0n) return { votePool: 0n, boostPool: govRewardAmount };
  const votePool = govRewardAmount / votePoolDivisor;
  return { votePool, boostPool: govRewardAmount - votePool };
}

/** 本轮还能投多少：`maxVoteAmount - 已投`，下限 0（合约按累计值校验，见 `Vote.sol:282-286`）。 */
export function remainingVotes(maxVoteAmount: bigint, usedVoteAmount: bigint): bigint {
  const remaining = maxVoteAmount - usedVoteAmount;
  return remaining > 0n ? remaining : 0n;
}

export interface VoteAllocation {
  readonly proposalId: bigint;
  readonly amount: bigint;
}

export type VoteAllocationIssue =
  /** 有提案分到 0（合约 `ZeroVoteAmount`，`Vote.sol:251-254`）。 */
  | 'zero-amount'
  /** 合计超过剩余票数（合约 `VoteLimitExceeded`）。 */
  | 'exceeds-remaining'
  /** 一笔都没填。 */
  | 'empty';

/**
 * 一次投票的分配校验。页面在提交前跑这一遍，把合约的 revert 变成本地提示；
 * 合约仍然是最终裁判（它按累计值判断，这里的 `remainingVotes` 已扣掉本轮已投）。
 */
export function validateVoteAllocation(
  allocations: readonly VoteAllocation[],
  remaining: bigint,
): VoteAllocationIssue | null {
  if (allocations.length === 0) return 'empty';
  let total = 0n;
  for (const allocation of allocations) {
    if (allocation.amount <= 0n) return 'zero-amount';
    total += allocation.amount;
  }
  if (total > remaining) return 'exceeds-remaining';
  return null;
}

/** 这一轮的治理激励还能不能铸造：`Mint.sol:480-494` 的反面（已铸 → 不能再铸，金额 0 → 铸不出）。 */
export function isGovRewardMintable(
  voteReward: bigint,
  boostReward: bigint,
  minted: boolean,
): boolean {
  return !minted && voteReward + boostReward > 0n;
}

/**
 * 批量铸造要传的轮次数组：只收「能铸」的轮次，按轮次升序（合约按传入顺序逐轮处理，
 * 中间任何一轮失败整笔回滚，所以数组里不许混进不可铸造的轮次）。
 */
export function mintableRounds(
  rows: readonly {
    readonly round: bigint;
    readonly voteReward: bigint;
    readonly boostReward: bigint;
    readonly minted: boolean;
  }[],
): bigint[] {
  return rows
    .filter((row) => isGovRewardMintable(row.voteReward, row.boostReward, row.minted))
    .map((row) => row.round)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

export interface ProposalLimits {
  readonly maxTitleLength: bigint;
  readonly maxDetailsLength: bigint;
  readonly maxCreationDataBytes: bigint;
}

export interface ProposalDraft {
  readonly title: string;
  readonly details: string;
  readonly target: string;
  readonly creationDataBytes: number;
}

export type ProposalDraftIssue =
  | 'title-empty'
  | 'title-too-long'
  | 'details-too-long'
  | 'target-invalid'
  | 'creation-data-too-large';

/**
 * UTF-8 字节数。合约按 `bytes(...).length` 校验（`Submit.sol:264,268`），
 * 中文一个字 3 字节，所以不能拿 `string.length` 顶替。手写而不调 `TextEncoder`，
 * 是为了让 `src/domain` 保持纯 TS、在任何 runtime 下结果一致。
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // 代理对：两个 UTF-16 码元合成一个 4 字节字符，跳过低位代理。
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/** 目标地址必须是 0x 开头的 40 位十六进制（合约 `ZeroTargetAddress` 之外还要挡格式）。 */
export function isProposalTargetValid(target: string): boolean {
  return ADDRESS_PATTERN.test(target.trim()) && !/^0x0{40}$/i.test(target.trim());
}

/**
 * 提案正文校验，对应 `Submit._checkProposalBody`（`Submit.sol:263-287`）。
 * 返回第一个不通过的项；页面按 issue 取对应文案，不在组件里拼规则。
 */
export function validateProposalDraft(
  draft: ProposalDraft,
  limits: ProposalLimits,
): ProposalDraftIssue | null {
  const titleBytes = utf8ByteLength(draft.title);
  if (titleBytes === 0) return 'title-empty';
  if (titleBytes > Number(limits.maxTitleLength)) return 'title-too-long';
  if (utf8ByteLength(draft.details) > Number(limits.maxDetailsLength)) return 'details-too-long';
  if (!isProposalTargetValid(draft.target)) return 'target-invalid';
  if (draft.creationDataBytes > Number(limits.maxCreationDataBytes))
    return 'creation-data-too-large';
  return null;
}
