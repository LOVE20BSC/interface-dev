import { useCallback } from 'react';
import { usePublicClient, useReadContract } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';

export interface BatchAllowance {
  /** `allowance(wallet, BatchTransfer)`; `undefined` until read or when unreadable. */
  readonly value: bigint | undefined;
  readonly isLoading: boolean;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

/**
 * How much the connected wallet has already allowed the BatchTransfer contract
 * to pull. Only meaningful in ERC20 mode; native mode never needs an approval.
 * The page approves the exact batch total once, then requires a re-read before
 * enabling 「2 批量转账」 (an approve receipt is not proof the allowance is
 * sufficient: another tab could have spent it).
 */
export function useBatchAllowance(
  tokenAddress: HexAddress | undefined,
  owner: HexAddress | undefined,
  spender: HexAddress | undefined,
  enabled: boolean,
): BatchAllowance {
  const read = useReadContract({
    address: tokenAddress,
    abi: love20TokenAbi,
    functionName: 'allowance',
    args:
      owner !== undefined && spender !== undefined ? [owner, spender] : undefined,
    query: {
      enabled:
        enabled && tokenAddress !== undefined && owner !== undefined && spender !== undefined,
    },
  });

  return {
    value: typeof read.data === 'bigint' ? read.data : undefined,
    isLoading: read.isLoading,
    isFetching: read.isFetching,
    isError: read.isError,
    refetch: () => {
      void read.refetch();
    },
  };
}

export type BatchAllowanceReader = (
  tokenAddress: HexAddress | undefined,
  owner: HexAddress | undefined,
  spender: HexAddress | undefined,
) => Promise<bigint | undefined>;

/**
 * Imperative allowance read used once a batch is mined: the receipt needs to
 * know whether the on-chain allowance still has a remainder (D7 — approving the
 * original total then submitting a smaller list leaves a residual approval).
 * `undefined` means "could not read", never 0.
 */
export function useBatchAllowanceReader(): BatchAllowanceReader {
  const client = usePublicClient();
  return useCallback<BatchAllowanceReader>(
    async (tokenAddress, owner, spender) => {
      if (client === undefined || tokenAddress === undefined || owner === undefined) {
        return undefined;
      }
      if (spender === undefined) return undefined;
      try {
        return await client.readContract({
          address: tokenAddress,
          abi: love20TokenAbi,
          functionName: 'allowance',
          args: [owner, spender],
        });
      } catch {
        return undefined;
      }
    },
    [client],
  );
}
