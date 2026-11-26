import { approvalKind } from '@/shared/lib/approval-kind';

/**
 * 授权阶梯的判定唯一实现（候选 D，2026-11-26）。
 *
 * 产品规则只有一条（`m0-ux-spec` §4.1）：「额度不够显示授权；够就原地变已授权；
 * 长期授权写已长期授权且禁用；额度没读回来显示读取中」。在此之前它在四个
 * flow 各推一遍——两个面板内联三目、质押的 `StakeApproveRow` 六段 if 链、
 * 铸造的 `approvalRowState` 四行——**判定相同但状态词各不相同**，于是同一个
 * 「不知道」在四处给了三种答案。
 *
 * 这里只拥有判定；「某状态该说什么话、按钮长什么样」仍留在各 flow 的投影里
 * （与 ADR-0009 同形：不统一布局，只统一判定）。
 */

export type ApprovalStepState =
  /** 整行不渲染：这一笔不需要代币，或前置输入未知（铸造价格还没算出来）。 */
  | 'hidden'
  /** 额度 / 所需量还没读回来：不给结论。 */
  | 'checking'
  /** 授权正在钱包确认或已上链等待：按钮进 loading。 */
  | 'busy'
  /** 前置输入还没填完（金额为空）：按钮保持显示但禁用，不当作「不需要」。 */
  | 'input-pending'
  | 'needs-approval'
  | 'approved'
  | 'long-term';

export interface ApprovalStepInput {
  /** 这一笔是否需要代币授权（原生币单边、数量为 0 时为 false）。 */
  readonly required: boolean;
  /**
   * 所需数量未知时是否整行隐藏。铸造页传 true（价格依赖名字，名字没填就不知道
   * 价格——这是走查 2026-11-21 的 P1：当时把「价格未知」说成了「已授权」）。
   */
  readonly hideWhenNeedUnknown?: boolean;
  /** 授权步骤的写尝试阶段。 */
  readonly stage: 'idle' | 'wallet' | 'pending';
  /** 当前授权额度；`undefined` = 还没读回来。 */
  readonly allowance: bigint | undefined;
  /** 这一笔需要多少；`undefined` = 还没算出来。 */
  readonly need: bigint | undefined;
}

export function approvalStepState(input: ApprovalStepInput): ApprovalStepState {
  if (!input.required) return 'hidden';
  if (input.hideWhenNeedUnknown === true && input.need === undefined) return 'hidden';
  if (input.stage !== 'idle') return 'busy';
  if (input.allowance === undefined) return 'checking';
  if (approvalKind(input.allowance) === 'unlimited') return 'long-term';
  if (input.need === undefined || input.need <= 0n) return 'input-pending';
  return input.allowance >= input.need ? 'approved' : 'needs-approval';
}
