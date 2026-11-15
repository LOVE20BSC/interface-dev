import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi';
import { batchTransferAbi, love20TokenAbi } from '@/config/abis';
import { NETWORK, configuredAddress, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import {
  readResubmitSnapshot,
  usePendingNonce,
  useTxWatch,
  type TxWatch,
} from '@/shared/model/use-tx-watch';
import { decideResubmit } from '@/shared/lib/tx-resubmit';
import { isSameTxOwner, type TxOwner } from '@/shared/lib/tx-owner';
import { describeBatchError, type BatchErrorMessage } from '@/features/batch-transfer/lib/batch-errors';
import {
  clearStoredBatch,
  createBatchScope,
  readStoredBatch,
  writeStoredBatch,
  type BatchPendingKind,
} from '@/features/batch-transfer/lib/batch-record';
import type { BatchRequest } from '@/features/batch-transfer/lib/batch-types';

export type BatchStage = 'idle' | 'wallet' | 'pending';
export type { BatchPendingKind };

export interface BatchTransactionState {
  readonly stage: BatchStage;
  readonly pendingKind: BatchPendingKind | null;
  readonly error: BatchErrorMessage | null;
  readonly watch: TxWatch;
  /** `approve(BatchTransfer, 合计)`; the panel re-reads the allowance on confirm. */
  readonly approve: (request: BatchRequest) => Promise<void>;
  /** Simulates, then sends the batch. A simulation failure never asks the wallet. */
  readonly submit: (request: BatchRequest) => Promise<void>;
  /** A 重新提交 is running: the recovery button must not be clickable again. */
  readonly isResubmitting: boolean;
  readonly resubmit: () => void;
  readonly clearError: () => void;
}

export interface UseBatchTransactionOptions {
  readonly onApproved: () => void;
  readonly onBatchConfirmed: (hash: `0x${string}`, request: BatchRequest) => void;
}

/**
 * One attempt, remembered BEFORE the wallet opens (R1).
 *
 * The old code only recorded the attempt after a hash came back, so a failed
 * second send left the *previous successful* request as the retry target (the
 * owner saw the 100 batch re-sent when the 200 batch had failed) and a failed
 * first send left nothing at all (the recovery button did nothing).
 */
interface BatchAttempt extends TxOwner {
  readonly kind: BatchPendingKind;
  readonly request: BatchRequest;
  readonly hash: `0x${string}` | undefined;
  readonly nonce: number | undefined;
}

interface PendingBatch {
  readonly hash: `0x${string}`;
  readonly owner: TxOwner;
  readonly kind: BatchPendingKind;
  readonly request: BatchRequest;
  readonly nonce: number | undefined;
}

/**
 * The 批量转账 write path: one optional `approve` for the exact batch total, then
 * one atomic `batchTransferNative` / `batchTransferERC20`.
 *
 * The batch is **simulated before the wallet sheet opens**. The contract's
 * `NativeTransferFailed` / `ERC20TransferFailed` errors only say *which* row
 * failed, so a simulation is the only place the page can refuse a doomed batch
 * (gas budget too low, recipient contract rejects the asset, insufficient
 * balance) without burning gas — and it keeps 「你的资产没有变化」 literally true.
 *
 * Waiting is the shared bounded watcher; a stuck hash exposes the recovery card
 * with 「重新提交」, exactly like 代币转账. R1/R2/R4 (owner 2026-11-16): the attempt
 * is persisted before the wallet opens and kept while the hash waits, so a refresh
 * restores the in-flight card (and blocks a second batch), while 重新提交 re-checks
 * the chain and either replaces the same nonce or stops when the batch already
 * landed.
 */
export function useBatchTransaction(
  options: UseBatchTransactionOptions,
): BatchTransactionState {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const batchTransfer = configuredAddress('batchTransfer');
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const readPendingNonce = usePendingNonce(account);

  const [pending, setPending] = useState<PendingBatch | null>(null);
  const [isWalletAction, setIsWalletAction] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [error, setError] = useState<BatchErrorMessage | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const submittingRef = useRef(false);
  const lastAttemptRef = useRef<BatchAttempt | null>(null);

  const onApprovedRef = useRef(options.onApproved);
  const onBatchConfirmedRef = useRef(options.onBatchConfirmed);
  useEffect(() => {
    onApprovedRef.current = options.onApproved;
    onBatchConfirmedRef.current = options.onBatchConfirmed;
  });

  const scope = useMemo(
    () => (account !== undefined ? createBatchScope(chainId, account) : null),
    [account, chainId],
  );

  // R4: a refresh (or leaving the page and coming back) resumes the in-flight batch
  // instead of showing an empty, submittable form.
  /* eslint-disable react-hooks/set-state-in-effect -- hydration from the namespaced cache */
  useEffect(() => {
    setPending(null);
    setError(null);
    setIsWalletAction(false);
    setIsResubmitting(false);
    submittingRef.current = false;
    lastAttemptRef.current = null;
    setIsHydrating(true);
    if (scope === null || account === undefined) {
      setIsHydrating(false);
      return;
    }
    const stored = readStoredBatch(scope);
    if (stored !== null) {
      const owner: TxOwner = { chainId: stored.chainId, account: stored.account };
      // R3: a task belonging to another wallet/chain is cleared, never signed.
      if (!isSameTxOwner(owner, { chainId, account })) {
        clearStoredBatch(scope);
        setError({ message: copy.txWatch.ownerChanged });
        setIsHydrating(false);
        return;
      }
      if (stored.hash !== null) {
        setPending({
          hash: stored.hash,
          owner,
          kind: stored.kind,
          request: stored.request,
          nonce: stored.nonce,
        });
      } else {
        // The wallet never returned a hash: keep the request retryable, but do not
        // pretend something is pending (there is nothing to watch).
        lastAttemptRef.current = {
          ...owner,
          kind: stored.kind,
          request: stored.request,
          hash: undefined,
          nonce: stored.nonce,
        };
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
  const mined = watch.receipt;

  /* eslint-disable react-hooks/set-state-in-effect -- a mined receipt is an external chain fact */
  useEffect(() => {
    if (pending === null || mined === null) return;

    if (mined.status === 'reverted') {
      if (scope !== null) clearStoredBatch(scope);
      lastAttemptRef.current = null;
      setPending(null);
      setError({
        message:
          pending.kind === 'approve'
            ? copy.batchTransfer.errors.approveReverted
            : copy.batchTransfer.errors.reverted,
      });
      return;
    }

    if (scope !== null) clearStoredBatch(scope);
    lastAttemptRef.current = null;
    setPending(null);
    if (pending.kind === 'approve') {
      onApprovedRef.current();
    } else {
      onBatchConfirmedRef.current(pending.hash, pending.request);
    }
  }, [mined, pending, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const errorContext = (request: BatchRequest) => ({
    nativeSymbol: NETWORK.nativeCurrency.symbol,
    tokenSymbol: request.tokenSymbol,
    recipientHasCode: request.recipientHasCode,
  });

  const sendApprove = async (
    request: BatchRequest,
    nonce?: number,
  ): Promise<`0x${string}`> => {
    if (request.tokenAddress === undefined || batchTransfer === undefined) {
      throw new Error('batch transfer configuration unavailable');
    }
    return writeContractAsync({
      address: request.tokenAddress,
      abi: love20TokenAbi,
      functionName: 'approve',
      args: [batchTransfer, request.total],
      ...(nonce !== undefined ? { nonce } : {}),
    });
  };

  const sendBatch = async (request: BatchRequest, nonce?: number): Promise<`0x${string}`> => {
    if (batchTransfer === undefined) throw new Error('batch transfer configuration unavailable');
    const recipients = request.rows.map((row) => row.address);
    const amounts = request.rows.map((row) => row.amount);
    const nonceOption = nonce !== undefined ? { nonce } : {};

    if (request.mode === 'native') {
      // Simulation first: a doomed batch must not reach the wallet.
      if (publicClient !== undefined && account !== undefined) {
        await publicClient.simulateContract({
          account,
          address: batchTransfer,
          abi: batchTransferAbi,
          functionName: 'batchTransferNative',
          args: [recipients, amounts, BigInt(request.gasLimit)],
          value: request.total,
        });
      }
      return writeContractAsync({
        address: batchTransfer,
        abi: batchTransferAbi,
        functionName: 'batchTransferNative',
        args: [recipients, amounts, BigInt(request.gasLimit)],
        value: request.total,
        ...nonceOption,
      });
    }

    if (request.tokenAddress === undefined) throw new Error('token address unavailable');
    const tokenAddress: HexAddress = request.tokenAddress;
    if (publicClient !== undefined && account !== undefined) {
      await publicClient.simulateContract({
        account,
        address: batchTransfer,
        abi: batchTransferAbi,
        functionName: 'batchTransferERC20',
        args: [tokenAddress, recipients, amounts, BigInt(request.gasLimit)],
      });
    }
    return writeContractAsync({
      address: batchTransfer,
      abi: batchTransferAbi,
      functionName: 'batchTransferERC20',
      args: [tokenAddress, recipients, amounts, BigInt(request.gasLimit)],
      ...nonceOption,
    });
  };

  /** Sign one attempt and adopt its hash; the caller owns the locks and wallet state. */
  const signAttempt = async (attempt: BatchAttempt, nonce: number | undefined): Promise<void> => {
    const hash =
      attempt.kind === 'approve'
        ? await sendApprove(attempt.request, nonce)
        : await sendBatch(attempt.request, nonce);
    const settledNonce = nonce ?? attempt.nonce;
    // R1: the attempt now carries the hash, so the retry targets this transaction.
    lastAttemptRef.current = { ...attempt, hash, nonce: settledNonce };
    if (scope !== null) {
      writeStoredBatch(scope, {
        hash,
        chainId: attempt.chainId,
        account: attempt.account,
        kind: attempt.kind,
        request: attempt.request,
        nonce: settledNonce,
        recordedAt: Date.now(),
      });
    }
    setPending({
      hash,
      owner: { chainId: attempt.chainId, account: attempt.account },
      kind: attempt.kind,
      request: attempt.request,
      nonce: settledNonce,
    });
  };

  /** R1: persist the attempt before the wallet opens (hash filled in later). */
  const persistAttempt = (attempt: BatchAttempt): void => {
    lastAttemptRef.current = attempt;
    if (scope !== null) {
      writeStoredBatch(scope, {
        hash: attempt.hash ?? null,
        chainId: attempt.chainId,
        account: attempt.account,
        kind: attempt.kind,
        request: attempt.request,
        nonce: attempt.nonce,
        recordedAt: Date.now(),
      });
    }
  };

  const submitInternal = async (
    request: BatchRequest,
    kind: BatchPendingKind,
    nonce?: number,
  ): Promise<void> => {
    if (submittingRef.current) return;
    if (account === undefined || request.rows.length === 0) return;
    const attempt: BatchAttempt = {
      chainId,
      account,
      kind,
      request,
      hash: undefined,
      nonce,
    };
    // R1: persist BEFORE the wallet sheet opens, so a failure — even the first one
    // — still knows which request 「重试」 must re-send.
    persistAttempt(attempt);
    setError(null);
    setIsWalletAction(true);
    submittingRef.current = true;
    try {
      // R5: a new operation queues behind whatever the wallet already broadcast.
      const sendNonce = nonce ?? (await readPendingNonce());
      await signAttempt(attempt, sendNonce);
    } catch (cause) {
      setError(describeBatchError(cause, errorContext(request)));
    } finally {
      setIsWalletAction(false);
      submittingRef.current = false;
    }
  };

  const approve = async (request: BatchRequest): Promise<void> => {
    if (submittingRef.current || pending !== null) return;
    await submitInternal(request, 'approve');
  };

  const submit = async (request: BatchRequest): Promise<void> => {
    if (submittingRef.current || pending !== null || isHydrating) return;
    await submitInternal(request, 'batch');
  };

  const currentAttempt = (): BatchAttempt | null => {
    if (pending !== null) {
      return {
        ...pending.owner,
        kind: pending.kind,
        request: pending.request,
        hash: pending.hash,
        nonce: pending.nonce,
      };
    }
    return lastAttemptRef.current;
  };

  const resubmit = (): void => {
    void (async () => {
      if (submittingRef.current) return;
      const attempt = currentAttempt();
      if (attempt === null) return;
      // R3: never sign another wallet's / chain's request.
      if (account === undefined || !isSameTxOwner(attempt, { chainId, account })) {
        lastAttemptRef.current = null;
        setPending(null);
        if (scope !== null) clearStoredBatch(scope);
        setError({ message: copy.txWatch.ownerChanged });
        return;
      }
      // No hash yet: the wallet rejected/cancelled the send — a plain retry of the
      // same request, nothing on chain to re-check (R1).
      if (attempt.hash === undefined) {
        await submitInternal(attempt.request, attempt.kind);
        return;
      }

      const hash = attempt.hash;
      setError(null);
      setIsResubmitting(true);
      setIsWalletAction(true);
      submittingRef.current = true;
      try {
        // R2: re-check the chain right before signing; the original can confirm
        // during the nonce read.
        const snapshot = await readResubmitSnapshot(publicClient, account, hash);
        const decision = decideResubmit(snapshot, attempt.nonce ?? watch.submittedNonce);
        if (decision.action === 'settled') {
          if (decision.status === 'reverted') {
            if (scope !== null) clearStoredBatch(scope);
            lastAttemptRef.current = null;
            setPending(null);
            setError({
              message:
                attempt.kind === 'approve'
                  ? copy.batchTransfer.errors.approveReverted
                  : copy.batchTransfer.errors.reverted,
            });
            return;
          }
          // Mined: hand the receipt to the panel exactly like the watcher would —
          // the retry must never send a second batch.
          if (scope !== null) clearStoredBatch(scope);
          lastAttemptRef.current = null;
          setPending(null);
          if (attempt.kind === 'approve') onApprovedRef.current();
          else onBatchConfirmedRef.current(hash, attempt.request);
          return;
        }
        if (decision.action === 'replaced') {
          // Another transaction took this nonce: re-sending would run the batch
          // twice. Keep the hash so the watcher's own card explains the state.
          watch.refresh();
          return;
        }
        if (decision.action === 'unavailable') {
          setError({ message: copy.txWatch.nonceUnavailable });
          return;
        }
        await signAttempt(attempt, decision.nonce);
      } catch (cause) {
        setError(describeBatchError(cause, errorContext(attempt.request)));
      } finally {
        setIsWalletAction(false);
        setIsResubmitting(false);
        submittingRef.current = false;
      }
    })();
  };

  const stage: BatchStage = isWalletAction
    ? 'wallet'
    : pending !== null && !watch.isStuck
      ? 'pending'
      : 'idle';

  return {
    stage,
    pendingKind: pending?.kind ?? null,
    error,
    watch,
    approve,
    submit,
    isResubmitting,
    resubmit,
    clearError: () => setError(null),
  };
}
