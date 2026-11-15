import type { MintedIdentity } from '@/features/mint-identity/model/use-mint-transaction';

/** History state `/mint` hands to `/my-nft` after the receipt is confirmed. */
export interface MintHandoffState {
  readonly mintedMemberId: string;
  readonly mintedName: string;
}

/**
 * Owner 2026-11-16: 铸造完成后回到我的 NFT. The route state carries the identity
 * the receipt just showed, so 我的 NFT can refetch past its 15 s read cache and
 * highlight exactly that row. Strings only — history state must be structured-
 * clone safe (no bigint).
 */
export function mintHandoffState(receipt: MintedIdentity): MintHandoffState {
  return { mintedMemberId: receipt.memberId.toString(), mintedName: receipt.name };
}
