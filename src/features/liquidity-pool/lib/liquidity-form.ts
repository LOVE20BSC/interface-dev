import { parseUnits } from 'viem';

/**
 * 添加/撤出表单的纯函数：金额解析、deadline、滑点与撤出比例。
 *
 * 与兑换页同一套舍入口径（输入按 decimals 向下截断、滑点默认 0.5%、上限 50%），
 * 但不复用兑换页的表单状态：流动性池只有「最多可接受的价格变化」这一个共享概念。
 */

export const DEFAULT_SLIPPAGE_PERCENT = 0.5;
export const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0] as const;
export const MIN_SLIPPAGE_PERCENT = 0.01;
export const MAX_SLIPPAGE_PERCENT = 50;

/** deadline：提交后 20 分钟内有效（页面只在设置里写「20 分钟内有效」）。 */
export const DEADLINE_MINUTES = 20;
export const DEADLINE_SECONDS = DEADLINE_MINUTES * 60;

/** 撤出比例预设；自定义输入走 0–100 的百分数。 */
export const WITHDRAW_PERCENTS = [25, 50, 75, 100] as const;

/** 原生币「全部」的展示型预留（与兑换页同一口径），页面文案永远写「约」。 */
export const NATIVE_GAS_RESERVE_WEI = 10n ** 15n;

export type ParsedAmount =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'too-precise'; readonly digits: number }
  | { readonly kind: 'ok'; readonly value: bigint };

const AMOUNT_RE = /^(?:\d+\.?\d*|\.\d+)$/;

/** 金额输入：只接受非负十进制，超过 decimals 的小数位直接拒绝并给出位数。 */
export function parseAmount(raw: string, decimals: number): ParsedAmount {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'empty' };
  if (!AMOUNT_RE.test(trimmed)) return { kind: 'invalid' };
  const [whole = '0', fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) return { kind: 'too-precise', digits: decimals };
  const normalized = fraction.length > 0 ? `${whole === '' ? '0' : whole}.${fraction}` : whole;
  try {
    return { kind: 'ok', value: parseUnits(normalized, decimals) };
  } catch {
    return { kind: 'invalid' };
  }
}

/** 撤出比例输入：0–100 的百分数，允许小数两位。 */
export function parseWithdrawPercent(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (!AMOUNT_RE.test(trimmed)) return undefined;
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value) || value <= 0 || value > 100) return undefined;
  return value;
}

export function isSlippageValid(percent: number): boolean {
  return (
    Number.isFinite(percent) && percent >= MIN_SLIPPAGE_PERCENT && percent <= MAX_SLIPPAGE_PERCENT
  );
}

/** 百分数 → 基点（0.5% → 50）。 */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

/** 页面提交时的 deadline（秒）：`now + 20 分钟`，链上以秒为单位。 */
export function deadlineFromNow(nowMs: number = Date.now()): bigint {
  return BigInt(Math.floor(nowMs / 1000) + DEADLINE_SECONDS);
}
