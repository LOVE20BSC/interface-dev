import { approvalStepState, type ApprovalStepState } from '@/shared/lib/approval-step';

/**
 * 铸造身份页「授权行」该不该出现（owner 走查 2026-11-21 发现的 P1）。
 *
 * 背景：铸造价格依赖名字（`MemberNFT.calculateMintCost(name)`），名字没填/不合法时
 * 价格是未知的。旧实现用 `needsApproval = cost !== undefined && allowance < cost`
 * 推导按钮文案，于是「价格未知」被当成「不需要授权」，新账户会看到「已授权」——
 * 而它其实一分钱都没授权过（走查里真实复现）。
 *
 * 正确口径：**价格未知时不给结论**（`hidden`），等输入合法名字、价格算出来以后，
 * 才根据 allowance 与价格的关系显示「授权 / 已授权 / 已长期授权」。
 *
 * 判定已收进 `shared/lib/approval-step`（候选 D）：本文件只保留铸造页的类型窄化，
 * 不变量由共享 module 拥有。`busy` 与 `input-pending` 在这个调用点不可达
 * （铸造页把 `stage` 单独用于按钮 loading，价格未知已经先落 `hidden`）。
 *
 * 「长期授权」不再由面板另算一遍传进来：共享判定看到 `allowance >= 2^255` 就返回
 * `long-term`，面板再传一个 `longTermApproved` 是同一事实的第二次派生（2026-11-27
 * 清理）；`approved` 分支只可能是具体额度。
 */
export type ApprovalRowState = 'hidden' | 'checking' | 'needs-approval' | 'approved' | 'long-term';

export interface ApprovalRowInput {
  /** 铸造价格；`undefined` = 名字还没算出价格。 */
  readonly cost: bigint | undefined;
  /** 当前授权额度；`undefined` = 还在读。 */
  readonly allowance: bigint | undefined;
}

export function approvalRowState(input: ApprovalRowInput): ApprovalRowState {
  const state: ApprovalStepState = approvalStepState({
    required: true,
    hideWhenNeedUnknown: true,
    stage: 'idle',
    allowance: input.allowance,
    need: input.cost,
  });
  switch (state) {
    case 'hidden':
    case 'checking':
    case 'needs-approval':
      return state;
    case 'approved':
      return 'approved';
    case 'long-term':
      return 'long-term';
    // 不可达：价格未知在 `hideWhenNeedUnknown` 已经落 hidden，stage 恒为 idle。
    case 'busy':
    case 'input-pending':
      return 'checking';
  }
}
