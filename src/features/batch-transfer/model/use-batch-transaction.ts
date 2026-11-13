import { useEffect, useRef, useState } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { batchTransferAbi, love20TokenAbi } from '@/config/abis';
import { NETWORK, configuredAddress, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { useNextNonce, useTxWatch, type TxWatch } from '@/shared/model/use-tx-watch';
import { describeBatchError, type BatchErrorMessage } from '@/features/batch-transfer/lib/batch-errors';
import type { BatchRequest } from '@/features/batch-transfer/lib/batch-types';

export type BatchStage = 'idle' | 'wallet' | 'pending';
export type BatchPendingKind = 'approve' | 'batch';

export interface BatchTransactionState {
  readonly stage: BatchStage;
  readonly pendingKind: BatchPendingKind | null;
  readonly error: BatchErrorMessage | null;
  readonly watch: TxWatch;
  /** `approve(BatchTransfer, 合计)`; the panel re-reads the allowance on confirm. */
  readonly approve: (request: BatchRequest) => Promise<void>;
  /** Simulates, then sends the batch. A simulation failure never asks the wallet. */
  readonly submit: (request: BatchRequest) => Promise<void>;
  readonly resubmit: () => void;
  readonly clearError: () => void;
}

export interface UseBatchTransactionOptions {
  readonly onApproved: () => void;
  readonly onBatchConfirmed: (hash: `0x${string}`, request: BatchRequest) => void;
}

interface PendingBatch {
  readonly hash: `0x${string}`;
  readonly kind: BatchPendingKind;
  readonly request: BatchRequest;
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
 * with 「重新提交」 (explicit on-chain nonce), exactly like 代币转账.
 */
export function useBatchTransaction(
  options: UseBatchTransactionOptions,
): BatchTransactionState {
  const { address: account } = useAccount();
  const batchTransfer = configuredAddress('batchTransfer');
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const readNextNonce = useNextNonce(account);

  const [pending, setPending] = useState<PendingBatch | null>(null);
  const [isWalletAction, setIsWalletAction] = useState(false);
  const [error, setError] = useState<BatchErrorMessage | null>(null);
  const submittingRef = useRef(false);
  const lastAttemptRef = useRef<PendingBatch | null>(null);

  const onApprovedRef = useRef(options.onApproved);
  const onBatchConfirmedRef = useRef(options.onBatchConfirmed);
  useEffect(() => {
    onApprovedRef.current = options.onApproved;
    onBatchConfirmedRef.current = options.onBatchConfirmed;
  });

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
      setPending(null);
      setError({
        message:
          pending.kind === 'approve'
            ? copy.batchTransfer.errors.approveReverted
            : copy.batchTransfer.errors.reverted,
      });
      return;
    }

    setPending(null);
    if (pending.kind === 'approve') {
      onApprovedRef.current();
    } else {
      onBatchConfirmedRef.current(pending.hash, pending.request);
    }
  }, [mined, pending]);
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

  const submitInternal = async (
    request: BatchRequest,
    kind: BatchPendingKind,
    nonce?: number,
  ): Promise<void> => {
    if (submittingRef.current) return;
    if (account === undefined || request.rows.length === 0) return;
    setError(null);
    setIsWalletAction(true);
    submittingRef.current = true;
    try {
      const hash = kind === 'approve' ? await sendApprove(request, nonce) : await sendBatch(request, nonce);
      lastAttemptRef.current = { hash, kind, request };
      setPending({ hash, kind, request });
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
    if (submittingRef.current || pending !== null) return;
    await submitInternal(request, 'batch');
  };

  const resubmit = (): void => {
    void (async () => {
      const attempt = pending ?? lastAttemptRef.current;
      if (attempt === null) return;
      const nonce = await readNextNonce();
      if (nonce === undefined) {
        setError({ message: copy.txWatch.nonceUnavailable });
        return;
      }
      await submitInternal(attempt.request, attempt.kind, nonce);
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
    resubmit,
    clearError: () => setError(null),
  };
}
