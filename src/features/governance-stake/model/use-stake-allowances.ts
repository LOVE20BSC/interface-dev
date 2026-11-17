import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';

export type StakeAllowanceStatus = 'idle' | 'loading' | 'error' | 'ready';

export interface StakeAllowance {
  readonly status: StakeAllowanceStatus;
  /** 与 `tokens` 入参同序的授权额度；未知项为 undefined。 */
  readonly allowances: readonly (bigint | undefined)[];
  readonly refetch: () => void;
}

/**
 * 质押合约（spender）在几枚代币上的授权额度。
 *
 * 流动性质押要两枚（社区代币 + 父币），加速质押只要社区代币，所以入参是数组。
 * 读不到额度时页面显示「读取授权额度中…」并禁用主按钮，不给「已授权」的假象。
 */
export function useStakeAllowances(
  owner: HexAddress | undefined,
  spender: HexAddress | undefined,
  tokens: readonly HexAddress[],
): StakeAllowance {
  const enabled = owner !== undefined && spender !== undefined && tokens.length > 0;
  // tokens 数组每次渲染都是新引用：用拼接后的 key 当 memo 依赖，避免每次渲染都重建
  // 查询数组（wagmi 会按 queryKey 去重，但没必要制造新对象）。
  const tokenKey = tokens.join('|');

  const contracts = useMemo(() => {
    if (!enabled || owner === undefined || spender === undefined) return [];
    return tokenKey
      .split('|')
      .filter((entry) => entry.length > 0)
      .map((token) => ({
        address: token as HexAddress,
        abi: love20TokenAbi,
        functionName: 'allowance' as const,
        args: [owner, spender] as const,
      }));
  }, [enabled, owner, spender, tokenKey]);

  const read = useReadContracts({ contracts, query: { enabled } });

  const refetch = () => {
    if (enabled) read.refetch();
  };

  const allowances = tokens.map((_, index) => {
    const entry = read.data?.[index];
    return entry?.status === 'success' && typeof entry.result === 'bigint'
      ? entry.result
      : undefined;
  });

  if (!enabled) return { status: 'idle', allowances, refetch };

  let status: StakeAllowanceStatus = 'ready';
  if (read.isLoading) status = 'loading';
  else if (read.isError || read.data?.some((entry) => entry.status === 'failure')) status = 'error';

  return { status, allowances, refetch };
}
