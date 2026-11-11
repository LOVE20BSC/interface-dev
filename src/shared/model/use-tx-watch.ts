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

/**
 * Build-time transaction deadline. `VITE_TX_DEADLINE_MS` exists so Playwright can
 * shorten the wait; production uses the 90 s default from the pure module.
 */
export const TX_DEADLINE_MS = resolveTxDeadlineMs(import.meta.env.VITE_TX_DEADLINE_MS);

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

async function readReceipt(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  hash: HexHash,
): Promise<TransactionReceipt | null> {
  try {
    return await client.getTransactionReceipt({ hash });
  } catch {
    // Not mined yet and a transient RPC failure look the same here: no receipt.
    return null;
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

async function readWalletNonce(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  wallet: HexAddress | undefined,
): Promise<number | undefined> {
  if (wallet === undefined) return undefined;
  try {
    return await client.getTransactionCount({ address: wallet, blockTag: 'latest' });
  } catch {
    return undefined;
  }
}

/**
 * Best-effort replacement lookup: a different mined transaction from the same
 * wallet with the same nonce. Bounded to the recent blocks and attempted once
 * per watch, because it is the only way to find the hash that actually mined.
 */
async function findReplacementHash(
  client: NonNullable<ReturnType<typeof usePublicClient>>,
  wallet: HexAddress,
  nonce: number,
): Promise<HexHash | null> {
  try {
    const latest = await client.getBlockNumber();
    const oldest =
      latest >= REPLACEMENT_LOOKBACK_BLOCKS ? latest - REPLACEMENT_LOOKBACK_BLOCKS : 0n;
    for (let blockNumber = latest; blockNumber >= oldest; blockNumber -= 1n) {
      const block = await client.getBlock({ blockNumber, includeTransactions: true });
      for (const entry of block.transactions) {
        if (typeof entry === 'string') continue;
        if (entry.nonce === nonce && entry.from.toLowerCase() === wallet.toLowerCase()) {
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
      const [receipt, tx, walletNonce] = await Promise.all([
        readReceipt(client, hash),
        readTx(client, hash),
        readWalletNonce(client, wallet),
      ]);
      if (cancelled) return;
      if (tx !== null && tx !== undefined) knownNonce = tx.nonce;

      let replacementHash: HexHash | null | undefined;
      if (
        receipt === null &&
        !replacementScanned &&
        wallet !== undefined &&
        knownNonce !== undefined &&
        walletNonce !== undefined &&
        walletNonce > knownNonce
      ) {
        replacementScanned = true;
        replacementHash = await findReplacementHash(client, wallet, knownNonce);
        if (cancelled) return;
      }

      const observation: TxWatchObservation = {
        receipt: receipt === null ? null : { status: receipt.status },
        tx,
        walletNonce,
        replacementHash,
      };
      if (receipt !== null) setReceiptForHash({ hash, receipt });
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
    remainingMs,
    remainingSeconds,
    isStuck: isTxWatchRecovery(resolvedStatus),
    isSettled: isTxWatchSettled(resolvedStatus),
    refresh,
  };
}

/**
 * Reader for the nonce a 「重新提交」 must carry. Sending it explicitly is what
 * heals the owner-reported dead end: the wallet had nonce 68 cached while the
 * chain was at 3, so its queued transaction could never mine. Reading `latest`
 * (not the wallet's cached value) puts the resubmission back on the chain.
 *
 * A failed read returns undefined so callers can show neutral copy instead of
 * signing another possibly-bad transaction.
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
