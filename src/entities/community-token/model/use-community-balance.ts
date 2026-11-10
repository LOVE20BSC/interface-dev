import { useAccount, useBalance, useReadContract } from 'wagmi';
import { communityTokenAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';

export type BalanceStatus = 'disconnected' | 'unconfigured' | 'loading' | 'ready' | 'error';

export interface TokenBalance {
  readonly status: BalanceStatus;
  readonly value: bigint | undefined;
  readonly decimals: number | undefined;
}

export function useCommunityBalance(
  tokenAddress: HexAddress | undefined,
  decimals: number | undefined,
): TokenBalance {
  const { address: account } = useAccount();
  const read = useReadContract({
    address: tokenAddress,
    abi: communityTokenAbi,
    functionName: 'balanceOf',
    args: account !== undefined ? [account] : ['0x0000000000000000000000000000000000000000'],
    query: { enabled: tokenAddress !== undefined && account !== undefined },
  });

  if (account === undefined) {
    return { status: 'disconnected', value: undefined, decimals };
  }
  if (tokenAddress === undefined) {
    return { status: 'unconfigured', value: undefined, decimals };
  }
  if (read.isError) {
    return { status: 'error', value: undefined, decimals };
  }
  if (read.data === undefined) {
    return { status: 'loading', value: undefined, decimals };
  }
  return { status: 'ready', value: read.data, decimals };
}

export interface NativeBalance {
  readonly status: 'disconnected' | 'loading' | 'ready' | 'error';
  readonly value: bigint | undefined;
  readonly decimals: number | undefined;
  readonly symbol: string;
}

export function useNativeBalance(fallbackSymbol: string): NativeBalance {
  const { address: account } = useAccount();
  const balance = useBalance({ address: account, query: { enabled: account !== undefined } });

  if (account === undefined) {
    return {
      status: 'disconnected',
      value: undefined,
      decimals: undefined,
      symbol: fallbackSymbol,
    };
  }
  if (balance.isError) {
    return { status: 'error', value: undefined, decimals: undefined, symbol: fallbackSymbol };
  }
  if (balance.data === undefined) {
    return { status: 'loading', value: undefined, decimals: undefined, symbol: fallbackSymbol };
  }
  return {
    status: 'ready',
    value: balance.data.value,
    decimals: balance.data.decimals,
    symbol: balance.data.symbol,
  };
}
