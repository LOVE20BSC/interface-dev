import { NATIVE_FEE_RESERVE_WEI, parseAmountInput } from '@/shared/lib/amount-input';
import { percentToBps } from '@/shared/lib/percent';

/**
 * 添加/撤出表单的纯函数：金额解析、deadline、滑点与撤出比例。
 *
 * 与兑换页同一套舍入口径（输入按 decimals 向下截断、滑点默认 0.5%、上限 50%），
 * 但不复用兑换页的表单状态：流动性池只有「最多可接受的价格变化」这一个共享概念。
 */

export const DEFAULT_SLIPPAGE_PERCENT = 0.5;
/**
 * 预设档位：旧库 LOVE20TKM 的滑点弹层是 `0.5 / 1.0 / 2.5`，本站默认 0.5% 与 `0.1%`
 * 是三线口径（不能把默认值改成旧库的 2.5%，否则 `minLiquidity` 全部理论值都会变），
 * 所以并集是 `0.1 / 0.5 / 1.0 / 2.5`：旧库用户能找到同样的 2.5% 档位。
 */
export const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0, 2.5] as const;
export const MIN_SLIPPAGE_PERCENT = 0.01;
export const MAX_SLIPPAGE_PERCENT = 50;

/** deadline：提交后 20 分钟内有效（页面只在设置里写「20 分钟内有效」）。 */
export const DEADLINE_MINUTES = 20;
export const DEADLINE_SECONDS = DEADLINE_MINUTES * 60;

/**
 * 撤出页的快捷填充比例（owner 2026-11-14：撤出输入的是 LP 数量，比例只是快捷按钮，
 * 点一下把对应比例的 LP 数量填进输入框，用户仍然可以手改数量）。
 */
export const WITHDRAW_PERCENTS = [25, 50, 75, 100] as const;

/** 原生币「全部」的展示型预留（与兑换页同一口径），页面文案永远写「约」。 */
export const NATIVE_GAS_RESERVE_WEI = NATIVE_FEE_RESERVE_WEI;

export type ParsedAmount =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'too-precise'; readonly digits: number }
  | { readonly kind: 'ok'; readonly value: bigint };

/** 金额输入：只接受非负十进制，超过 decimals 的小数位直接拒绝并给出位数。 */
export function parseAmount(raw: string, decimals: number): ParsedAmount {
  const parsed = parseAmountInput(raw, { decimals, strategy: 'reject-precision' });
  switch (parsed.kind) {
    case 'empty':
      return { kind: 'empty' };
    case 'too-precise':
      return { kind: 'too-precise', digits: parsed.digits };
    case 'zero':
    case 'invalid':
      return { kind: 'invalid' };
    case 'ok':
      return { kind: 'ok', value: parsed.value };
  }
}

export function isSlippageValid(percent: number): boolean {
  return (
    Number.isFinite(percent) && percent >= MIN_SLIPPAGE_PERCENT && percent <= MAX_SLIPPAGE_PERCENT
  );
}

export { percentToBps };

/** 页面提交时的 deadline（秒）：`now + 20 分钟`，链上以秒为单位。 */
export function deadlineFromNow(nowMs: number = Date.now()): bigint {
  return BigInt(Math.floor(nowMs / 1000) + DEADLINE_SECONDS);
}

/**
 * 添加区「缺哪一侧 / 显式 0」的判定（QA D6/D7）。
 *
 * 把三种容易被同一句「金额必须大于 0。」糊住的状态分开：
 * - `none`：没填，或两侧都有正数；
 * - `zero`：用户显式填了 0，或两侧都解析为 0；
 * - `missing-other-side`：走 Router（智能模式关 / 空池）时只填了一侧，另一侧还空着。
 */
export type AddSideIssue = 'none' | 'zero' | 'missing-other-side';

export function addSideIssue(input: {
  readonly tokenRaw: string;
  readonly nativeRaw: string;
  readonly tokenAmount: bigint;
  readonly nativeAmount: bigint;
  /** 这一笔走 Router（两侧都要有数量）而不是 Hub 单边配平。 */
  readonly routerPath: boolean;
}): AddSideIssue {
  const tokenRaw = input.tokenRaw.trim();
  const nativeRaw = input.nativeRaw.trim();
  if (tokenRaw.length === 0 && nativeRaw.length === 0) return 'none';
  const tokenEmpty = input.tokenAmount === 0n;
  const nativeEmpty = input.nativeAmount === 0n;
  if (input.routerPath && tokenEmpty !== nativeEmpty) {
    // 空着的那一侧有文本（显式 0）就是「金额必须大于 0」，否则是「另一侧还没填」。
    const emptySideHasText = tokenEmpty ? tokenRaw.length > 0 : nativeRaw.length > 0;
    return emptySideHasText ? 'zero' : 'missing-other-side';
  }
  if (tokenEmpty && nativeEmpty) return 'zero';
  return 'none';
}

/**
 * 智能模式提示的归类（QA D3）：加载中绝不能断言「这个代币还没有池子」。
 * 优先级：Hub 未配置 → 读取中 → 读取失败 → 空池 → 无需提示。
 */
export type PoolNoticeKind = 'none' | 'loading' | 'hub-missing' | 'empty' | 'read-failed';

export function poolNoticeKind(input: {
  readonly smartMode: boolean;
  readonly hubConfigured: boolean;
  readonly hasLiquidity: boolean;
  readonly isLoading: boolean;
  readonly isError: boolean;
}): PoolNoticeKind {
  if (!input.smartMode) return 'none';
  if (!input.hubConfigured) return 'hub-missing';
  if (input.isLoading) return 'loading';
  if (input.isError) return 'read-failed';
  if (!input.hasLiquidity) return 'empty';
  return 'none';
}

/**
 * 授权阶段判定（QA D8）：这一笔根本不需要代币时（原生币单边 / 数量为 0），
 * 不能把「不需要授权」显示成「已授权」。
 */
export type ApprovalNeed = 'required' | 'satisfied' | 'not-needed';

export function approvalNeed(
  requiredTokenAmount: bigint,
  allowance: bigint | undefined,
): ApprovalNeed {
  if (requiredTokenAmount <= 0n) return 'not-needed';
  if (allowance === undefined || allowance < requiredTokenAmount) return 'required';
  return 'satisfied';
}
