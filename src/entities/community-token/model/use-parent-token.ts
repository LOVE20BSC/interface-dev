import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import { isConfiguredAddress, type HexAddress } from '@/config/networks';

export type ParentTokenStatus = 'idle' | 'loading' | 'error' | 'ready';

export interface ParentToken {
  readonly status: ParentTokenStatus;
  readonly address: HexAddress | undefined;
  readonly symbol: string | undefined;
  readonly decimals: number | undefined;
  readonly refetch: () => void;
}

/**
 * 当前社区代币的**父币**：`LOVE20Token.PARENT_TOKEN_ADDRESS()` 指向的那枚 ERC20。
 *
 * 流动性/加速质押的另一侧存的是它，不是「包装原生币」的同义词：只有根代币
 * （首币）的父币才是 WETH/WBNB，子币的父币是父社区代币。页面原先直接取地址簿
 * 的 `weth`，在子币社区会读错余额与授权（复核 P3），所以这里按合约的父币指针读，
 * 读不到才由调用方退回地址簿的 `weth`。
 */
export function useParentToken(tokenAddress: HexAddress | undefined): ParentToken {
  const parentRead = useReadContract({
    address: tokenAddress,
    abi: love20TokenAbi,
    functionName: 'PARENT_TOKEN_ADDRESS',
    query: { enabled: tokenAddress !== undefined },
  });

  const address = isConfiguredAddress(parentRead.data) ? parentRead.data : undefined;

  const contracts = useMemo(
    () =>
      address === undefined
        ? []
        : [
            { address, abi: love20TokenAbi, functionName: 'symbol' as const },
            { address, abi: love20TokenAbi, functionName: 'decimals' as const },
          ],
    [address],
  );
  const metaRead = useReadContracts({ contracts, query: { enabled: address !== undefined } });

  const refetch = () => {
    if (tokenAddress !== undefined) parentRead.refetch();
    if (address !== undefined) metaRead.refetch();
  };

  if (tokenAddress === undefined) {
    return { status: 'idle', address: undefined, symbol: undefined, decimals: undefined, refetch };
  }

  const symbolEntry = metaRead.data?.[0];
  const decimalsEntry = metaRead.data?.[1];
  const symbol =
    symbolEntry?.status === 'success' && typeof symbolEntry.result === 'string'
      ? symbolEntry.result
      : undefined;
  const decimals =
    decimalsEntry?.status === 'success' && typeof decimalsEntry.result === 'number'
      ? decimalsEntry.result
      : undefined;

  let status: ParentTokenStatus = 'ready';
  if (parentRead.isLoading || (address !== undefined && metaRead.isLoading)) status = 'loading';
  else if (parentRead.isError || metaRead.isError) status = 'error';

  return { status, address, symbol, decimals, refetch };
}
