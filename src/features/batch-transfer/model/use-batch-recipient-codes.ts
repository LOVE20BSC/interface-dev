import { useQueries } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { NETWORK, type HexAddress } from '@/config/networks';

/**
 * Bytecode presence per unique recipient, read once per address.
 *
 * Two jobs: the page warns when a recipient is a contract ("转进合约的资产可能
 * 取不回来"), and the failure explanation uses it to tell 「第 N 行执行预算不够」
 * (plain wallet) apart from 「第 N 行收款方拒收」 (contract) — the batch contract
 * only reports which row failed, not why.
 */
export function useBatchRecipientCodes(
  addresses: readonly HexAddress[],
  enabled: boolean,
): readonly (boolean | undefined)[] {
  const client = usePublicClient();

  const queries = useQueries({
    queries: addresses.map((address) => ({
      queryKey: ['batch-recipient-code', NETWORK.chainId, address.toLowerCase()],
      queryFn: async () => {
        if (client === undefined) return undefined;
        const code = await client.getBytecode({ address });
        return code !== undefined && code !== '0x';
      },
      enabled: enabled && client !== undefined,
      staleTime: 30_000,
      retry: false,
    })),
  });

  return queries.map((query) => query.data);
}
