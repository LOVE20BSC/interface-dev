import { useReadContract } from 'wagmi';
import { memberNftAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { parseMemberId } from '@/features/transfer-identity/lib/member-recipient';
import {
  useMemberRecipient,
  type MemberRecipientStatus,
} from '@/features/transfer-identity/model/use-member-recipient';
import { useMemberNameRecipient } from '@/features/transfer-identity/model/use-member-name-recipient';

export type IdentityRecipientStatus = MemberRecipientStatus;

export interface IdentityRecipientState {
  readonly status: IdentityRecipientStatus;
  readonly memberId: bigint | null;
  readonly name: string | null;
  readonly address: HexAddress | null;
  readonly retry: () => void;
}

const IDLE: IdentityRecipientState = {
  status: 'idle',
  memberId: null,
  name: null,
  address: null,
  retry: () => {},
};

/**
 * 按身份 NFT recipient for a token transfer. Accepts either a member id
 * (`#12`) or a member name; both resolve to the current `ownerOf(id)` address,
 * and the confirmation gate shows id + canonical name + address before the CTA
 * can be pressed (same rule as 转让身份 NFT). Resolution itself is shared with
 * the identity-transfer feature — this hook only composes it.
 */
export function useIdentityRecipient(
  memberNftAddress: HexAddress | undefined,
  input: string,
  active: boolean,
  selfAddress: string | undefined,
): IdentityRecipientState {
  const trimmed = input.trim();
  const memberId = parseMemberId(trimmed);
  const idMode = memberId !== null;

  const byId = useMemberRecipient(memberNftAddress, input, active && idMode, selfAddress);
  const byName = useMemberNameRecipient(memberNftAddress, input, active && !idMode, selfAddress);

  const canonicalName = useReadContract({
    address: memberNftAddress,
    abi: memberNftAbi,
    functionName: 'memberName',
    args: byId.memberId !== null ? [byId.memberId] : undefined,
    query: {
      enabled: active && idMode && byId.status === 'ok' && byId.memberId !== null,
      retry: false,
    },
  });

  if (!active || trimmed.length === 0) return IDLE;
  if (memberNftAddress === undefined) {
    return { status: 'error', memberId, name: null, address: null, retry: () => {} };
  }

  if (idMode) {
    const name = typeof canonicalName.data === 'string' ? canonicalName.data : null;
    return {
      status: byId.status,
      memberId: byId.memberId,
      name,
      address: byId.address,
      retry: byId.retry,
    };
  }

  return {
    status: byName.status,
    memberId: byName.memberId,
    name: byName.name,
    address: byName.address,
    retry: byName.retry,
  };
}
