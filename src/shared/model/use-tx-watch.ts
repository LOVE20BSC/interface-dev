import { useCallback, useEffect, useRef, useState } from 'react';
import type { TransactionReceipt } from 'viem';
import { usePublicClient } from 'wagmi';
import type { HexAddress } from '@/config/networks';
import {
  createTxWatchState,
  idleTxWatchState,
  isTxWatchPollingStopped,
  isTxWatchRecovery,
  isTxWatchSettled,
  reduceTxWatch,
  txWatchRemainingMs,
  txWatchRemainingSeconds,
  type HexHash,
  type TxWatchObservation,
  type TxWatchState,
  type TxWatchStatus,
  type TxWatchTxObservation,
  resolveTxDeadlineMs,
} from '@/shared/lib/tx-watch';
import type { ResubmitSnapshot } from '@/shared/lib/tx-resubmit';

/**
 * Build-time transaction deadline. `VITE_TX_DEADLINE_MS` exists so Playwright can
 * shorten the wait; production uses the 90 s default from the pure module.
 */
export const TX_DEADLINE_MS = resolveTxDeadlineMs(import.meta.env.VITE_TX_DEADLINE_MS);

/** The wagmi public client the watcher (and a retry re-check) reads through. */
export type TxReadClient = NonNullable<ReturnType<typeof usePublicClient>>;

/** Poll cadence: three cheap reads per tick; nothing fires without a hash. */
export const TX_POLL_INTERVAL_MS = 2_500;

/** How far back a replaced transaction is searched for (blocks). */
const REPLACEMENT_LOOKBACK_BLOCKS = 16n;

export interface UseTxWatchOptions {
  /** The submitted hash, or null while waiting for the wallet / before submitting. */
  readonly hash: HexHash | null;
  /** Wallet that signed it; used for the nonce-gap and replacement checks. */
  readonly wallet: HexAddress | undefined;
  /** True while the wallet sheet is open and no hash exists yet (`wallet` state). */
  readonly walletAction?: boolean;
  readonly enabled?: boolean;
  readonly deadlineMs?: number;
  readonly pollIntervalMs?: number;
}

export interface TxWatch {
  readonly status: TxWatchStatus;
  readonly hash: HexHash | null;
  /** The receipt for the watched hash, once mined. */
  readonly receipt: TransactionReceipt | null;
  /**
   * Nonce the watched hash was observed with, as soon as the node reports it.
   * A 「重新提交」 must replace *this* nonce, not the wallet's next one (R2).
   */
  readonly submittedNonce: number | undefined;
  readonly remainingMs: number;
  readonly remainingSeconds: number;
  /** `slow | dropped | replaced | nonceGap`: render the recovery card, free the CTA. */
  readonly isStuck: boolean;
  readonly isSettled: boolean;
  /** Manual `eth_getTransactionReceipt`/`getTransaction` re-check (「重新查询」). */
  readonly refresh: () => void;
}

interface ReceiptForHash {
  readonly hash: HexHash;
  readonly receipt: TransactionReceipt;
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name?: unknown }).name)
    : '';
}

function isNotFoundError(error: unknown): boolean {
  const name = errorName(error);
  return name === 'TransactionNotFoundError' || name === 'TransactionReceiptNotFoundError';
}

/**
 * Three-valued receipt read.
 *
 * `none` (the node answered "no such receipt") is a fact the replacement scan may
 * act on. `failed` is not: a transient RPC failure looks exactly like "not mined
 * yet", and treating it as either mined or missing is how the watcher used to
 * report a transaction as its own replacement (P2).
 */
type ReceiptRead =
  | { readonly kind: 'mined'; readonly receipt: TransactionReceipt }
  | { readonly kind: 'none' }
  | { readonly kind: 'failed' };

async function readReceipt(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  hash: HexHash,
): Promise<ReceiptRead> {
  try {
    return { kind: 'mined', receipt: await client.getTransactionReceipt({ hash }) };
  } catch (error) {
    return isNotFoundError(error) ? { kind: 'none' } : { kind: 'failed' };
  }
}

async function readTx(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  hash: HexHash,
): Promise<TxWatchTxObservation | null | undefined> {
  try {
    const tx = await client.getTransaction({ hash });
    return { nonce: tx.nonce, from: tx.from };
  } catch (error) {
    return isNotFoundError(error) ? null : undefined;
  }
}

interface WalletNonces {
  /** Mined-transaction count: drives the replacement check. */
  readonly latest: number | undefined;
  /** Pool-aware count: tells a real nonce gap from a transaction queued behind one. */
  readonly pending: number | undefined;
}

async function readWalletNonces(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  wallet: HexAddress | undefined,
): Promise<WalletNonces> {
  if (wallet === undefined) return { latest: undefined, pending: undefined };
  const [latest, pending] = await Promise.all([
    client.getTransactionCount({ address: wallet, blockTag: 'latest' }).catch(() => undefined),
    client.getTransactionCount({ address: wallet, blockTag: 'pending' }).catch(() => undefined),
  ]);
  return { latest, pending };
}

/**
 * Best-effort replacement lookup: a different mined transaction from the same
 * wallet with the same nonce. Bounded to the recent blocks and attempted once
 * per watch, because it is the only way to find the hash that actually mined.
 *
 * `excludeHash` is the watched hash itself: a transaction that already mined is
 * still listed in its block, so without this filter a single lagging receipt read
 * makes the watcher find the transaction and call it its own replacement (P2).
 */
async function findReplacementHash(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  wallet: HexAddress,
  nonce: number,
  excludeHash: HexHash,
): Promise<HexHash | null> {
  const excluded = excludeHash.toLowerCase();
  try {
    const latest = await client.getBlockNumber();
    const oldest =
      latest >= REPLACEMENT_LOOKBACK_BLOCKS ? latest - REPLACEMENT_LOOKBACK_BLOCKS : 0n;
    for (let blockNumber = latest; blockNumber >= oldest; blockNumber -= 1n) {
      const block = await client.getBlock({ blockNumber, includeTransactions: true });
      for (const entry of block.transactions) {
        if (typeof entry === 'string') continue;
        if (entry.nonce === nonce && entry.from.toLowerCase() === wallet.toLowerCase()) {
          if (entry.hash.toLowerCase() === excluded) continue;
          return entry.hash;
        }
      }
      if (blockNumber === 0n) break;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Watches one submitted transaction with a bounded wait.
 *
 * Replaces a bare `useTransactionReceipt` poll: it stops on terminal states and
 * on unmount, never fires without a hash, and turns a passed deadline into an
 * actionable state (`slow` | `dropped`) instead of an endless 确认中 (the /mint
 * nonce-gap dead end). The caller still owns what a receipt means (events,
 * receipts, copy); this hook only answers "what is the status of this hash".
 *
 * The watched hash may be restored from the namespaced cache after a reload;
 * the clock then restarts from the reload, the same as a fresh submission.
 */
export function useTxWatch(options: UseTxWatchOptions): TxWatch {
  const {
    hash,
    wallet,
    walletAction = false,
    enabled = true,
    deadlineMs = TX_DEADLINE_MS,
    pollIntervalMs = TX_POLL_INTERVAL_MS,
  } = options;
  const client = usePublicClient();

  const [state, setState] = useState<TxWatchState>(() => idleTxWatchState(deadlineMs));
  const [receiptForHash, setReceiptForHash] = useState<ReceiptForHash | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const stateRef = useRef(state);

  // One effect per watched hash: a new hash resets the clock, a manual refresh
  // (`refreshVersion`) restarts the loop without resetting it.
  useEffect(() => {
    if (hash === null) {
      /* eslint-disable react-hooks/set-state-in-effect -- leaving the watched hash resets the machine */
      const next = idleTxWatchState(deadlineMs);
      stateRef.current = next;
      setState(next);
      setReceiptForHash(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    if (!enabled || client === undefined) return;

    const initial =
      stateRef.current.hash === hash ? stateRef.current : createTxWatchState({ hash, deadlineMs });
    let current = initial;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let knownNonce = initial.observation.tx?.nonce;
    let replacementScanned = false;

    stateRef.current = initial;
    setState(initial);
    setReceiptForHash((previous) => (previous?.hash === hash ? previous : null));

    const publish = (next: TxWatchState): void => {
      current = next;
      stateRef.current = next;
      setState(next);
    };

    const observe = async (): Promise<void> => {
      const [receiptRead, tx, walletNonces] = await Promise.all([
        readReceipt(client, hash),
        readTx(client, hash),
        readWalletNonces(client, wallet),
      ]);
      const walletNonce = walletNonces.latest;
      if (cancelled) return;
      if (tx !== null && tx !== undefined) knownNonce = tx.nonce;

      let replacementHash: HexHash | null | undefined;
      // Only a *definitive* "no receipt" may trigger the replacement scan. A failed
      // read cannot tell "mined" from "not mined", so scanning then would let a
      // single RPC hiccup mark a mined transaction as replaced and stop polling.
      if (
        receiptRead.kind === 'none' &&
        !replacementScanned &&
        wallet !== undefined &&
        knownNonce !== undefined &&
        walletNonce !== undefined &&
        walletNonce > knownNonce
      ) {
        replacementScanned = true;
        replacementHash = await findReplacementHash(client, wallet, knownNonce, hash);
        if (cancelled) return;
        // The scan returns only *mined* transactions; never let a defensive miss in
        // the lookup turn the watched hash into its own replacement.
        if (replacementHash !== null && replacementHash.toLowerCase() === hash.toLowerCase()) {
          replacementHash = null;
        }
      }

      const observation: TxWatchObservation = {
        receipt: receiptRead.kind === 'mined' ? { status: receiptRead.receipt.status } : null,
        tx,
        walletNonce,
        walletPendingNonce: walletNonces.pending,
        replacementHash,
      };
      if (receiptRead.kind === 'mined') {
        setReceiptForHash({ hash, receipt: receiptRead.receipt });
      }
      publish(reduceTxWatch(current, { type: 'observe', observation, now: Date.now() }));
    };

    const step = async (): Promise<void> => {
      await observe();
      if (cancelled) return;
      if (isTxWatchPollingStopped(current.status)) return;
      pollTimer = setTimeout(() => {
        void step();
      }, pollIntervalMs);
    };

    void step();

    const deadlineAt = initial.startedAt + initial.deadlineMs;
    const deadlineTimer = setTimeout(
      () => {
        if (cancelled || isTxWatchPollingStopped(current.status)) return;
        // A fresh read at the deadline is what turns `pending` into `slow`/`dropped`.
        void observe();
      },
      Math.max(0, deadlineAt - Date.now()),
    );

    return () => {
      cancelled = true;
      if (pollTimer !== undefined) clearTimeout(pollTimer);
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    };
  }, [client, deadlineMs, enabled, hash, pollIntervalMs, refreshVersion, wallet]);

  const refresh = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);

  const resolvedStatus: TxWatchStatus =
    hash === null
      ? walletAction
        ? 'wallet'
        : 'idle'
      : state.hash === hash
        ? state.status
        : 'pending';
  // The countdown renders against the last observation time (never Date.now()
  // during render); every poll republishes the state, so it refreshes on its own.
  const isCurrentHash = hash !== null && state.hash === hash;
  const remainingMs = isCurrentHash
    ? txWatchRemainingMs(state, state.observedAt)
    : hash !== null
      ? deadlineMs
      : 0;
  const remainingSeconds = isCurrentHash ? txWatchRemainingSeconds(state, state.observedAt) : 0;

  return {
    status: resolvedStatus,
    hash,
    receipt:
      receiptForHash !== null && receiptForHash.hash === hash ? receiptForHash.receipt : null,
    submittedNonce: isCurrentHash ? state.observation.tx?.nonce : undefined,
    remainingMs,
    remainingSeconds,
    isStuck: isTxWatchRecovery(resolvedStatus),
    isSettled: isTxWatchSettled(resolvedStatus),
    refresh,
  };
}

/**
 * Reader for the nonce a **new operation** must carry (R5): the pool-aware count
 * (`pending`), so a fresh transaction queues *behind* whatever the wallet already
 * broadcast instead of reusing a nonce that is still in flight.
 *
 * This replaced the old `latest` read: with 3 mined transactions and a 4th already
 * in the wallet's queue, `latest` hands out 3 again and the new operation either
 * gets rejected or bumps the queued one. Explicit nonces are only ever pinned for
 * a *new* operation (here) or for replacing a known transaction, which uses that
 * transaction's own nonce (`shared/lib/tx-resubmit.ts`), never this reader.
 *
 * A failed read returns undefined so the wallet assigns the nonce and the bounded
 * watcher still turns any resulting gap into the recovery card.
 */
export function usePendingNonce(wallet: HexAddress | undefined): () => Promise<number | undefined> {
  const client = usePublicClient();
  return useCallback(async () => {
    if (client === undefined || wallet === undefined) return undefined;
    try {
      return await client.getTransactionCount({ address: wallet, blockTag: 'pending' });
    } catch {
      return undefined;
    }
  }, [client, wallet]);
}

/**
 * Reader for the nonce the wallet-stale-nonce heal carried before R5 existed.
 *
 * Sending `latest` explicitly is what healed the owner-reported dead end: the
 * wallet had nonce 68 cached while the chain was at 3, so its queued transaction
 * could never mine. The swap 「重新提交」 still uses this reader because the heal it
 * implements (re-send at the chain's next mined nonce) is the documented owner
 * fix; the three recovery hooks in this batch use `decideResubmit` instead, which
 * replaces a still-queued transaction at its own nonce.
 *
 * A failed read returns undefined so callers show neutral copy instead of signing
 * another possibly-bad transaction.
 */
export function useNextNonce(wallet: HexAddress | undefined): () => Promise<number | undefined> {
  const client = usePublicClient();
  return useCallback(async () => {
    if (client === undefined || wallet === undefined) return undefined;
    try {
      return await client.getTransactionCount({ address: wallet, blockTag: 'latest' });
    } catch {
      return undefined;
    }
  }, [client, wallet]);
}

/**
 * One snapshot for the 「重新提交」 decision (`decideResubmit`).
 *
 * Everything is read fresh, on the same client the watcher polls, right before the
 * retry is allowed to sign — this is the re-check that catches 「读 nonce 期间原交易
 * 已经确认」. A read failure is preserved as `undefined` (never collapsed into
 * `null`) so the decision can refuse to sign instead of guessing.
 */
export async function readResubmitSnapshot(
  client: TxReadClient | undefined,
  wallet: HexAddress | undefined,
  hash: HexHash,
): Promise<ResubmitSnapshot> {
  if (client === undefined || wallet === undefined) {
    return {
      receiptStatus: undefined,
      txNonce: undefined,
      latestNonce: undefined,
      pendingNonce: undefined,
    };
  }
  const [receiptRead, txNonce, walletNonces] = await Promise.all([
    readReceipt(client, hash),
    readTxNonce(client, hash),
    readWalletNonces(client, wallet),
  ]);
  return {
    receiptStatus:
      receiptRead.kind === 'mined'
        ? receiptRead.receipt.status
        : receiptRead.kind === 'none'
          ? null
          : undefined,
    txNonce,
    latestNonce: walletNonces.latest,
    pendingNonce: walletNonces.pending,
  };
}

/** Nonce of the hash when the node still has it; `null` when unknown to the node. */
async function readTxNonce(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  hash: HexHash,
): Promise<number | null | undefined> {
  try {
    const tx = await client.getTransaction({ hash });
    return tx.nonce;
  } catch (error) {
    return isNotFoundError(error) ? null : undefined;
  }
}
