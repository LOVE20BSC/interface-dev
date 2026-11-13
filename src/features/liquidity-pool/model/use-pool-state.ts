import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { uniswapV2FactoryAbi, uniswapV2PairAbi } from '@/config/abis';
import { configuredAddress, isConfiguredAddress, type HexAddress } from '@/config/networks';
import {
  hasPoolLiquidity,
  reservesFor,
  type PoolReserves,
  type PoolSnapshot,
} from '@/features/liquidity-pool/lib/liquidity-types';

/**
 * 一个交易对的只读快照：pair 地址、链上 token 顺序、两侧储备、LP 总供应、我的
 * LP 余额。加池/撤出/查询三块共用同一份读模型，写操作确认后统一 `refetch()`。
 *
 * token 顺序由 factory 决定：页面永远按「社区代币 / 包装原生币」重排储备，不假设
 * 社区代币就是 token0。
 */

export interface PoolStateResult {
  readonly pairAddress: HexAddress | undefined;
  readonly snapshot: PoolSnapshot | undefined;
  readonly reserves: PoolReserves | undefined;
  readonly hasLiquidity: boolean;
  /** 池子存在但储备为 0（首次建池前的空池）。 */
  readonly isEmptyPool: boolean;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

export interface UsePoolStateOptions {
  readonly tokenAddress: HexAddress | undefined;
  readonly nativeAddress: HexAddress | undefined;
  readonly account: HexAddress | undefined;
  readonly enabled: boolean;
}

export function usePoolState(options: UsePoolStateOptions): PoolStateResult {
  const { tokenAddress, nativeAddress, account, enabled } = options;
  const factory = configuredAddress('factory');
  const canReadPair = enabled && factory !== undefined && tokenAddress !== undefined && nativeAddress !== undefined;

  const pairLookup = useReadContract({
    address: factory,
    abi: uniswapV2FactoryAbi,
    functionName: 'getPair',
    args:
      tokenAddress !== undefined && nativeAddress !== undefined
        ? [tokenAddress, nativeAddress]
        : undefined,
    query: { enabled: canReadPair },
  });

  const pairAddress = isConfiguredAddress(pairLookup.data) ? pairLookup.data : undefined;

  const pairContracts = useMemo(() => {
    if (pairAddress === undefined) return [];
    const base = [
      { address: pairAddress, abi: uniswapV2PairAbi, functionName: 'token0' as const },
      { address: pairAddress, abi: uniswapV2PairAbi, functionName: 'token1' as const },
      { address: pairAddress, abi: uniswapV2PairAbi, functionName: 'getReserves' as const },
      { address: pairAddress, abi: uniswapV2PairAbi, functionName: 'totalSupply' as const },
    ];
    if (account === undefined) return base;
    return [
      ...base,
      { address: pairAddress, abi: uniswapV2PairAbi, functionName: 'balanceOf' as const, args: [account] },
    ];
  }, [account, pairAddress]);

  const pairReads = useReadContracts({
    contracts: pairContracts,
    query: { enabled: pairContracts.length > 0 },
  });

  const snapshot = useMemo((): PoolSnapshot | undefined => {
    if (pairAddress === undefined || pairReads.data === undefined) return undefined;
    const results = pairReads.data as readonly {
      readonly status: 'success' | 'failure';
      readonly result?: unknown;
    }[];
    const [token0Result, token1Result, reservesResult, supplyResult, balanceResult] = results;
    const token0 =
      token0Result?.status === 'success' ? (token0Result.result as string | undefined) : undefined;
    const token1 =
      token1Result?.status === 'success' ? (token1Result.result as string | undefined) : undefined;
    const reserves =
      reservesResult?.status === 'success'
        ? (reservesResult.result as readonly [bigint, bigint, number] | undefined)
        : undefined;
    const totalSupply =
      supplyResult?.status === 'success' ? (supplyResult.result as bigint | undefined) : undefined;
    if (
      !isConfiguredAddress(token0) ||
      !isConfiguredAddress(token1) ||
      reserves === undefined ||
      totalSupply === undefined
    ) {
      return undefined;
    }
    const [reserve0, reserve1] = reserves;
    return {
      pairAddress,
      token0,
      token1,
      reserve0: BigInt(reserve0),
      reserve1: BigInt(reserve1),
      totalSupply,
      lpBalance:
        balanceResult !== undefined && balanceResult.status === 'success'
          ? (balanceResult.result as bigint)
          : 0n,
    };
  }, [pairAddress, pairReads.data]);

  const reserves = useMemo(() => {
    if (snapshot === undefined || tokenAddress === undefined || nativeAddress === undefined) {
      return undefined;
    }
    return reservesFor(snapshot, tokenAddress);
  }, [nativeAddress, snapshot, tokenAddress]);

  const isLoading =
    canReadPair && (pairLookup.isLoading || (pairAddress !== undefined && pairReads.isLoading));
  const isError = pairLookup.isError || pairReads.isError;

  return {
    pairAddress,
    snapshot,
    reserves,
    hasLiquidity: hasPoolLiquidity(snapshot),
    isEmptyPool: pairAddress !== undefined && snapshot !== undefined && !hasPoolLiquidity(snapshot),
    isLoading,
    isError,
    refetch: () => {
      void pairLookup.refetch();
      void pairReads.refetch();
    },
  };
}
