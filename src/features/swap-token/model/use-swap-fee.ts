import { useReadContracts } from 'wagmi';
import { stakeAbi } from '@/config/abis';
import { configuredAddress, type HexAddress } from '@/config/networks';
import { computeSwapFee } from '@/features/swap-token/lib/swap-fee';

export interface SwapFeeState {
  /**
   * Two-decimal fee percent text (`0.30`), read from `Stake` and computed by
   * `computeSwapFee`. `undefined` when the environment has no Stake, when either
   * getter fails, or when the profile is invalid — the page then says
   * 以链上费率为准 instead of printing a made-up number.
   */
  readonly percent: string | undefined;
}

function bigintResult(entry: { status: string; result?: unknown } | undefined): bigint | undefined {
  return entry?.status === 'success' && typeof entry.result === 'bigint' ? entry.result : undefined;
}

/**
 * One Multicall3 batch for the swap fee profile (`SWAP_FEE_FOR_LP_RATIO` +
 * `SWAP_FEE_FOR_PROTOCOL_RATIO` on `Stake`). Reads are wallet-independent, so the
 * row is populated even before a wallet connects; the values never change after
 * `Stake` construction, hence the long stale time.
 */
export function useSwapFee(): SwapFeeState {
  const stake: HexAddress | undefined = configuredAddress('stake');
  const contracts =
    stake !== undefined
      ? [
          { address: stake, abi: stakeAbi, functionName: 'SWAP_FEE_FOR_LP_RATIO' as const },
          { address: stake, abi: stakeAbi, functionName: 'SWAP_FEE_FOR_PROTOCOL_RATIO' as const },
        ]
      : [];

  const read = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0, staleTime: 5 * 60_000 },
  });

  const lpRatio = bigintResult(read.data?.[0]);
  const protocolRatio = bigintResult(read.data?.[1]);
  const fee =
    lpRatio !== undefined && protocolRatio !== undefined
      ? computeSwapFee({ lpRatio, protocolRatio })
      : undefined;

  return { percent: fee?.percent };
}
