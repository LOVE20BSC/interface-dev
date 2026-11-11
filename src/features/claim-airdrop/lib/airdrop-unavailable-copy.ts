import type { AirdropClaimUnavailableReason } from '@/domain/airdrop-claim';
import { copy } from '@/shared/config/copy-pages';

export interface AirdropUnavailableCopy {
  readonly title: string;
  readonly body: string;
}

/**
 * S4 never collapses to one "无空投" sentence: the pool being empty, a zero
 * share, an over-large share and a floor-to-zero amount are different results
 * with different next steps. Kept as a pure mapping so the copy is unit-tested
 * even though the local chain cannot cheaply produce every branch in e2e.
 */
export function airdropUnavailableCopy(
  reason: AirdropClaimUnavailableReason,
): AirdropUnavailableCopy {
  switch (reason) {
    case 'pool-empty':
      return {
        title: copy.airdrop.unavailable.poolEmptyTitle,
        body: copy.airdrop.unavailable.poolEmptyBody,
      };
    case 'share-zero':
      return {
        title: copy.airdrop.unavailable.shareZeroTitle,
        body: copy.airdrop.unavailable.shareZeroBody,
      };
    case 'share-exceeds-remaining':
      return {
        title: copy.airdrop.unavailable.shareExceedsTitle,
        body: copy.airdrop.unavailable.shareExceedsBody,
      };
    case 'zero-amount':
    default:
      return {
        title: copy.airdrop.unavailable.zeroAmountTitle,
        body: copy.airdrop.unavailable.zeroAmountBody,
      };
  }
}
