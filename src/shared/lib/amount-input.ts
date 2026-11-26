import { parseUnits } from 'viem';

/**
 * 用户金额输入的唯一实现（C2 收口，2026-11-26）。
 *
 * 五个写链页（兑换 / 加池 / 治理质押 / 代币转账 / 治理投票）原先各自实现十进制
 * 解析，规则已分叉成三种精度口径。这里把**解析**收成一份，策略由调用方显式声明；
 * 每个 feature 保留自己的结果类型与文案，只做投影，所以用户可见行为不变。
 *
 * 三种策略（都来自现有实现，不是设计出来的新口径）：
 * - `reject-precision`：超过 `decimals` 的小数位**拒绝**并报告位数（兑换 / 加池 / 质押）
 * - `truncate-precision`：超精度**静默截断**并标记（代币转账：页面会提示「按精度截断」）
 * - `reject-as-invalid`：超精度直接算**非法输入**（投票：票数丢一位就是错数）
 */

/**
 * 原生币「全部」的展示型预留（0.001）。转账要付网络费，所以按余额减预留展示，
 * 页面文案永远写「约」。五个 feature 原先各写一份 `10n ** 15n`，这里是唯一来源。
 */
export const NATIVE_FEE_RESERVE_WEI = 10n ** 15n;

export type AmountStrategy = 'reject-precision' | 'truncate-precision' | 'reject-as-invalid';

export type ParsedAmountInput =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid' }
  /** 仅 `reject-precision` 会返回：超精度，`digits` 是允许的小数位数。 */
  | { readonly kind: 'too-precise'; readonly digits: number }
  | { readonly kind: 'zero'; readonly truncated?: boolean }
  | { readonly kind: 'ok'; readonly value: bigint; readonly truncated: boolean };

/** 兑换/加池/质押/转账共用：点前后至少一位数字，不接受符号与指数记法。 */
const STRICT_AMOUNT_RE = /^(?:\d+\.?\d*|\.\d+)$/;
/** 投票页历史实现更宽松（`.` 也能过正则，靠后续解析兜底）；按策略保留，不统一。 */
const LOOSE_AMOUNT_RE = /^\d*(?:\.\d*)?$/;

export interface ParseAmountInputOptions {
  readonly decimals: number;
  readonly strategy: AmountStrategy;
}

/**
 * 解析金额输入。返回 canonical 结果，feature 只投影成自己的 union。
 *
 * 已知且**有意保留**的差异：零在 `reject-precision` 下返回 `ok 0n`，在另两种策略下
 * 返回 `zero`——五个页面的按钮门禁依赖这个区别，统一会改变交互行为。
 */
export function parseAmountInput(raw: string, options: ParseAmountInputOptions): ParsedAmountInput {
  const { decimals, strategy } = options;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'empty' };

  const loose = strategy === 'reject-as-invalid';
  if (!(loose ? LOOSE_AMOUNT_RE : STRICT_AMOUNT_RE).test(trimmed)) return { kind: 'invalid' };
  // 宽松正则允许 `.`：没有任何数字就不是金额（历史实现同样落到 invalid）。
  if (!/\d/.test(trimmed)) return { kind: 'invalid' };

  const [whole = '0', fraction = ''] = trimmed.split('.');
  const excess = fraction.length - decimals;
  if (excess > 0) {
    if (strategy === 'reject-precision') return { kind: 'too-precise', digits: decimals };
    if (strategy === 'reject-as-invalid') return { kind: 'invalid' };
  }

  const kept = excess > 0 ? fraction.slice(0, decimals) : fraction;
  const truncated = excess > 0;
  const wholeText = whole === '' ? '0' : whole;
  const normalized = kept.length > 0 ? `${wholeText}.${kept}` : wholeText;

  let value: bigint;
  try {
    value = parseUnits(normalized, decimals);
  } catch {
    return { kind: 'invalid' };
  }

  if (value === 0n) {
    return strategy === 'reject-precision'
      ? { kind: 'ok', value, truncated }
      : { kind: 'zero', truncated };
  }
  return { kind: 'ok', value, truncated };
}
