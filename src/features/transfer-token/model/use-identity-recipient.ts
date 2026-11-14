import { useReadContract } from 'wagmi';
import { memberNftAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import {
  useMemberRecipient,
  type MemberRecipientStatus,
} from '@/features/transfer-identity/model/use-member-recipient';
import { useMemberNameRecipient } from '@/features/transfer-identity/model/use-member-name-recipient';

export type IdentityRecipientStatus = MemberRecipientStatus;

/**
 * Which identity NFT input the user picked in the 收款方 dropdown. The mode is
 * explicit, never inferred from the text: a pure-digit name that someone
 * registered must not be read as an id (owner 2026-11-14).
 */
export type IdentityRecipientMode = 'id' | 'name';

export interface IdentityRecipientState {
  readonly status: IdentityRecipientStatus;
  readonly memberId: bigint | null;
  readonly name: string | null;
  readonly address: HexAddress | null;
  /**
   * D7: id mode resolves `ownerOf` before `memberName`; the confirmation gate
   * must not become tickable/submittable while the canonical name is pending
   * (slow RPC would let a user confirm an id they cannot disambiguate).
   */
  readonly namePending: boolean;
  readonly retry: () => void;
}

const IDLE: IdentityRecipientState = {
  status: 'idle',
  memberId: null,
  name: null,
  address: null,
  namePending: false,
  retry: () => {},
};

/**
 * 按身份 NFT recipient for a token transfer. `mode: 'id'` resolves the typed
 * `#id` / digits through `ownerOf(id)`; `mode: 'name'` resolves the typed name
 * through `memberId(name)` and never falls back to id parsing. Both resolve to
 * the current `ownerOf(id)` address, and the confirmation gate shows id +
 * canonical name + address before the CTA can be pressed (same rule as
 * 转让身份 NFT). Resolution itself is shared with the identity-transfer feature —
 * this hook only composes it.
 */
export function useIdentityRecipient(
  memberNftAddress: HexAddress | undefined,
  input: string,
  active: boolean,
  selfAddress: string | undefined,
  mode: IdentityRecipientMode,
): IdentityRecipientState {
  const trimmed = input.trim();
  const idMode = mode === 'id';

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
    return {
      status: 'error',
      memberId: null,
      name: null,
      address: null,
      namePending: false,
      retry: () => {},
    };
  }

  if (idMode) {
    const name = typeof canonicalName.data === 'string' ? canonicalName.data : null;
    const namePending =
      byId.status === 'ok' && byId.memberId !== null && canonicalName.isLoading === true;
    return {
      status: byId.status,
      memberId: byId.memberId,
      name,
      address: byId.address,
      namePending,
      retry: byId.retry,
    };
  }

  return {
    status: byName.status,
    memberId: byName.memberId,
    name: byName.name,
    address: byName.address,
    // The name IS the lookup key in this mode: nothing else to wait for.
    namePending: false,
    retry: byName.retry,
  };
}
