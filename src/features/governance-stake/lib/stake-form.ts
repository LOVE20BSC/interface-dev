import { parseAmountInput } from '@/shared/lib/amount-input';
import { optimalAmounts } from '@/domain/gov-stake';

/**
 * 治理·质押 表单的纯函数：金额解析、承诺解锁期解析、LP 估算。
 *
 * 与兑换/流动性共用同一套舍入口径：只接受非负十进制，超过 `decimals` 的小数位
 * 直接拒绝并给出位数；金额一律向下截断，不四舍五入。这里不读链、不碰 React，
 * 页面与单测用同一份规则。
 */

export type ParsedStakeAmount =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'too-precise'; readonly digits: number }
  | { readonly kind: 'ok'; readonly value: bigint };

const PHASE_RE = /^\d+$/;

export function parseStakeAmount(raw: string, decimals: number): ParsedStakeAmount {
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

/** 承诺解锁期的快捷档位（阶段数）。范围由合约参数决定，这里只是常用值。 */
export const PHASE_PRESETS = [1, 10, 30, 100] as const;

export type ParsedPhaseCount =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'ok'; readonly value: bigint };

/** 承诺解锁期是整数阶段数；小数、负号、科学计数法都算无效输入。 */
export function parsePhaseCount(raw: string): ParsedPhaseCount {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'empty' };
  if (!PHASE_RE.test(trimmed)) return { kind: 'invalid' };
  try {
    const value = BigInt(trimmed);
    if (!Number.isSafeInteger(Number(value))) return { kind: 'invalid' };
    return { kind: 'ok', value };
  } catch {
    return { kind: 'invalid' };
  }
}

/** 还差多少（`needed - balance`，只返回正数）；余额或需求未知时返回 undefined。 */
export function amountShortfall(
  balance: bigint | undefined,
  needed: bigint | undefined,
): bigint | undefined {
  if (balance === undefined || needed === undefined) return undefined;
  const shortfall = needed - balance;
  return shortfall > 0n ? shortfall : undefined;
}

export interface LpMintedInput {
  readonly tokenAmount: bigint;
  readonly parentTokenAmount: bigint;
  readonly reserveToken: bigint;
  readonly reserveParent: bigint;
  /** 交易对的 LP 总供应；0 表示第一次建池，无法用比例估。 */
  readonly lpTotalSupply: bigint;
}

/**
 * 本次质押在交易对里能铸出多少 LP（Uniswap V2 的 `min(a·S/R_A, b·S/R_B)`）。
 *
 * 输入先按池子比例截成实际会存入的两侧（与合约 `_optimalAmounts` 同一规则），
 * 再用截断后的数量算。空池（`lpTotalSupply == 0`）或储备为 0 时返回 null：页面
 * 据此不显示「预计治理权」，而不是猜一个数字。
 */
export function estimateLpMinted(input: LpMintedInput): bigint | null {
  const { reserveToken, reserveParent, lpTotalSupply } = input;
  if (reserveToken === 0n || reserveParent === 0n || lpTotalSupply === 0n) return null;
  const optimal = optimalAmounts({
    tokenAmount: input.tokenAmount,
    parentTokenAmount: input.parentTokenAmount,
    reserveToken,
    reserveParent,
  });
  const fromToken = (optimal.tokenAmount * lpTotalSupply) / reserveToken;
  const fromParent = (optimal.parentTokenAmount * lpTotalSupply) / reserveParent;
  return fromToken < fromParent ? fromToken : fromParent;
}

/** 质押类交易的 deadline：提交后 20 分钟内有效（页面不展示 deadline 文本）。 */
export const STAKE_DEADLINE_SECONDS = 20 * 60;

/** 纯靠模块作用域调用 Date.now，避免在组件 render 期出现 impure 调用。 */
export function stakeDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + STAKE_DEADLINE_SECONDS);
}

/**
 * 这一次质押用哪个承诺解锁期（owner 2026-11-18）：
 * - **已有质押**：必须保持当前值（Hub 的 `_stake` 要求 `phases == current`，
 *   `Stake.stakeLiquidity` 也不允许变小）；想改请在页顶「调整承诺解锁期」里单独调。
 * - **首次质押**：合约允许任意合法值，用用户选的 `chosenPhases`；没选/非法给
 *   undefined（页面据此禁用提交，不猜默认值）。
 */
export function resolveStakePhases(
  currentPhases: bigint,
  chosenPhases: bigint | undefined,
): bigint | undefined {
  if (currentPhases > 0n) return currentPhases;
  return chosenPhases;
}
