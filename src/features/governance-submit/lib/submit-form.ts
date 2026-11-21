import type { HexAddress } from '@/config/networks';
import {
  isProposalTargetValid,
  utf8ByteLength,
  validateProposalDraft,
  type ProposalDraftIssue,
  type ProposalLimits,
} from '@/domain/gov-core';
import { formatPercent } from '@/shared/lib/format-rates';

/**
 * 推举表单的纯口径：字节计数、正文校验、`ProposalBody` 组装、门槛比例格式化。
 *
 * 页面只收集三个输入（标题 / 详情 / 目标地址），合约要的是 `ProposalBody`
 * （`Submit._checkProposalBody`，`Submit.sol:263-287`），这一层负责把用户输入翻成
 * 合约口径：不碰 React、不碰写链状态机，方便页面与写链共用同一份判断。
 *
 * 本版本只推举「不回调」的提案（`TargetMode.NoCallback`）：`targetMode` 恒为 0、
 * `targetData` 恒为空数组——回调数据由目标合约定义，属于行动域。
 */

/** `ISubmit.TargetMode.NoCallback`。 */
const NO_CALLBACK_TARGET_MODE = 0;
/** 不回调就没有回调数据，所以这两项在合约校验里恒为 0。 */
const NO_CALLBACK_DATA_COUNT = 0;
const NO_CALLBACK_DATA_BYTES = 0;
/** `SUBMIT_MIN_RATIO` 是 18 位定点比例（1e18 = 100%），除它得到百分数。 */
const RATIO_PERCENT_DIVISOR = 1e16;

export interface SubmitDraft {
  readonly title: string;
  readonly details: string;
  readonly target: string;
}

export const EMPTY_SUBMIT_DRAFT: SubmitDraft = { title: '', details: '', target: '' };

export interface SubmitDraftBytes {
  readonly title: number;
  readonly details: number;
}

/**
 * 标题 / 详情的 UTF-8 字节数。合约按 `bytes(...).length` 计（`Submit.sol:264,268`），
 * 一个中文字 3 字节，不能用 `string.length` 顶替，所以统一走 `utf8ByteLength`。
 */
export function measureSubmitDraft(draft: SubmitDraft): SubmitDraftBytes {
  return { title: utf8ByteLength(draft.title), details: utf8ByteLength(draft.details) };
}

/** 页面能显示文案的四种正文问题；targetData 的两条本版本不可能命中，已收敛掉。 */
export type SubmitDraftIssue =
  'title-empty' | 'title-too-long' | 'details-too-long' | 'target-invalid';

/**
 * 提交前的本地校验，对应合约的 `TitleEmpty` / `TitleTooLong` / `DetailsTooLong` /
 * `ZeroTargetAddress` 加地址格式。返回第一个不通过的项，页面按 issue 取文案，
 * 不在组件里重写规则；合约仍然是最终裁判。
 */
export function submitDraftIssue(
  draft: SubmitDraft,
  limits: ProposalLimits,
): SubmitDraftIssue | null {
  const issue: ProposalDraftIssue | null = validateProposalDraft(
    {
      title: draft.title,
      details: draft.details,
      target: draft.target,
      targetDataCount: NO_CALLBACK_DATA_COUNT,
      targetDataBytes: NO_CALLBACK_DATA_BYTES,
    },
    limits,
  );
  switch (issue) {
    case null:
    case 'target-data-too-many':
    case 'target-data-too-large':
      // 本版本 `targetData` 恒为空，这两条只可能由回调数据触发。
      return null;
    case 'title-empty':
    case 'title-too-long':
    case 'details-too-long':
    case 'target-invalid':
      return issue;
  }
}

/** 目标地址：去掉首尾空白后必须是 0x + 40 位十六进制，且不能是零地址。 */
export function parseProposalTarget(raw: string): HexAddress | undefined {
  const trimmed = raw.trim();
  return isProposalTargetValid(trimmed) ? (trimmed as HexAddress) : undefined;
}

/** `Submit.submitNewProposal(tokenAddress, memberId, proposalBody)` 的 `proposalBody` 参数。 */
export interface ProposalBodyInput {
  readonly title: string;
  readonly details: string;
  readonly target: HexAddress;
  readonly targetMode: number;
  readonly targetData: readonly `0x${string}`[];
}

/**
 * 组装合约要的 `ProposalBody`。地址不合法时返回 undefined（页面据此显示
 * `issueTargetInvalid`），避免把未校验的字符串断言成地址。
 */
export function buildProposalBody(draft: SubmitDraft): ProposalBodyInput | undefined {
  const target = parseProposalTarget(draft.target);
  if (target === undefined) return undefined;
  return {
    title: draft.title,
    details: draft.details,
    target,
    targetMode: NO_CALLBACK_TARGET_MODE,
    targetData: [],
  };
}

/**
 * 推举门槛占社区总治理权的比例（`SUBMIT_MIN_RATIO`，1e18 定点）→ 百分数文案。
 * 读不到就是 undefined，页面用「—」兜底，绝不显示 0。
 */
export function submitRatioPercent(ratio: bigint | undefined): string | undefined {
  if (ratio === undefined) return undefined;
  return formatPercent(Number(ratio) / RATIO_PERCENT_DIVISOR);
}
