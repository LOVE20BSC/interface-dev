import { useReadContract } from 'wagmi';
import { love20HubAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';

/**
 * `Hub.quoteStakeLiquidityWithNative` 的只读封装（智能模式专用）。
 *
 * 原协议里「单币也能完成流动性质押」只能由 Hub 完成：它先把可支配的一侧换一点成
 * 另一侧，再以两侧存入 `Stake.stakeLiquidity`。报价同时给出最终治理权增量
 * （`govVotesAdded`）与份额增量（`liquiditySharesAdded`），页面用它显示「预计」并
 * 折算滑点后的最少份额 `minLiquidityShares`——不在前端另算一套公式。
 */

export interface HubStakeQuoteFields {
  readonly hasLiquidity: boolean;
  readonly willSwap: boolean;
  readonly swapTokenIn: HexAddress;
  readonly swapTokenOut: HexAddress;
  readonly amountToSwap: bigint;
  readonly amountOutFromSwap: bigint;
  readonly preparedTokenAmount: bigint;
  readonly preparedParentTokenAmount: bigint;
  readonly usableTokenAmount: bigint;
  readonly usableParentTokenAmount: bigint;
  readonly expectedLiquidity: bigint;
  readonly liquiditySharesAdded: bigint;
  readonly liquidityShares: bigint;
  readonly govVotesAdded: bigint;
}

export interface UseHubStakeQuoteOptions {
  readonly hub: HexAddress | undefined;
  readonly tokenAddress: HexAddress | undefined;
  readonly tokenAmountDesired: bigint;
  /** 原生币变体的 value；代币变体恒为 0。 */
  readonly nativeAmountDesired: bigint;
  /** 代币变体要一起存入的父币数量（单填社区代币时为 0）。 */
  readonly parentTokenAmountDesired?: bigint;
  /**
   * `native`：`quoteStakeLiquidityWithNative`（要带 value）；
   * `token`：`quoteStakeLiquidity`（只填社区代币时必须走这条，否则原生币变体会
   * 因为 `msg.value == 0` revert `ZeroNativeTokenAmount`）。
   */
  readonly variant: 'native' | 'token';
  readonly memberId: bigint | undefined;
  readonly promisedWaitingPhases: bigint | undefined;
  readonly enabled: boolean;
}

export interface HubStakeQuoteResult {
  readonly data: HubStakeQuoteFields | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

export function useHubStakeQuote(options: UseHubStakeQuoteOptions): HubStakeQuoteResult {
  const {
    hub,
    tokenAddress,
    tokenAmountDesired,
    nativeAmountDesired,
    parentTokenAmountDesired = 0n,
    variant,
    memberId,
    promisedWaitingPhases,
    enabled,
  } = options;

  const canQuote =
    enabled &&
    hub !== undefined &&
    tokenAddress !== undefined &&
    memberId !== undefined &&
    promisedWaitingPhases !== undefined &&
    (tokenAmountDesired > 0n || nativeAmountDesired > 0n);

  const read = useReadContract({
    address: hub,
    abi: love20HubAbi,
    functionName: variant === 'native' ? 'quoteStakeLiquidityWithNative' : 'quoteStakeLiquidity',
    args:
      tokenAddress !== undefined && memberId !== undefined && promisedWaitingPhases !== undefined
        ? [
            tokenAddress,
            tokenAmountDesired,
            variant === 'native' ? nativeAmountDesired : parentTokenAmountDesired,
            memberId,
            promisedWaitingPhases,
          ]
        : undefined,
    query: { enabled: canQuote },
  });

  return {
    data: read.data as HubStakeQuoteFields | undefined,
    isLoading: canQuote && read.isLoading,
    isError: canQuote && read.isError,
    refetch: () => {
      void read.refetch();
    },
  };
}
