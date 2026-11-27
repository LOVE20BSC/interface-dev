import type { CustomTokenLookupStatus } from '@/entities/community-token/model/use-custom-token';

/**
 * 加池页对外的自定义代币状态（候选 A 的投影契约，2026-11-26；测试补于 2026-11-27）。
 *
 * 与转账页的唯一差异（有意的产品差异）：加池页输入框自己给格式提示，所以
 * `malformed` 也落 `idle`，不在这里再报一次「地址格式不对」；转账页则投影成
 * `invalid`（见 `transfer-token/lib/custom-token-state.ts`）。
 *
 * 注意这里没有 `invalid`：加池页不会产生这个状态。旧实现先把它写在 union 里、
 * 再在全仓零引用——那是死分支，测试把「不产生 invalid」钉住。
 */
export type CustomTokenStatus = 'idle' | 'checking' | 'no-code' | 'unreadable' | 'ok';

export function liquidityCustomTokenStatus(status: CustomTokenLookupStatus): CustomTokenStatus {
  if (status === 'empty' || status === 'malformed') return 'idle';
  return status;
}
