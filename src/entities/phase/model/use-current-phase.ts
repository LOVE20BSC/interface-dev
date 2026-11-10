import { useReadContract } from 'wagmi';
import { phaseAbi } from '@/config/abis';
import { configuredAddress } from '@/config/networks';

export type PhaseStatus = 'unconfigured' | 'loading' | 'ready' | 'error';

export interface CurrentPhase {
  readonly status: PhaseStatus;
  readonly phase: bigint | undefined;
  readonly refetch: () => void;
}

/** Phase is a time slice, never a "round". Advanced view only. */
export function useCurrentPhase(): CurrentPhase {
  const phaseAddress = configuredAddress('phase');
  const read = useReadContract({
    address: phaseAddress,
    abi: phaseAbi,
    functionName: 'currentPhase',
    query: { enabled: phaseAddress !== undefined },
  });

  const refetch = () => {
    read.refetch();
  };

  if (phaseAddress === undefined) return { status: 'unconfigured', phase: undefined, refetch };
  if (read.isError) return { status: 'error', phase: undefined, refetch };
  if (read.data === undefined) return { status: 'loading', phase: undefined, refetch };
  return { status: 'ready', phase: read.data, refetch };
}
