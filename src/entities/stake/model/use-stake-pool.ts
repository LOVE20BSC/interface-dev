import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { stakeAbi, uniswapV2PairAbi } from '@/config/abis';
import { configuredAddress, isConfiguredAddress, type HexAddress } from '@/config/networks';

export type StakePoolStatus = 'idle' | 'unconfigured' | 'loading' | 'error' | 'ready';

export interface StakePool {
  readonly status: StakePoolStatus;
  readonly pairAddress: HexAddress | undefined;
  /** 交易对里社区代币一侧的储备。 */
  readonly reserveToken: bigint | undefined;
  /** 交易对里父币一侧的储备。 */
  readonly reserveParent: bigint | undefined;
  /** 交易对的 LP 总供应（`totalSupply`），用于估算本次能铸出多少 LP。 */
  readonly lpTotalSupply: bigint | undefined;
  readonly refetch: () => void;
}

const IDLE: StakePool = {
  status: 'idle',
  pairAddress: undefined,
  reserveToken: undefined,
  reserveParent: undefined,
  lpTotalSupply: undefined,
  refetch: () => {},
};

/**
 * 流动性质押用到的交易对快照：`Stake.pairAddress(token)` → pair 的
 * `getReserves` / `token0` / `totalSupply`。
 *
 * 质押合约自己在交易对里加池，所以页面显示的「按池子比例实际存入多少」和
 * 「预计获得治理权」都要用同一份储备与总供应估算——这不是报价，是比例换算；
 * 真正的数量以交易回执为准。
 */
export function useStakePool(tokenAddress: HexAddress | undefined): StakePool {
  const stake = configuredAddress('stake');

  const pairRead = useReadContract({
    address: stake,
    abi: stakeAbi,
    functionName: 'pairAddress',
    args: tokenAddress !== undefined ? [tokenAddress] : undefined,
    query: { enabled: stake !== undefined && tokenAddress !== undefined },
  });

  const pairAddress =
    isConfiguredAddress(pairRead.data) && pairRead.data !== undefined
      ? (pairRead.data as HexAddress)
      : undefined;

  const contracts = useMemo(
    () =>
      pairAddress === undefined
        ? []
        : [
            {
              address: pairAddress,
              abi: uniswapV2PairAbi,
              functionName: 'getReserves' as const,
            },
            { address: pairAddress, abi: uniswapV2PairAbi, functionName: 'token0' as const },
            { address: pairAddress, abi: uniswapV2PairAbi, functionName: 'totalSupply' as const },
          ],
    [pairAddress],
  );

  const read = useReadContracts({ contracts, query: { enabled: pairAddress !== undefined } });

  const refetch = () => {
    if (stake !== undefined && tokenAddress !== undefined) pairRead.refetch();
    if (pairAddress !== undefined) read.refetch();
  };

  if (stake === undefined) return { ...IDLE, status: 'unconfigured' };
  if (tokenAddress === undefined) return IDLE;

  const reservesEntry = read.data?.[0];
  const token0Entry = read.data?.[1];
  const totalSupplyEntry = read.data?.[2];

  const reserves =
    reservesEntry?.status === 'success' && Array.isArray(reservesEntry.result)
      ? (reservesEntry.result as readonly bigint[])
      : undefined;
  const token0 =
    token0Entry?.status === 'success' && typeof token0Entry.result === 'string'
      ? token0Entry.result
      : undefined;
  const lpTotalSupply =
    totalSupplyEntry?.status === 'success' && typeof totalSupplyEntry.result === 'bigint'
      ? totalSupplyEntry.result
      : undefined;

  const reserve0 = reserves?.[0];
  const reserve1 = reserves?.[1];
  const isToken0 =
    token0 !== undefined && tokenAddress !== undefined
      ? token0.toLowerCase() === tokenAddress.toLowerCase()
      : undefined;

  let status: StakePoolStatus = 'ready';
  if (pairRead.isLoading || (pairAddress !== undefined && read.isLoading)) status = 'loading';
  else if (pairRead.isError || read.isError || reservesEntry?.status === 'failure')
    status = 'error';
  else if (pairAddress === undefined) status = 'idle';

  return {
    status,
    pairAddress,
    reserveToken: isToken0 === undefined ? undefined : isToken0 ? reserve0 : reserve1,
    reserveParent: isToken0 === undefined ? undefined : isToken0 ? reserve1 : reserve0,
    lpTotalSupply,
    refetch,
  };
}
