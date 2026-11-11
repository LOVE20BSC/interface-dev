import { BaseError, ContractFunctionRevertedError } from 'viem';
import type { HexAddress } from '@/config/networks';
import { isSameAddress } from '@/shared/lib/format';

const MEMBER_ID_RE = /^#?(\d+)$/;
const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * 按身份 NFT: the input is a member `#id`, with or without the `#`.
 * Returns null for anything that is not a plain non-negative integer that fits
 * a uint256 (the input is never silently truncated or prefixed).
 */
export function parseMemberId(value: string): bigint | null {
  const match = MEMBER_ID_RE.exec(value.trim());
  if (match === null) return null;
  try {
    const memberId = BigInt(match[1] ?? '');
    return memberId <= MAX_UINT256 ? memberId : null;
  } catch {
    return null;
  }
}

export type MemberIdResolution =
  | { readonly status: 'ok'; readonly address: HexAddress; readonly memberId: bigint }
  | { readonly status: 'self' }
  | { readonly status: 'not-found' }
  | { readonly status: 'error' };

/**
 * ownerOf() reverts for a token that was never minted (ERC721NonexistentToken on
 * this contract). Any other read failure is treated as transient and retryable —
 * it must not claim the identity NFT does not exist.
 */
export function classifyOwnerOfError(error: unknown): 'not-found' | 'error' {
  if (error instanceof BaseError) {
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted !== null) return 'not-found';
  }
  return 'error';
}

/**
 * Resolve an identity NFT id to its current owner. The transfer itself still
 * calls safeTransferFrom(current, recipient, memberId) once; this is a read only.
 */
export async function resolveMemberRecipient(
  memberId: bigint,
  self: string | undefined,
  readOwner: (memberId: bigint) => Promise<string>,
): Promise<MemberIdResolution> {
  let owner: string;
  try {
    owner = await readOwner(memberId);
  } catch (error) {
    return { status: classifyOwnerOfError(error) };
  }
  if (self !== undefined && isSameAddress(owner, self)) return { status: 'self' };
  return { status: 'ok', address: owner as HexAddress, memberId };
}
