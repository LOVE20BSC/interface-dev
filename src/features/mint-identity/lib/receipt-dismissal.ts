import type { MintedIdentity } from '@/features/mint-identity/model/use-mint-transaction';

export type MintReceiptView = 'none' | 'receipt' | 'dismissed';

/**
 * The receipt is a page state (UX spec §4.3), but the owner can now collapse it
 * and stay on /mint. A newly mined identity has a new hash, so it opens again;
 * the dismissed state is scoped to the hash the user actually dismissed.
 */
export function selectMintReceiptView(
  receipt: MintedIdentity | null,
  dismissedHash: string | null,
): MintReceiptView {
  if (receipt === null) return 'none';
  return receipt.hash === dismissedHash ? 'dismissed' : 'receipt';
}

export interface MintPostDismissState {
  /** The form starts over: a refreshed quote can never re-submit the minted name. */
  readonly name: '';
  readonly memberId: bigint;
  readonly nameOnChain: string;
}

/** Post-dismiss page state: compact strip data + reset form. */
export function mintPostDismiss(receipt: MintedIdentity): MintPostDismissState {
  return { name: '', memberId: receipt.memberId, nameOnChain: receipt.name };
}
