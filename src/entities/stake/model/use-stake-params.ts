import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { stakeAbi } from '@/config/abis';
import { configuredAddress } from '@/config/networks';

export type StakeParamsStatus = 'unconfigured' | 'loading' | 'error' | 'ready';

export interface StakeParams {
  readonly status: StakeParamsStatus;
  /** `PROMISED_WAITING_PHASES_MIN`：承诺解锁期的下限（阶段数）。 */
  readonly minPhases: bigint | undefined;
  /** `PROMISED_WAITING_PHASES_MAX`：承诺解锁期的上限（阶段数）。 */
  readonly maxPhases: bigint | undefined;
  /** `FEE_SETTLEMENT_RATIO`：手续费结算比例（1e18 = 100%），只用于说明文案。 */
  readonly feeSettlementRatio: bigint | undefined;
  readonly refetch: () => void;
}

/**
 * 质押合约的公共参数（部署期常量，运行期不变）。
 *
 * 页面用它们做两件事：约束承诺解锁期的输入范围、把「手续费的一部分用于回购
 * 销毁」写成真实比例。读不到时保持 `undefined`：页面显示「读取中…」或省略这
 * 一行，绝不先渲染 0（AGENTS.md 硬规则 4）。
 */
export function useStakeParams(): StakeParams {
  const stake = configuredAddress('stake');

  const contracts = useMemo(
    () =>
      stake === undefined
        ? []
        : [
            {
              address: stake,
              abi: stakeAbi,
              functionName: 'PROMISED_WAITING_PHASES_MIN' as const,
            },
            {
              address: stake,
              abi: stakeAbi,
              functionName: 'PROMISED_WAITING_PHASES_MAX' as const,
            },
            { address: stake, abi: stakeAbi, functionName: 'FEE_SETTLEMENT_RATIO' as const },
          ],
    [stake],
  );

  const read = useReadContracts({ contracts, query: { enabled: stake !== undefined } });

  const valueAt = (index: number): bigint | undefined => {
    const entry = read.data?.[index];
    return entry?.status === 'success' && typeof entry.result === 'bigint'
      ? entry.result
      : undefined;
  };

  const refetch = () => {
    // refetch() ignores `enabled` (frontend-standards §10.1): waking a disabled
    // read would only replay a missing-argument error.
    if (stake !== undefined) read.refetch();
  };

  let status: StakeParamsStatus;
  if (stake === undefined) status = 'unconfigured';
  else if (read.isError) status = 'error';
  else if (read.isLoading) status = 'loading';
  else status = 'ready';

  return {
    status,
    minPhases: valueAt(0),
    maxPhases: valueAt(1),
    feeSettlementRatio: valueAt(2),
    refetch,
  };
}
