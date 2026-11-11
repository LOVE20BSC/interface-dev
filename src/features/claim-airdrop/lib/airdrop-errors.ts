import { getContractErrorMessage, extractRevertData, isUserRejection } from '@/shared/lib/errors';
import { copy } from '@/shared/config/copy';

/**
 * Airdrop custom errors are not part of the protocol error registry, so the
 * handful the claim can actually produce are mapped by selector. Signatures
 * from the vendored contract ABI:
 *   AirdropAlreadyClaimed()                  → 0xe4ca4c0b
 *   InvalidAccount()                         → 0x6d187b28
 *   InvalidProof()                           → 0x09bde339
 *   InvalidShare()                           → 0x100d5f74
 *   NoClaimableAmount()                      → 0x493c1ab7
 *   ShareExceedsRemaining(uint256,uint256)   → 0x079c232c
 *   UnauthorizedClaimer()                    → 0x5c4aa7dc
 *   InvalidToken()                           → 0xc1ab6dc1
 *   SafeERC20FailedOperation(address)        → 0x5274afe7
 */
const AIRDROP_ERRORS: Readonly<Record<string, string>> = Object.freeze({
  '0xe4ca4c0b': copy.airdrop.errors.alreadyClaimed,
  '0x6d187b28': copy.airdrop.errors.unauthorized,
  '0x09bde339': copy.airdrop.errors.invalidProof,
  '0x100d5f74': copy.airdrop.errors.invalidShare,
  '0x493c1ab7': copy.airdrop.errors.noAmount,
  '0x079c232c': copy.airdrop.errors.shareExceeds,
  '0x5c4aa7dc': copy.airdrop.errors.unauthorized,
  '0xc1ab6dc1': copy.airdrop.errors.generic,
  '0x5274afe7': copy.airdrop.errors.tokenFailed,
});

/** Writes the result and the next step, never revert data or contract internals. */
export function describeAirdropClaimError(error: unknown): string {
  if (isUserRejection(error)) return copy.airdrop.errors.rejected;

  const data = extractRevertData(error);
  if (data !== null) {
    const selector = data.slice(0, 10).toLowerCase();
    const specific = AIRDROP_ERRORS[selector];
    if (specific !== undefined) return specific;
    const mapped = getContractErrorMessage(selector);
    if (mapped !== null) return mapped;
  }

  return copy.airdrop.errors.generic;
}
