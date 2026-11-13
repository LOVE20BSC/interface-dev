import { useReadContract } from 'wagmi';
import { love20TokenAbi, uniswapV2PairAbi } from '@/config/abis';
import { useBalance } from 'wagmi';
import type { HexAddress } from '@/config/networks';
import type { LiquidityToken } from '@/features/liquidity-pool/lib/liquidity-types';

/**
 * 余额与授权读数。所有写操作前都要先知道「够不够」与「要不要先允许」，
 * 所以这些读取集中在这里，页面只消费结果。
 */

export interface AmountRead {
  readonly value: bigint | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

export interface TokenBalanceResult extends AmountRead {
  readonly decimals: number | undefined;
}

/** 原生币余额（ETH 余额，不含 gas 预留）。 */
export function useNativeBalance(account: HexAddress | undefined): AmountRead {
  const read = useBalance({ address: account, query: { enabled: account !== undefined } });
  return {
    value: read.data?.value,
    isLoading: read.isLoading,
    isError: read.isError,
    refetch: () => {
      void read.refetch();
    },
  };
}

/** ERC20 余额。 */
export function useTokenBalance(
  token: LiquidityToken | undefined,
  account: HexAddress | undefined,
): TokenBalanceResult {
  const address = token?.address;
  const read = useReadContract({
    address,
    abi: love20TokenAbi,
    functionName: 'balanceOf',
    args: account !== undefined ? [account] : undefined,
    query: { enabled: address !== undefined && account !== undefined },
  });
  return {
    value: read.data,
    decimals: token?.decimals,
    isLoading: read.isLoading,
    isError: read.isError,
    refetch: () => {
      void read.refetch();
    },
  };
}

/** ERC20 授权额度；spender 可以是 Hub 或 Router。 */
export function useTokenAllowance(
  tokenAddress: HexAddress | undefined,
  owner: HexAddress | undefined,
  spender: HexAddress | undefined,
): AmountRead {
  const read = useReadContract({
    address: tokenAddress,
    abi: love20TokenAbi,
    functionName: 'allowance',
    args: owner !== undefined && spender !== undefined ? [owner, spender] : undefined,
    query: { enabled: tokenAddress !== undefined && owner !== undefined && spender !== undefined },
  });
  return {
    value: read.data,
    isLoading: read.isLoading,
    isError: read.isError,
    refetch: () => {
      void read.refetch();
    },
  };
}

/** LP 凭证（pair 本身就是 ERC20）授权给 Router 的额度。 */
export function useLpAllowance(
  pairAddress: HexAddress | undefined,
  owner: HexAddress | undefined,
  spender: HexAddress | undefined,
): AmountRead {
  const read = useReadContract({
    address: pairAddress,
    abi: uniswapV2PairAbi,
    functionName: 'allowance',
    args: owner !== undefined && spender !== undefined ? [owner, spender] : undefined,
    query: { enabled: pairAddress !== undefined && owner !== undefined && spender !== undefined },
  });
  return {
    value: read.data,
    isLoading: read.isLoading,
    isError: read.isError,
    refetch: () => {
      void read.refetch();
    },
  };
}
