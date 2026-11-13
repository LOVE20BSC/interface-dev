import { useReadContract } from 'wagmi';
import { love20HubAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';

/**
 * `quoteLpWithNative` 的只读封装（Hub view，不写链）。
 *
 * 报价只在「一键单边」且池子已有流动性时使用：`amountTokenDesired` 或
 * `amountNativeDesired` 有一个为 0 就是单边输入。页面把 quote 的
 * `prepared/usable/expectedLiquidity/suggested*Min` 显示给用户，提交时用
 * `usable × (1 − 滑点)` 作为最少进池数量。
 *
 * 注意：报价不是理论线（见 docs/product/three-line/liquidity.md）。它同时是
 * 页面显示的数据源和「Hub 是否支持这一笔」的判定：报价失败就降级到两侧都填。
 */

export interface HubQuoteResult {
  readonly data: HubQuoteFields | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

/** 与 `LpQuote` struct 字段一一对应（viem 已按 ABI 名称解码）。 */
export interface HubQuoteFields {
  readonly hasLiquidity: boolean;
  readonly willSwap: boolean;
  readonly swapTokenIn: HexAddress;
  readonly swapTokenOut: HexAddress;
  readonly amountToSwap: bigint;
  readonly amountOutFromSwap: bigint;
  readonly preparedAmountA: bigint;
  readonly preparedAmountB: bigint;
  readonly usableAmountA: bigint;
  readonly usableAmountB: bigint;
  readonly expectedLiquidity: bigint;
  readonly suggestedAmountAMin: bigint;
  readonly suggestedAmountBMin: bigint;
}

export interface UseHubQuoteOptions {
  readonly hub: HexAddress | undefined;
  readonly tokenAddress: HexAddress | undefined;
  readonly amountTokenDesired: bigint;
  readonly amountNativeDesired: bigint;
  readonly enabled: boolean;
}

export function useHubQuote(options: UseHubQuoteOptions): HubQuoteResult {
  const { hub, tokenAddress, amountTokenDesired, amountNativeDesired, enabled } = options;
  const canQuote =
    enabled &&
    hub !== undefined &&
    tokenAddress !== undefined &&
    (amountTokenDesired > 0n || amountNativeDesired > 0n);

  const read = useReadContract({
    address: hub,
    abi: love20HubAbi,
    functionName: 'quoteLpWithNative',
    args:
      tokenAddress !== undefined ? [tokenAddress, amountTokenDesired, amountNativeDesired] : undefined,
    query: { enabled: canQuote },
  });

  return {
    data: read.data as HubQuoteFields | undefined,
    isLoading: canQuote && read.isLoading,
    isError: read.isError,
    refetch: () => {
      void read.refetch();
    },
  };
}
