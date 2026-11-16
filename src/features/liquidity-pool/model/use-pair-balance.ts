import { useReadContract } from 'wagmi';
import { uniswapV2PairAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';

/**
 * 任意地址的 LP 凭证余额：`pair.balanceOf(address)`（pair 本身就是 ERC20）。
 *
 * 社区流动性查询的「任意地址」就是这一个读：地址可以不是当前钱包、也可以是合约
 * （质押合约、财库）。纯 `eth_call`，未连接钱包同样可读，不签任何交易。
 *
 * 储备与 `totalSupply` 不在这里读第二遍：查询页复用 `usePoolState` 的池子快照，
 * 这样「交易对统计」与「查询结果」永远是同一块区块上的同一份数据。
 */
export interface PairBalanceResult {
  readonly balance: bigint | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => void;
}

export function usePairBalance(
  pairAddress: HexAddress | undefined,
  address: HexAddress | undefined,
): PairBalanceResult {
  const enabled = pairAddress !== undefined && address !== undefined;
  const read = useReadContract({
    address: pairAddress,
    abi: uniswapV2PairAbi,
    functionName: 'balanceOf',
    args: enabled ? [address] : undefined,
    query: { enabled },
  });
  return {
    balance: read.data,
    isLoading: enabled && read.isLoading,
    isError: read.isError,
    refetch: () => {
      void read.refetch();
    },
  };
}
