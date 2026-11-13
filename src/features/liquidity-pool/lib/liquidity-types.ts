import type { HexAddress } from '@/config/networks';

/**
 * 流动性池的 token 与池子模型（纯数据，无 React、无 chain SDK 调用）。
 *
 * `kind` 只用于文案与余额读取口径：native 走 value 转账，community/custom 走
 * ERC20 balanceOf，wrapped 是 Router.WETH() 读出的包装原生币。本页不发明
 * token 类型：社区代币来自 Launch 目录，自定义地址由页面按 symbol()/decimals()
 * 校验后加入。
 */
export type LiquidityTokenKind = 'native' | 'wrapped' | 'community' | 'custom';

export interface LiquidityToken {
  readonly kind: LiquidityTokenKind;
  readonly address: HexAddress | undefined;
  readonly symbol: string;
  readonly decimals: number;
}

/** 池子只读快照：储备、总供应、我的 LP 余额。 */
export interface PoolSnapshot {
  readonly pairAddress: HexAddress;
  readonly token0: HexAddress;
  readonly token1: HexAddress;
  /** reserve0/reserve1 按 token0/token1 排列（链上原始顺序）。 */
  readonly reserve0: bigint;
  readonly reserve1: bigint;
  readonly totalSupply: bigint;
  readonly lpBalance: bigint;
}

/** 按「社区代币 / 原生币」方向重排后的储备。 */
export interface PoolReserves {
  readonly reserveToken: bigint;
  readonly reserveNative: bigint;
}

export function sameAddress(a: string | undefined, b: string | undefined): boolean {
  return a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();
}

/**
 * 把链上 token0/token1 顺序的储备重排成 (社区代币, 原生币/包装原生币)。
 * token 顺序由 factory 决定，页面永远不假设 token0 就是社区代币。
 */
export function reservesFor(
  snapshot: PoolSnapshot,
  tokenAddress: HexAddress,
): PoolReserves {
  if (sameAddress(snapshot.token0, tokenAddress)) {
    return { reserveToken: snapshot.reserve0, reserveNative: snapshot.reserve1 };
  }
  if (sameAddress(snapshot.token1, tokenAddress)) {
    return { reserveToken: snapshot.reserve1, reserveNative: snapshot.reserve0 };
  }
  // 用户的代币不在这个 pair 里：按零储备处理，调用方渲染「还没有池子」。
  return { reserveToken: 0n, reserveNative: 0n };
}

export function hasPoolLiquidity(snapshot: PoolSnapshot | undefined): boolean {
  if (snapshot === undefined) return false;
  return snapshot.reserve0 > 0n || snapshot.reserve1 > 0n;
}
