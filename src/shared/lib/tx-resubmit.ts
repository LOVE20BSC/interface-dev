/**
 * 「重新提交」 decision table — pure functions, no React, no wagmi.
 *
 * The owner-reported P1s share one root cause: a retry re-sent a *new*
 * transaction without proving what happened to the *old* one. Reading the nonce
 * takes a round trip; the original transaction can confirm inside that window,
 * so the page opened the wallet again and both transactions mined (double
 * transfer / double swap). A retry is only ever allowed to do one of these:
 *
 * - **settled**  — the receipt exists: the retry never sends, the caller flips to
 *   the success/失敗 state it already renders for a mined receipt;
 * - **replace**  — the hash is still queued in the pool: re-send the SAME call
 *   with the SAME nonce, so at most one of the two can ever mine;
 * - **new**      — the hash is gone (dropped) or its nonce is unreachable (a
 *   wallet-cached gap): send again at the pool's next nonce, which is the only
 *   way a gapped transaction can ever be healed;
 * - **replaced** — a different transaction consumed that wallet+nonce: sending
 *   again would execute the user's action a second time, so the retry stops;
 * - **unavailable** — a read failed: we cannot prove the old transaction is
 *   dead, so signing would risk the exact double-send this module exists to
 *   prevent. The page asks the user to retry instead.
 *
 * `shared/model/use-tx-watch.ts` produces the observation; this module owns the
 * policy, which is why every branch below is provable without a browser.
 */

/** One chain read taken immediately before a retry decides what to do. */
export interface ResubmitSnapshot {
  /**
   * `success` / `reverted` when the receipt is mined, `null` when the node
   * answered "no such receipt", `undefined` when the read itself failed.
   */
  readonly receiptStatus: 'success' | 'reverted' | null | undefined;
  /**
   * Pool nonce of the watched hash, `null` when the transaction is not in the
   * pool anymore, `undefined` when the read failed.
   */
  readonly txNonce: number | null | undefined;
  /** Mined-transaction count for the wallet (`latest`). */
  readonly latestNonce: number | undefined;
  /** Pool-aware count for the wallet (`pending`): the next reusable nonce. */
  readonly pendingNonce: number | undefined;
}

export type ResubmitDecision =
  /** The original transaction is mined; the retry must not send. */
  | { readonly action: 'settled'; readonly status: 'success' | 'reverted' }
  /** A different transaction took this wallet+nonce; sending would double it. */
  | { readonly action: 'replaced' }
  /** A read failed; the caller shows neutral copy and never signs blind. */
  | { readonly action: 'unavailable' }
  /** Send again: `replace` reuses the original nonce, `new` takes the pool's. */
  | { readonly action: 'send'; readonly nonce: number; readonly mode: 'replace' | 'new' };

/**
 * Decides whether a retry may send, and with which nonce.
 *
 * `submittedNonce` is the caller's best knowledge of the original transaction's
 * nonce (the live pool read, or the persisted record once the hash has left the
 * pool). It only feeds the "is this hash gone *and* its slot consumed?" question.
 */
export function decideResubmit(
  snapshot: ResubmitSnapshot,
  submittedNonce: number | undefined,
): ResubmitDecision {
  const { receiptStatus, txNonce, latestNonce, pendingNonce } = snapshot;

  // A receipt is the only terminal truth, and it wins over every heuristic.
  if (receiptStatus === 'success') return { action: 'settled', status: 'success' };
  if (receiptStatus === 'reverted') return { action: 'settled', status: 'reverted' };
  // A failed receipt read proves nothing: the transaction may be mined already.
  if (receiptStatus === undefined) return { action: 'unavailable' };
  if (txNonce === undefined) return { action: 'unavailable' };

  const poolAware = pendingNonce ?? latestNonce;

  if (txNonce !== null) {
    // A gap the pool cannot reach can never mine; replacing it in place would
    // re-queue the same dead transaction. Start again at the pool's next nonce —
    // this is the owner-reported 「卡在钱包里」 heal.
    if (poolAware !== undefined && txNonce > poolAware) {
      return { action: 'send', nonce: poolAware, mode: 'new' };
    }
    // Somebody else's transaction mined at our nonce (and our hash has no
    // receipt): the watched hash will never mine, and re-sending would run the
    // action a second time.
    if (latestNonce !== undefined && latestNonce > txNonce) return { action: 'replaced' };
    // Still queued: replace it at its own nonce so only one can ever mine.
    return { action: 'send', nonce: txNonce, mode: 'replace' };
  }

  // The hash left the pool. Without the original nonce a dropped transaction is
  // indistinguishable from one whose slot another transaction consumed, so the
  // retry refuses to sign rather than risk executing the action twice.
  if (submittedNonce === undefined) return { action: 'unavailable' };
  if (latestNonce !== undefined && latestNonce > submittedNonce) {
    return { action: 'replaced' };
  }
  const nonce = pendingNonce ?? latestNonce;
  if (nonce === undefined) return { action: 'unavailable' };
  return { action: 'send', nonce, mode: 'new' };
}
