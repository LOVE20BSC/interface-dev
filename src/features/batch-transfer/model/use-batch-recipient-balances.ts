import { useCallback, useMemo } from 'react';
import { usePublicClient, useReadContract } from 'wagmi';
import { batchTransferAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import type { BatchMode } from '@/features/batch-transfer/lib/batch-types';

export interface BatchRecipientBalances {
  /** Aligned to the requested address array; `undefined` while loading/unreadable. */
  readonly values: readonly (bigint | undefined)[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

function toValues(
  data: readonly bigint[] | undefined,
  length: number,
): readonly (bigint | undefined)[] {
  if (data === undefined) return Array.from({ length }, () => undefined);
  return Array.from({ length }, (_, index) => data[index]);
}

/**
 * Pre-submit recipient balances (三线校验要求：提交前用 `nativeBalances` /
 * `erc20Balances` 展示预余额). One contract read for the whole batch, not one per
 * row. The same call is exposed as an imperative reader below so the receipt can
 * re-read the exact same addresses after the transaction is mined.
 */
export function useBatchRecipientBalances(
  mode: BatchMode,
  tokenAddress: HexAddress | undefined,
  addresses: readonly HexAddress[],
  batchTransfer: HexAddress | undefined,
  enabled: boolean,
): BatchRecipientBalances {
  const nativeRead = useReadContract({
    address: batchTransfer,
    abi: batchTransferAbi,
    functionName: 'nativeBalances',
    args: [addresses],
    query: {
      enabled: enabled && mode === 'native' && batchTransfer !== undefined && addresses.length > 0,
    },
  });
  const tokenRead = useReadContract({
    address: batchTransfer,
    abi: batchTransferAbi,
    functionName: 'erc20Balances',
    args: tokenAddress !== undefined ? [tokenAddress, addresses] : undefined,
    query: {
      enabled:
        enabled &&
        mode === 'token' &&
        batchTransfer !== undefined &&
        tokenAddress !== undefined &&
        addresses.length > 0,
    },
  });

  const active = mode === 'native' ? nativeRead : tokenRead;
  const data = active.data as readonly bigint[] | undefined;

  return {
    values: toValues(data, addresses.length),
    isLoading: addresses.length > 0 && active.isLoading,
    isError: active.isError,
    refetch: () => {
      void active.refetch();
    },
  };
}

export type BatchBalanceReader = (
  mode: BatchMode,
  tokenAddress: HexAddress | undefined,
  batchTransfer: HexAddress | undefined,
  addresses: readonly HexAddress[],
) => Promise<readonly (bigint | undefined)[]>;

/**
 * Imperative re-read used when a batch is mined: returns aligned wei values and
 * `undefined` for any row that could not be read (the receipt then shows 「—」,
 * never a fabricated 0).
 */
export function useBatchBalanceReader(): BatchBalanceReader {
  const client = usePublicClient();
  return useCallback<BatchBalanceReader>(
    async (mode, tokenAddress, batchTransfer, addresses) => {
      const unread = addresses.map(() => undefined);
      if (client === undefined || batchTransfer === undefined || addresses.length === 0) {
        return unread;
      }
      try {
        if (mode === 'native') {
          const balances = await client.readContract({
            address: batchTransfer,
            abi: batchTransferAbi,
            functionName: 'nativeBalances',
            args: [addresses],
          });
          return addresses.map((_, index) => balances[index]);
        }
        if (tokenAddress === undefined) return unread;
        const balances = await client.readContract({
          address: batchTransfer,
          abi: batchTransferAbi,
          functionName: 'erc20Balances',
          args: [tokenAddress, addresses],
        });
        return addresses.map((_, index) => balances[index]);
      } catch {
        return unread;
      }
    },
    [client],
  );
}

/** Stable list of unique recipient addresses for the read hooks above. */
export function useBatchAddresses(rows: readonly { readonly address: HexAddress }[]): readonly HexAddress[] {
  return useMemo(() => rows.map((row) => row.address), [rows]);
}
