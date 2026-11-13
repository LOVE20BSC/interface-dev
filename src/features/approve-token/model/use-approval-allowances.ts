import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import type { ApprovalSpender } from '@/features/approve-token/lib/approval-spenders';

/**
 * One multicall for every visible spender (known list + the optional custom
 * address). The map is keyed by lower-cased spender so the page can render a
 * row without caring whether it came from the address book or the input.
 */
export interface ApprovalAllowances {
  readonly byAddress: ReadonlyMap<string, bigint>;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

export function useApprovalAllowances(
  tokenAddress: HexAddress | undefined,
  owner: HexAddress | undefined,
  spenders: readonly ApprovalSpender[],
  extraSpender: HexAddress | undefined,
  enabled: boolean,
): ApprovalAllowances {
  const addresses = useMemo(() => {
    const seen = new Set<string>();
    const list: HexAddress[] = [];
    const push = (address: HexAddress) => {
      const key = address.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push(address);
    };
    for (const spender of spenders) push(spender.address);
    if (extraSpender !== undefined) push(extraSpender);
    return list;
  }, [extraSpender, spenders]);

  const contracts = useMemo(
    () =>
      tokenAddress === undefined || owner === undefined
        ? []
        : addresses.map((address) => ({
            address: tokenAddress,
            abi: love20TokenAbi,
            functionName: 'allowance' as const,
            args: [owner, address] as const,
          })),
    [addresses, owner, tokenAddress],
  );

  const read = useReadContracts({
    contracts,
    query: { enabled: enabled && contracts.length > 0 },
  });

  const byAddress = useMemo(() => {
    const map = new Map<string, bigint>();
    addresses.forEach((address, index) => {
      const result = read.data?.[index];
      if (result?.status === 'success' && typeof result.result === 'bigint') {
        map.set(address.toLowerCase(), result.result);
      }
    });
    return map;
  }, [addresses, read.data]);

  return {
    byAddress,
    isLoading: contracts.length > 0 && read.isLoading,
    isError: read.isError,
    refetch: () => {
      void read.refetch();
    },
  };
}
