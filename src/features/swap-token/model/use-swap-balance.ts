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
 * One Multicall3 batch for one side of the 兑换 card: balanceOf + allowance
 * (wallet, router). Native has no allowance; its balance comes from the wallet
 * provider instead.
 *
 * `staleTime: 0` is deliberate: the app-level query client caches chain reads for
 * 15 s, but a balance shown next to a 兑换 action must be the current one. Without
 * it, switching the pair (or the 交换方向 button) reused a cached 0 balance from
 * the other side's pre-swap read and left 兑换 disabled (owner 2026-11-14:
 * 「完成一次兑换后再输入金额点兑换没反应」的同类状态残留).
 */
export function useSwapBalance(
  token: SwapToken | undefined,
  router: HexAddress | undefined,
): SwapBalance {
  const { address: account } = useAccount();
  const nativeBalance = useBalance({
    address: account,
    query: { enabled: account !== undefined && token?.kind === 'native', staleTime: 0 },
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
    query: { enabled: contracts.length > 0, staleTime: 0 },
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
