import type { AirdropClaimReceipt } from '@/features/claim-airdrop/lib/airdrop-claim-record';
import type { AirdropClaimStatus } from '@/domain/airdrop-claim';

export type AirdropReceiptView = 'receipt' | 'claimed' | 'waiting';

/**
 * 空投铸造 receipt dismissal. Closing the sheet must land on the page's S6
 * 已铸造 state (the claimedAmount view), never back on the claim CTA. While the
 * post-receipt eligibility refetch is still in flight we show a loading card.
 */
export function selectAirdropReceiptView(
  receipt: AirdropClaimReceipt | null,
  dismissed: boolean,
  status: AirdropClaimStatus,
): AirdropReceiptView {
  if (receipt !== null && !dismissed) return 'receipt';
  if (status === 'claimed') return 'claimed';
  return 'waiting';
}
