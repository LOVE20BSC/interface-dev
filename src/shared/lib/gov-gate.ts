/**
 * 治理准入阶梯的唯一判定（候选 B，2026-11-26）。
 *
 * 「我现在能不能操作这个治理页面、不能的话下一步点哪」在产品上是一条阶梯：
 * 未部署 → 未连接 → 身份 NFT 三态 → 社区读不到 → 就绪。它原先在两个域各写一遍
 * （`entities/gov-core/model/use-gov-access.ts` 与
 * `features/governance-stake/model/use-gov-context.ts`），两份注释逐字写着
 * 「两个域的门禁阶梯文案与顺序保持一致」——靠注释同步，已经漂了两个文案。
 *
 * 这里只拥有**判定**；状态到文案/按钮的映射留在两个域的门禁卡里
 * （与 ADR-0009/0012 同形：不统一布局，只统一判定）。
 */

/** 身份 NFT 的六种非就绪态 + 就绪；与 `MemberIdentityStatus` 同名同义。 */
export type GovGateIdentityStatus =
  'disconnected' | 'loading' | 'unconfigured' | 'error' | 'empty' | 'needs-selection' | 'ready';

export type GovGateState =
  /** 本页需要的合约地址没配：这一版部署还没接这块。 */
  | 'unconfigured'
  | 'connect'
  | 'identity-loading'
  | 'identity-unconfigured'
  | 'identity-error'
  | 'no-identity'
  | 'needs-selection'
  /** 合约都配好了，但当前代币社区读不到。 */
  | 'community-unknown'
  | 'ready';

export interface GovGateInput {
  /** 本页要求的地址/参数是否缺失（各域自己算：core 看 `requiredAddresses`，stake 看质押三项）。 */
  readonly unconfigured: boolean;
  readonly connected: boolean;
  readonly identityStatus: GovGateIdentityStatus;
  /** 当前代币社区是否已经解析出来（`token === undefined` 表示还没读到）。 */
  readonly communityKnown: boolean;
}

export function govGateState(input: GovGateInput): GovGateState {
  if (input.unconfigured) return 'unconfigured';
  if (!input.connected || input.identityStatus === 'disconnected') return 'connect';
  if (input.identityStatus === 'loading') return 'identity-loading';
  if (input.identityStatus === 'unconfigured') return 'identity-unconfigured';
  if (input.identityStatus === 'error') return 'identity-error';
  if (input.identityStatus === 'empty') return 'no-identity';
  if (input.identityStatus === 'needs-selection') return 'needs-selection';
  if (!input.communityKnown) return 'community-unknown';
  if (input.identityStatus !== 'ready') return 'identity-loading';
  return 'ready';
}
