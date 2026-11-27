import type { CustomTokenLookupStatus } from '@/entities/community-token/model/use-custom-token';

/**
 * 转账页对外的自定义代币状态（候选 A 的投影契约，2026-11-26；测试补于 2026-11-27）。
 *
 * 共享判定只有一份（`entities/community-token`），两个 feature 只做投影：
 * - 转账页：空输入 → `idle`；格式不对 → `invalid`（这个输入框本身不拦格式）；
 * - 加池页：空输入与格式不对都 → `idle`（输入框自己给格式提示，见 `liquidity-pool`
 *   的同名 module）。
 *
 * 投影曾经没有测试：删掉旧 `use-liquidity-catalog.test.ts` 时，这条「同一个
 * `malformed` 在两个页面给两个状态词」的产品差异没有任何断言，改错一处不会被发现。
 */
export type CustomTokenStatus = 'idle' | 'invalid' | 'checking' | 'no-code' | 'unreadable' | 'ok';

export function transferCustomTokenStatus(status: CustomTokenLookupStatus): CustomTokenStatus {
  if (status === 'empty') return 'idle';
  if (status === 'malformed') return 'invalid';
  return status;
}

/**
 * 自定义代币那一行「重新读取」只对**读失败**有意义。
 *
 * 格式不对 / 地址上没有合约都是输入或地址本身的问题，重读不会有结果——以前
 * 三种错误都挂着这个按钮，点了什么也不会发生（死按钮）。
 */
export function canRetryCustomToken(status: CustomTokenStatus): boolean {
  return status === 'unreadable';
}
