import { useMemo } from 'react';
import { useAccount, useBalance, useReadContracts } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import type { SwapToken } from '@/features/swap-token/lib/swap-types';

export interface SwapBalance {
  readonly balance: bigint | undefined;
  readonly allowance: bigint | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

/**
 * One Multicall3 batch for the input token: balanceOf + allowance(wallet, router).
 * Native has no allowance; its balance comes from the wallet provider instead.
 */
export function useSwapBalance(
  token: SwapToken | undefined,
  router: HexAddress | undefined,
): SwapBalance {
  const { address: account } = useAccount();
  const nativeBalance = useBalance({
    address: account,
    query: { enabled: account !== undefined && token?.kind === 'native' },
  });

  const contracts = useMemo(() => {
    if (token === undefined || token.kind === 'native' || account === undefined) return [];
    if (token.address === undefined || router === undefined) return [];
    return [
      {
        address: token.address,
        abi: love20TokenAbi,
        functionName: 'balanceOf' as const,
        args: [account] as const,
      },
      {
        address: token.address,
        abi: love20TokenAbi,
        functionName: 'allowance' as const,
        args: [account, router] as const,
      },
    ];
  }, [account, router, token]);

  const read = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  if (token?.kind === 'native') {
    return {
      balance: nativeBalance.data?.value,
      allowance: undefined,
      isLoading: nativeBalance.isLoading,
      isError: nativeBalance.isError,
      refetch: () => {
        void nativeBalance.refetch();
      },
    };
  }

  const balanceResult = read.data?.[0];
  const allowanceResult = read.data?.[1];
  const balance =
    balanceResult?.status === 'success' && typeof balanceResult.result === 'bigint'
      ? balanceResult.result
      : undefined;
  const allowance =
    allowanceResult?.status === 'success' && typeof allowanceResult.result === 'bigint'
      ? allowanceResult.result
      : undefined;

  return {
    balance,
    allowance,
    isLoading: contracts.length > 0 && read.isLoading,
    isError:
      read.isError || balanceResult?.status === 'failure' || allowanceResult?.status === 'failure',
    refetch: () => {
      void read.refetch();
      void nativeBalance.refetch();
    },
  };
}
