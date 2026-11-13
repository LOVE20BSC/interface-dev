/**
 * 流动性池纯算术（无 React / 无 chain SDK）。
 *
 * 公式与 `docs/product/three-line/liquidity.md` §1.2 一一对应，整数除法全部向下
 * 取整（Solidity 语义）；`sqrt` 用 `BigInt` 牛顿迭代取整数平方根，与
 * OpenZeppelin `Math.sqrt` 的向下取整一致。
 *
 * 这里不做 viem 调用，也不读任何链上状态：调用方把储备/总供应/输入传进来，
 * 单测可以逐 wei 覆盖（见 liquidity-math.test.ts）。
 */

/** Uniswap V2 永久锁定在 pair 地址上的最小流动性。 */
export const MINIMUM_LIQUIDITY = 1000n;

/** 向下取整的整数平方根。 */
export function integerSqrt(value: bigint): bigint {
  if (value < 0n) throw new Error('integerSqrt: negative input');
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}

export interface OptimalAmounts {
  readonly amountA: bigint;
  readonly amountB: bigint;
}

/**
 * Router `_addLiquidity` 的按比例截断（Uniswap V2 `quote` 语义）：
 * 以 A 侧为基准算出需要的 B，超过用户填的 B 就改用 B 为基准。
 */
export function optimalAmounts(
  reserveA: bigint,
  reserveB: bigint,
  amountADesired: bigint,
  amountBDesired: bigint,
): OptimalAmounts {
  if (reserveA <= 0n || reserveB <= 0n) {
    // 空储备（首次建池）：两个数量原样入场，价格由这两个数量决定。
    return { amountA: amountADesired, amountB: amountBDesired };
  }
  const amountBOptimal = (amountADesired * reserveB) / reserveA;
  if (amountBOptimal <= amountBDesired) {
    return { amountA: amountADesired, amountB: amountBOptimal };
  }
  const amountAOptimal = (amountBDesired * reserveA) / reserveB;
  return { amountA: amountAOptimal, amountB: amountBDesired };
}

/**
 * 本次铸出的 LP：`min(amountA·S/reserveA, amountB·S/reserveB)`；
 * 首次注资（`totalSupply === 0`）为 `sqrt(amountA·amountB) − 1000`。
 */
export function liquidityMinted(
  reserveA: bigint,
  reserveB: bigint,
  totalSupply: bigint,
  amountA: bigint,
  amountB: bigint,
): bigint {
  if (amountA <= 0n || amountB <= 0n) return 0n;
  if (totalSupply === 0n || reserveA <= 0n || reserveB <= 0n) {
    const root = integerSqrt(amountA * amountB);
    return root > MINIMUM_LIQUIDITY ? root - MINIMUM_LIQUIDITY : 0n;
  }
  const fromA = (amountA * totalSupply) / reserveA;
  const fromB = (amountB * totalSupply) / reserveB;
  return fromA < fromB ? fromA : fromB;
}

export interface DualAddPlan {
  /** 实际进入池子的两侧数量（按比例截断后）。 */
  readonly amountA: bigint;
  readonly amountB: bigint;
  /** 预计获得的 LP；用户填的数量不足 1000 wei 时可能是 0。 */
  readonly liquidity: bigint;
  /** 池子还没有储备：这是第一次建池。 */
  readonly firstMint: boolean;
}

/** 双币按比例加池（Router 降级路径）的本地计划。 */
export function planDualAdd(
  reserveA: bigint,
  reserveB: bigint,
  totalSupply: bigint,
  amountADesired: bigint,
  amountBDesired: bigint,
): DualAddPlan {
  const firstMint = totalSupply === 0n || reserveA <= 0n || reserveB <= 0n;
  const { amountA, amountB } = optimalAmounts(
    reserveA,
    reserveB,
    amountADesired,
    amountBDesired,
  );
  return {
    amountA,
    amountB,
    liquidity: liquidityMinted(reserveA, reserveB, totalSupply, amountA, amountB),
    firstMint,
  };
}

export interface WithdrawPlan {
  readonly amountA: bigint;
  readonly amountB: bigint;
}

/** 按比例撤出：`lp·reserve/totalSupply`，两侧都向下取整。 */
export function planWithdraw(
  lpAmount: bigint,
  totalSupply: bigint,
  reserveA: bigint,
  reserveB: bigint,
): WithdrawPlan {
  if (lpAmount <= 0n || totalSupply <= 0n) return { amountA: 0n, amountB: 0n };
  return {
    amountA: (lpAmount * reserveA) / totalSupply,
    amountB: (lpAmount * reserveB) / totalSupply,
  };
}

/** 撤出比例（0–100 的百分数）对应的 LP 数量，向下取整。 */
export function lpForPercent(lpBalance: bigint, percent: number): bigint {
  if (lpBalance <= 0n) return 0n;
  const bounded = Math.min(100, Math.max(0, percent));
  const basisPoints = BigInt(Math.round(bounded * 100));
  const result = (lpBalance * basisPoints) / 10_000n;
  // 100% 必须撤干净：小数比例向下取整可能留下 1 wei 的残留。
  return basisPoints === 10_000n ? lpBalance : result;
}

/**
 * 我的占比（百分数，0–100），用于「我的占比 18.32%」。
 *
 * 保留 4 位小数：显示层 `formatPercent` 只留 2 位并向下截断。若这里先截到 2 位，
 * `4.64` 在浮点里可能是 `4.639999…`，显示层再截一次会掉成 `4.63`。
 */
export function sharePercent(lpBalance: bigint, totalSupply: bigint): number | undefined {
  if (totalSupply <= 0n || lpBalance < 0n) return undefined;
  return Number((lpBalance * 1_000_000n) / totalSupply) / 10_000;
}

/** 数量 × (1 − 滑点)，向下取整；滑点为 0 时原样返回。 */
export function applySlippageDown(amount: bigint, slippageBps: number): bigint {
  const bounded = Math.min(Math.max(0, Math.round(slippageBps)), 9_999);
  if (bounded === 0) return amount;
  return (amount * BigInt(10_000 - bounded)) / 10_000n;
}

/**
 * 价格：1 个 `baseSymbol` 值多少个 `quoteSymbol`，用整数比率返回，显示层再
 * 走 `formatRate`。储备为 0 时返回 undefined（页面显示「—」）。
 */
export function priceRatio(
  baseReserve: bigint,
  quoteReserve: bigint,
): { readonly quote: bigint; readonly base: bigint } | undefined {
  if (baseReserve <= 0n || quoteReserve <= 0n) return undefined;
  return { quote: quoteReserve, base: baseReserve };
}
