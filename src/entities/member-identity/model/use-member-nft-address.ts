import { useReadContract } from 'wagmi';
import { memberNftAddressAbi } from '@/config/abis';
import {
  configuredAddress,
  isConfiguredAddress,
  seedCoreAddress,
  type HexAddress,
} from '@/config/networks';

export type MemberNftResolution = 'configured' | 'resolving' | 'unconfigured' | 'error';

export interface MemberNftAddressState {
  readonly address: HexAddress | undefined;
  readonly status: MemberNftResolution;
  readonly refetch: () => void;
}

/**
 * Resolve the single global MemberNFT from the environment package:
 * explicit memberNFT wins; otherwise ask any configured core contract's
 * MEMBER_NFT_ADDRESS() getter (ADR-0003 §2). Never asks the user for an address.
 */
export function useMemberNftAddress(): MemberNftAddressState {
  const configured = configuredAddress('memberNFT');
  const seed = seedCoreAddress();
  const read = useReadContract({
    address: seed,
    abi: memberNftAddressAbi,
    functionName: 'MEMBER_NFT_ADDRESS',
    query: { enabled: configured === undefined && seed !== undefined },
  });

  const refetch = () => {
    if (configured === undefined && seed !== undefined) read.refetch();
  };

  if (configured !== undefined) {
    return { address: configured, status: 'configured', refetch };
  }
  if (seed === undefined) {
    return { address: undefined, status: 'unconfigured', refetch };
  }
  if (isConfiguredAddress(read.data)) {
    return { address: read.data, status: 'configured', refetch };
  }
  if (read.isError) {
    return { address: undefined, status: 'error', refetch };
  }
  if (read.isSuccess) {
    return { address: undefined, status: 'unconfigured', refetch };
  }
  return { address: undefined, status: 'resolving', refetch };
}
