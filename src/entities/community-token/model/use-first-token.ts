import { useMemo } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';

export type FirstTokenStatus = 'disconnected' | 'unconfigured' | 'loading' | 'ready' | 'error';

export interface FirstToken {
  readonly status: FirstTokenStatus;
  readonly address: HexAddress | undefined;
  /** Chain symbol, never a frontend constant. undefined until read. */
  readonly symbol: string | undefined;
  readonly name: string | undefined;
  readonly decimals: number | undefined;
  readonly balance: bigint | undefined;
  readonly refetch: () => void;
}

/**
 * The genesis token (首币) is the airdrop/mint unit and the home balance row.
 * Metadata + wallet balance are read in one Multicall3 batch; unknown values are
 * exposed as undefined so the page shows a skeleton or —, never 0.
 */
export function useFirstToken(): FirstToken {
  const { address: account } = useAccount();
  const address = configuredAddress('firstTokenAddress') ?? configuredAddress('tokenAddress');

  const contracts = useMemo(() => {
    if (address === undefined) return [];
    const base = [
      { address, abi: love20TokenAbi, functionName: 'name' as const },
      { address, abi: love20TokenAbi, functionName: 'symbol' as const },
      { address, abi: love20TokenAbi, functionName: 'decimals' as const },
    ];
    if (account === undefined) return base;
    return [
      ...base,
      {
        address,
        abi: love20TokenAbi,
        functionName: 'balanceOf' as const,
        args: [account] as const,
      },
    ];
  }, [account, address]);

  const read = useReadContracts({
    contracts,
    query: { enabled: address !== undefined },
  });

  const refetch = () => {
    read.refetch();
  };

  if (address === undefined) {
    return {
      status: 'unconfigured',
      address,
      symbol: undefined,
      name: undefined,
      decimals: undefined,
      balance: undefined,
      refetch,
    };
  }

  const results = read.data;
  const nameResult = results?.[0];
  const symbolResult = results?.[1];
  const decimalsResult = results?.[2];
  const balanceResult = results?.[3];
  const name =
    nameResult?.status === 'success' && typeof nameResult.result === 'string'
      ? nameResult.result
      : undefined;
  const symbol =
    symbolResult?.status === 'success' && typeof symbolResult.result === 'string'
      ? symbolResult.result
      : undefined;
  const decimals =
    decimalsResult?.status === 'success' && typeof decimalsResult.result === 'number'
      ? decimalsResult.result
      : undefined;
  const balance =
    balanceResult?.status === 'success' && typeof balanceResult.result === 'bigint'
      ? balanceResult.result
      : undefined;

  let status: FirstTokenStatus;
  if (read.isError) status = 'error';
  else if (read.isLoading || results === undefined) status = 'loading';
  else status = 'ready';

  return {
    status,
    address,
    symbol: symbol !== undefined && symbol.length > 0 ? symbol : undefined,
    name: name !== undefined && name.length > 0 ? name : undefined,
    decimals,
    balance,
    refetch,
  };
}
