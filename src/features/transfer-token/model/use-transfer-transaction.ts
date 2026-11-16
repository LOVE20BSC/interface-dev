import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSendTransaction,
  useWriteContract,
} from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import { NETWORK, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import {
  readResubmitSnapshot,
  usePendingNonce,
  useTxWatch,
  type TxWatch,
} from '@/shared/model/use-tx-watch';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';
import { decideResubmit, type ResubmitDecision } from '@/shared/lib/tx-resubmit';
import { isSameTxOwner, type TxOwner } from '@/shared/lib/tx-owner';
import { describeTransferError } from '@/features/transfer-token/lib/transfer-errors';
import {
  clearStoredTransfer,
  createTransferScope,
  readStoredTransfer,
  storedTransferToRecord,
  writeStoredTransfer,
} from '@/features/transfer-token/lib/transfer-record';
import type { TransferRecord } from '@/features/transfer-token/lib/transfer-receipt';
import type { TransferToken } from '@/features/transfer-token/lib/transfer-types';

export type TransferStage = 'idle' | 'wallet' | 'pending';

export interface TransferRequest {
  readonly token: TransferToken;
  readonly amount: bigint;
  readonly recipient: HexAddress;
  readonly recipientLabel: string | undefined;
}

export interface TransferTxError {
  readonly message: string;
  /** Send-time recovery family: nonce mismatch / stale wallet block view. */
  readonly kind?: 'nonce' | 'staleBlock';
}

export interface TransferTransactionState {
  readonly stage: TransferStage;
  readonly receipt: TransferRecord | null;
  /** A transfer restored from the cache whose receipt was already mined (D4 strip). */
  readonly restoredRecord: TransferRecord | null;
  readonly pendingHash: `0x${string}` | null;
  readonly error: TransferTxError | null;
  /** Bounded wait for the submitted hash; `isStuck` frees the CTA + recovery card. */
  readonly watch: TxWatch;
  /** True for the first frames of a page load, before the cache is read. */
  readonly isHydrating: boolean;
  /** A 重新提交 is running: the recovery button must not be clickable again. */
  readonly isResubmitting: boolean;
  /** Re-sends the same transfer at the right nonce (R2: never a second transfer). */
  readonly resubmit: () => void;
  readonly submit: (request: TransferRequest) => Promise<void>;
  readonly clearReceipt: () => void;
  readonly clearError: () => void;
}

/**
 * One attempt, kept in memory before the wallet opens (R1).
 *
 * Persisting/remembering the request *before* `send` is what makes the retry
 * re-send **the request that just failed** instead of the previous successful
 * one: after a success the attempt carries its hash, so the retry targets that
 * pending transaction; after a failure it still knows exactly which call the
 * user asked for.
 */
interface TransferAttempt extends TxOwner {
  readonly request: TransferRequest;
  readonly hash: `0x${string}` | undefined;
  /** Nonce we asked for; a retry replaces this nonce, never the wallet's next one. */
  readonly nonce: number | undefined;
}

interface PendingTransfer {
  readonly hash: `0x${string}`;
  readonly owner: TxOwner;
  readonly request: TransferRequest;
  readonly nonce: number | undefined;
}

/**
 * One transfer, two write shapes: the native coin uses a plain value transfer,
 * every ERC20 uses `transfer(to, amount)` directly — there is no approval step
 * (and the page never mentions one). Waiting is the shared bounded watcher, so a
 * dropped / nonce-gapped transaction becomes an actionable recovery card instead
 * of an endless 确认中, and 重新提交 re-sends the SAME transfer.
 *
 * D1 (owner 2026-11-14): the submitted hash + its request are persisted before
 * waiting. A refresh in the pending window restores the pending card and keeps
 * watching the SAME hash, so the form-level 确认转账 can never send the same
 * transfer a second time (the QA run saw the recipient credited twice). A
 * refresh after the receipt is mined restores only the success strip (D4); the
 * receipt sheet is a one-time page state and never pops up again.
 *
 * R2 (owner 2026-11-16): 重新提交 re-checks the chain right before signing. The
 * nonce read is a network round trip and the original transfer can be mined
 * inside it; the retry therefore only sends when the hash is still queued (same
 * nonce) or provably gone (new nonce at the pool's tip), and flips to the normal
 * success/失敗 state when the receipt already exists. R3: the attempt records its
 * `{chainId, account}` and is never signed by another wallet.
 */
export function useTransferTransaction(onConfirmed: () => void): TransferTransactionState {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const readPendingNonce = usePendingNonce(account);

  const [pending, setPending] = useState<PendingTransfer | null>(null);
  const [receipt, setReceipt] = useState<TransferRecord | null>(null);
  const [restoredRecord, setRestoredRecord] = useState<TransferRecord | null>(null);
  const [isWalletAction, setIsWalletAction] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [error, setError] = useState<TransferTxError | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const submittingRef = useRef(false);
  const lastAttemptRef = useRef<TransferAttempt | null>(null);

  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  });

  const scope = useMemo(
    () => (account !== undefined ? createTransferScope(chainId, account) : null),
    [account, chainId],
  );

  // A refresh must resume the transfer instead of showing an empty, submittable form.
  // `account` / `chainId` are the owner check inputs (R3); `scope` already changes
  // with them, but naming both keeps the effect honest about what it reads.
  /* eslint-disable react-hooks/set-state-in-effect -- hydration from the namespaced cache */
  useEffect(() => {
    setPending(null);
    setReceipt(null);
    setRestoredRecord(null);
    setError(null);
    setIsWalletAction(false);
    setIsResubmitting(false);
    submittingRef.current = false;
    lastAttemptRef.current = null;
    setIsHydrating(true);
    if (scope === null) {
      setIsHydrating(false);
      return;
    }
    const stored = readStoredTransfer(scope);
    if (stored !== null && account !== undefined) {
      // R3: a task that belongs to another wallet/chain is never restored as
      // submittable page state (the record itself carries the owner).
      const storedOwner: TxOwner = { chainId: stored.chainId, account: stored.account };
      if (!isSameTxOwner(storedOwner, { chainId, account })) {
        clearStoredTransfer(scope);
        setError({ message: copy.txWatch.ownerChanged });
        setIsHydrating(false);
        return;
      }
      if (stored.confirmed) {
        // Only the strip is replayed; the receipt sheet stays a one-time state.
        setRestoredRecord(storedTransferToRecord(stored));
      } else {
        setPending({
          hash: stored.hash,
          owner: storedOwner,
          request: {
            token: stored.token,
            amount: stored.amount,
            recipient: stored.recipient,
            recipientLabel: stored.recipientLabel,
          },
          nonce: stored.nonce,
        });
      }
    }
    setIsHydrating(false);
  }, [account, chainId, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const watch = useTxWatch({
    hash: pending?.hash ?? null,
    wallet: account,
    walletAction: isWalletAction,
    enabled: pending !== null,
  });
  const onChainReceipt = watch.receipt;

  /* eslint-disable react-hooks/set-state-in-effect -- a mined receipt is an external chain fact */
  useEffect(() => {
    if (pending === null || onChainReceipt === null) return;

    if (onChainReceipt.status === 'reverted') {
      // A settled failure must not be restored as an in-flight transfer.
      if (scope !== null) clearStoredTransfer(scope);
      lastAttemptRef.current = null;
      setPending(null);
      setError({ message: copy.transfer.errors.reverted });
      onConfirmedRef.current();
      return;
    }

    const request = pending.request;
    const record: TransferRecord = {
      hash: pending.hash,
      tokenSymbol: request.token.symbol,
      tokenDecimals: request.token.decimals,
      native: request.token.kind === 'native',
      amount: request.amount,
      recipient: request.recipient,
      recipientLabel: request.recipientLabel,
      recordedAt: Date.now(),
    };
    // Flip the persisted task to confirmed: a later refresh shows the success
    // strip (hash + amount), never the receipt sheet again.
    if (scope !== null) {
      writeStoredTransfer(scope, {
        hash: pending.hash,
        chainId: pending.owner.chainId,
        account: pending.owner.account,
        token: request.token,
        amount: request.amount,
        recipient: request.recipient,
        recipientLabel: request.recipientLabel,
        nonce: pending.nonce,
        confirmed: true,
        recordedAt: record.recordedAt,
      });
    }
    lastAttemptRef.current = null;
    setRestoredRecord(null);
    setReceipt(record);
    setPending(null);
    setError(null);
    onConfirmedRef.current();
  }, [onChainReceipt, pending, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const send = async (request: TransferRequest, nonce?: number): Promise<`0x${string}`> => {
    const nonceOption = nonce !== undefined ? { nonce } : {};
    if (request.token.kind === 'native') {
      return sendTransactionAsync({
        to: request.recipient,
        value: request.amount,
        ...nonceOption,
      });
    }
    if (request.token.address === undefined) throw new Error('token address unavailable');
    return writeContractAsync({
      address: request.token.address,
      abi: love20TokenAbi,
      functionName: 'transfer',
      args: [request.recipient, request.amount],
      ...nonceOption,
    });
  };

  /**
   * Sign one attempt and adopt its hash. The caller owns the lock and the wallet
   * state so the same body serves a first submit, a lost-hash retry and a
   * replacement.
   */
  const signAttempt = async (
    attempt: TransferAttempt,
    nonce: number | undefined,
  ): Promise<void> => {
    const hash = await send(attempt.request, nonce);
    const settledNonce = nonce ?? attempt.nonce;
    // Persist before waiting (D1): the hash is the only thing that cannot be
    // rebuilt after a refresh.
    if (scope !== null) {
      writeStoredTransfer(scope, {
        hash,
        chainId: attempt.chainId,
        account: attempt.account,
        token: attempt.request.token,
        amount: attempt.request.amount,
        recipient: attempt.request.recipient,
        recipientLabel: attempt.request.recipientLabel,
        nonce: settledNonce,
        confirmed: false,
        recordedAt: Date.now(),
      });
    }
    lastAttemptRef.current = {
      ...attempt,
      hash,
      nonce: settledNonce,
    };
    setPending({
      hash,
      owner: { chainId: attempt.chainId, account: attempt.account },
      request: attempt.request,
      nonce: settledNonce,
    });
  };

  const submitInternal = async (request: TransferRequest, nonce?: number): Promise<void> => {
    if (submittingRef.current) return;
    if (account === undefined || request.amount <= 0n) return;
    const attempt: TransferAttempt = {
      chainId,
      account,
      request,
      hash: undefined,
      nonce,
    };
    // R1: remember the request BEFORE the wallet opens, so a failure still knows
    // exactly which transfer「重试」must re-send (never the previous one).
    lastAttemptRef.current = attempt;
    setError(null);
    setIsWalletAction(true);
    submittingRef.current = true;
    try {
      // R5: a new operation queues behind whatever the wallet already broadcast.
      const sendNonce = nonce ?? (await readPendingNonce());
      await signAttempt(attempt, sendNonce);
    } catch (cause) {
      const message = describeTransferError(cause, {
        nativeSymbol: NETWORK.nativeCurrency.symbol,
        tokenSymbol: request.token.symbol,
      });
      const recovery = txSendRecoveryKind(cause);
      setError({ message, ...(recovery !== undefined ? { kind: recovery } : {}) });
    } finally {
      setIsWalletAction(false);
      submittingRef.current = false;
    }
  };

  const submit = async (request: TransferRequest): Promise<void> => {
    // D1: an in-flight or restored transfer blocks a second submission. The
    // panel disables the CTA for the same condition; this guard keeps the hook
    // honest when a stale click slips through.
    if (isHydrating || submittingRef.current || pending !== null || receipt !== null) return;
    await submitInternal(request);
  };

  /** The attempt a 重新提交 is allowed to work on, or a settled/no-op reason. */
  const currentAttempt = (): TransferAttempt | null => {
    if (pending !== null) {
      return {
        ...pending.owner,
        request: pending.request,
        hash: pending.hash,
        nonce: pending.nonce,
      };
    }
    return lastAttemptRef.current;
  };

  const resubmitFailed = (cause: unknown, request: TransferRequest): void => {
    const message = describeTransferError(cause, {
      nativeSymbol: NETWORK.nativeCurrency.symbol,
      tokenSymbol: request.token.symbol,
    });
    const recovery = txSendRecoveryKind(cause);
    setError({ message, ...(recovery !== undefined ? { kind: recovery } : {}) });
  };

  const resubmit = (): void => {
    void (async () => {
      if (submittingRef.current) return;
      const attempt = currentAttempt();
      if (attempt === null) return;
      // R3: never sign another account's / another chain's request. The record is
      // cleared instead, with neutral copy (no wallet sheet, no signature).
      if (account === undefined || !isSameTxOwner(attempt, { chainId, account })) {
        lastAttemptRef.current = null;
        setPending(null);
        if (scope !== null) clearStoredTransfer(scope);
        setError({ message: copy.txWatch.ownerChanged });
        return;
      }
      // No hash yet: the wallet rejected/cancelled the send, so this is a plain
      // retry of the same request (R1) — nothing on chain to re-check.
      if (attempt.hash === undefined) {
        await submitInternal(attempt.request);
        return;
      }

      const hash = attempt.hash;
      setError(null);
      setIsResubmitting(true);
      setIsWalletAction(true);
      submittingRef.current = true;
      try {
        // R2: re-check the chain right before signing. The nonce read is a round
        // trip; the original transfer can confirm inside it.
        const snapshot = await readResubmitSnapshot(publicClient, account, hash);
        const decision: ResubmitDecision = decideResubmit(
          snapshot,
          attempt.nonce ?? watch.submittedNonce,
        );
        if (decision.action === 'settled') {
          // Already mined: let the watcher publish the receipt; never send again.
          watch.refresh();
          return;
        }
        if (decision.action === 'replaced') {
          // Somebody else's transaction took this nonce: re-sending would run the
          // transfer twice. Surface it as the settled replacement state.
          watch.refresh();
          return;
        }
        if (decision.action === 'unavailable') {
          setError({ message: copy.txWatch.nonceUnavailable });
          return;
        }
        await signAttempt(attempt, decision.nonce);
      } catch (cause) {
        resubmitFailed(cause, attempt.request);
      } finally {
        setIsWalletAction(false);
        setIsResubmitting(false);
        submittingRef.current = false;
      }
    })();
  };

  const stage: TransferStage = isWalletAction
    ? 'wallet'
    : pending !== null && !watch.isStuck
      ? 'pending'
      : 'idle';

  return {
    stage,
    receipt,
    restoredRecord,
    pendingHash: pending?.hash ?? null,
    error,
    watch,
    isHydrating,
    isResubmitting,
    resubmit,
    submit,
    clearReceipt: () => {
      setReceipt(null);
      setPending(null);
      setError(null);
    },
    clearError: () => {
      setError(null);
    },
  };
}
