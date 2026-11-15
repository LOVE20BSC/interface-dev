/**
 * Chain + wallet ownership of a pending transaction — the rule behind the
 * owner-reported P1 「切钱包后用新账户重放旧账户请求」.
 *
 * A pending task is always signed by *some* wallet on *some* chain. When the
 * user switches wallets (or networks) while a task is in flight, every record
 * that was written for the old owner must become unusable: signing the old
 * request with the new account spends the new account's assets for the old
 * owner's intent (the liquidity `to` argument makes this especially dangerous).
 *
 * Persisted tasks are already namespaced by `{chainId, wallet}` in
 * `shared/lib/cache.ts`; storing the owner *inside* the record as well means a
 * record that is read through the wrong scope (or hand-edited) can still be
 * rejected instead of signed.
 */

import type { HexAddress } from '@/config/networks';

export interface TxOwner {
  readonly chainId: number;
  readonly account: HexAddress;
}

/**
 * True when both sides name the same chain and the same wallet.
 *
 * Addresses compare case-insensitively: the cache lower-cases them and a wallet
 * may hand back a checksummed form, which must not look like another account.
 */
export function isSameTxOwner(a: TxOwner, b: TxOwner): boolean {
  return a.chainId === b.chainId && a.account.toLowerCase() === b.account.toLowerCase();
}

/** Human-readable owner check guard: `undefined` when unknown, else a boolean. */
export function isSameTxOwnerOrUnknown(
  a: TxOwner | undefined,
  b: TxOwner | undefined,
): boolean {
  if (a === undefined || b === undefined) return false;
  return isSameTxOwner(a, b);
}
