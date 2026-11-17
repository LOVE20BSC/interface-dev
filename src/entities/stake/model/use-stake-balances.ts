import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';

export type StakeBalanceStatus = 'idle' | 'loading' | 'error' | 'ready';

export interface StakeBalances {
  readonly status: StakeBalanceStatus;
  /** 钱包里的社区代币余额。 */
  readonly tokenBalance: bigint | undefined;
  /** 钱包里的父币余额（流动性质押的两侧之一）。 */
  readonly parentBalance: bigint | undefined;
  readonly refetch: () => void;
}

/**
 * 流动性质押/加速质押要用到的两枚代币余额。
 *
 * 父币在本地链上是 TestWETH（WETH9 兼容合约），`balanceOf` 属于 ERC20，与社区
 * 代币同一套读法；原生币余额不参与质押，页面不显示。
 */
export function useStakeBalances(
  wallet: HexAddress | undefined,
  tokenAddress: HexAddress | undefined,
  parentAddress: HexAddress | undefined,
): StakeBalances {
  const enabled = wallet !== undefined && tokenAddress !== undefined && parentAddress !== undefined;

  const contracts = useMemo(
    () =>
      !enabled
        ? []
        : [
            {
              address: tokenAddress as HexAddress,
              abi: love20TokenAbi,
              functionName: 'balanceOf' as const,
              args: [wallet as HexAddress] as const,
            },
            {
              address: parentAddress as HexAddress,
              abi: love20TokenAbi,
              functionName: 'balanceOf' as const,
              args: [wallet as HexAddress] as const,
            },
          ],
    [enabled, parentAddress, tokenAddress, wallet],
  );

  const read = useReadContracts({ contracts, query: { enabled } });

  const refetch = () => {
    if (enabled) read.refetch();
  };

  if (!enabled) {
    return { status: 'idle', tokenBalance: undefined, parentBalance: undefined, refetch };
  }

  const tokenEntry = read.data?.[0];
  const parentEntry = read.data?.[1];
  const tokenBalance =
    tokenEntry?.status === 'success' && typeof tokenEntry.result === 'bigint'
      ? tokenEntry.result
      : undefined;
  const parentBalance =
    parentEntry?.status === 'success' && typeof parentEntry.result === 'bigint'
      ? parentEntry.result
      : undefined;

  let status: StakeBalanceStatus = 'ready';
  if (read.isLoading) status = 'loading';
  else if (read.isError || tokenEntry?.status === 'failure' || parentEntry?.status === 'failure') {
    status = 'error';
  }

  return { status, tokenBalance, parentBalance, refetch };
}
