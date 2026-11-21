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
 */
export type ApprovalRowState = 'hidden' | 'checking' | 'needs-approval' | 'approved' | 'long-term';

export interface ApprovalRowInput {
  /** 铸造价格；`undefined` = 名字还没算出价格。 */
  readonly cost: bigint | undefined;
  /** 当前授权额度；`undefined` = 还在读。 */
  readonly allowance: bigint | undefined;
  /** 是否已是长期授权（`allowance ≥ 2^255`）。 */
  readonly longTermApproved: boolean;
}

export function approvalRowState(input: ApprovalRowInput): ApprovalRowState {
  if (input.cost === undefined) return 'hidden';
  if (input.allowance === undefined) return 'checking';
  if (input.allowance < input.cost) return 'needs-approval';
  return input.longTermApproved ? 'long-term' : 'approved';
}
