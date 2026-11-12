import { getContractErrorMessage, extractRevertData, isUserRejection } from '@/shared/lib/errors';
import { isTxSendNonceError, isTxStaleBlockError } from '@/shared/lib/tx-send-errors';
import { copy } from '@/shared/config/copy-pages';

/**
 * AirdropDistributor custom errors are not part of the protocol error registry,
 * so the handful the claim can actually produce are mapped by selector. Signatures
 * from `export/abis/AirdropDistributor.json`:
 *   AirdropAlreadyClaimed(address,address)          → 0x3349f079
 *   InvalidProof()                                  → 0x09bde339
 *   ClaimRoundNotReached(address,uint256,uint256)   → 0xff978a22
 *   ShareExceedsRemaining(uint256,uint256)          → 0x079c232c
 *   TokenNotConfigured(address)                     → 0xa5be5e0f
 *   SafeERC20FailedOperation(address)               → 0x5274afe7
 */
const AIRDROP_ERRORS: Readonly<Record<string, string>> = Object.freeze({
  '0x3349f079': copy.airdrop.errors.alreadyClaimed,
  '0x09bde339': copy.airdrop.errors.invalidProof,
  '0xff978a22': copy.airdrop.errors.roundNotReached,
  '0x079c232c': copy.airdrop.errors.shareExceeds,
  '0xa5be5e0f': copy.airdrop.errors.tokenNotConfigured,
  '0x5274afe7': copy.airdrop.errors.tokenFailed,
});

/** Writes the result and the next step, never revert data or contract internals. */
export function describeAirdropClaimError(error: unknown): string {
  if (isUserRejection(error)) return copy.airdrop.errors.rejected;
  // A stale wallet nonce must never fall through to the generic retry copy.
  if (isTxSendNonceError(error)) return copy.txWatch.bodies.nonceGap;
  if (isTxStaleBlockError(error)) return copy.txWatch.staleBlock;

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
