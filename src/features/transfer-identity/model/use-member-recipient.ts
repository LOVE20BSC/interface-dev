import { useReadContract } from 'wagmi';
import { memberNftAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { isSameAddress } from '@/shared/lib/format';
import {
  classifyOwnerOfError,
  parseMemberId,
} from '@/features/transfer-identity/lib/member-recipient';

export type MemberRecipientStatus =
  'idle' | 'invalid' | 'reading' | 'ok' | 'self' | 'not-found' | 'error';

export interface MemberRecipientState {
  readonly status: MemberRecipientStatus;
  readonly memberId: bigint | null;
  readonly address: HexAddress | null;
  /** Retry the ownerOf() read after a transient failure. */
  readonly retry: () => void;
}

/**
 * 按身份 NFT resolver: a member id is read through ownerOf() (the same read the
 * identity cache validates against) and the resolved owner is the recipient.
 * No transaction is prepared here; safeTransferFrom stays the single write.
 */
export function useMemberRecipient(
  memberNftAddress: HexAddress | undefined,
  input: string,
  active: boolean,
  selfAddress: string | undefined,
): MemberRecipientState {
  const memberId = parseMemberId(input);
  const enabled = active && memberNftAddress !== undefined && memberId !== null;
  const read = useReadContract({
    address: memberNftAddress,
    abi: memberNftAbi,
    functionName: 'ownerOf',
    args: memberId !== null ? [memberId] : undefined,
    query: { enabled, retry: false },
  });

  const retry = () => {
    if (enabled) void read.refetch();
  };

  if (!active || input.trim() === '') {
    return { status: 'idle', memberId: null, address: null, retry };
  }
  if (memberId === null) {
    return { status: 'invalid', memberId: null, address: null, retry };
  }
  if (memberNftAddress === undefined) {
    return { status: 'error', memberId, address: null, retry };
  }
  if (read.data !== undefined) {
    const address = read.data as HexAddress;
    return {
      status: selfAddress !== undefined && isSameAddress(address, selfAddress) ? 'self' : 'ok',
      memberId,
      address,
      retry,
    };
  }
  if (read.isFetching || read.isLoading) {
    return { status: 'reading', memberId, address: null, retry };
  }
  if (read.isError) {
    return {
      status: classifyOwnerOfError(read.error),
      memberId,
      address: null,
      retry,
    };
  }
  return { status: 'reading', memberId, address: null, retry };
}
