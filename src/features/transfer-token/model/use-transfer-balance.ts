import { useBalance, useReadContract } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import type { TransferToken } from '@/features/transfer-token/lib/transfer-types';

export interface TransferBalance {
  readonly balance: bigint | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

/**
 * Balance of the selected transfer token. Native comes from the wallet provider
 * (the same asset pays the fee); ERC20 comes from `balanceOf`. Both expose the
 * same shape so the page has one balance line and one refetch after a receipt.
 */
export function useTransferBalance(
  token: TransferToken | undefined,
  account: HexAddress | undefined,
  enabled: boolean,
): TransferBalance {
  const native = token?.kind === 'native';
  const nativeBalance = useBalance({
    address: account,
    query: { enabled: enabled && native && account !== undefined },
  });

  const tokenBalance = useReadContract({
    address: token?.address,
    abi: love20TokenAbi,
    functionName: 'balanceOf',
    args: account !== undefined ? [account] : undefined,
    query: {
      enabled: enabled && !native && token?.address !== undefined && account !== undefined,
    },
  });

  if (native) {
    return {
      balance: nativeBalance.data?.value,
      isLoading: nativeBalance.isLoading,
      isError: nativeBalance.isError,
      refetch: () => {
        void nativeBalance.refetch();
      },
    };
  }

  return {
    balance: typeof tokenBalance.data === 'bigint' ? tokenBalance.data : undefined,
    isLoading: tokenBalance.isLoading,
    isError: tokenBalance.isError,
    refetch: () => {
      void tokenBalance.refetch();
    },
  };
}
