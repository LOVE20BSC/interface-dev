import { useEffect, useMemo, useRef } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { useWriteAttempt } from '@/shared/model/use-write-attempt';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import type { BatchErrorMessage } from '@/features/batch-transfer/lib/batch-errors';
import {
  createBatchScope,
  type BatchPendingKind,
} from '@/features/batch-transfer/lib/batch-record';
import type { BatchRequest } from '@/features/batch-transfer/lib/batch-types';
import {
  batchApproveKey,
  useBatchAttemptAdapter,
} from '@/features/batch-transfer/model/batch-attempt-adapter';

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
  readonly clearError: () => void;
}

export interface UseBatchTransactionOptions {
  readonly onApproved: () => void;
  readonly onBatchConfirmed: (hash: `0x${string}`, request: BatchRequest) => void;
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
 * The write itself, its `afterHash` persistence and the bounded wait live in the
 * shared write-attempt core; this hook only projects the core state onto the
 * page's frozen props. Owner 2026-11-23 removed the re-send: the record is only
 * written once the wallet returned a hash, so a refresh restores the in-flight
 * card (and blocks a second batch) while a rejected send is just an error.
 */
export function useBatchTransaction(options: UseBatchTransactionOptions): BatchTransactionState {
  const { address: account } = useAccount();
  const chainId = useChainId();

  const scope = useMemo(
    () => (account !== undefined ? createBatchScope(chainId, account) : null),
    [account, chainId],
  );

  // `approve` / `submit` keep their pre-migration `Promise<void>` shape: the
  // promise settles when the hash is persisted (main) or the approval hash is
  // returned. The core's own promise resolves from a wallet→pending render, which
  // a fast/mocked wallet can fold into a single commit while a caller awaits.
  const waiter = useRef<{ step: 'main' | 'approve'; resolve: () => void } | null>(null);
  const settleSend = (step: 'main' | 'approve'): void => {
    const current = waiter.current;
    if (current === null || current.step !== step) return;
    waiter.current = null;
    current.resolve();
  };
  const waitForSend = (step: 'main' | 'approve'): Promise<void> =>
    new Promise<void>((resolve) => {
      waiter.current = { step, resolve };
    });

  const adapter = useBatchAttemptAdapter({
    scope,
    onApproved: options.onApproved,
    onBatchConfirmed: options.onBatchConfirmed,
    // An approval has no persisted record; its hash is the settle point. The main
    // step settles once `writeRecord` has run (hash persisted) or the send failed.
    onHash: (step) => {
      if (step === 'approve') settleSend('approve');
    },
    onSendFailed: (step) => settleSend(step === 'approve' ? 'approve' : 'main'),
    onRecordWritten: () => settleSend('main'),
  });
  const attempt = useWriteAttempt(adapter);

  // 批量转账 has no receipt sheet: the core's settled main slot must be released
  // again so the next batch can start (the panel keeps its own receipt state).
  useEffect(() => {
    if (attempt.receipt !== null) attempt.clearReceipt();
  }, [attempt]);

  const approve = async (request: BatchRequest): Promise<void> => {
    if (account === undefined || request.rows.length === 0) return;
    if (attempt.isHydrating || attempt.stage !== 'idle' || attempt.approveStage !== 'idle') return;
    const sent = waitForSend('approve');
    void attempt.approve(batchApproveKey(request), request).then((ok) => {
      if (!ok) settleSend('approve');
    });
    await sent;
  };

  const submit = async (request: BatchRequest): Promise<void> => {
    if (account === undefined || request.rows.length === 0) return;
    if (attempt.isHydrating || attempt.stage !== 'idle' || attempt.approveStage !== 'idle') return;
    if (attempt.receipt !== null) return;
    const sent = waitForSend('main');
    void attempt.run(request).then((ok) => {
      if (!ok) settleSend('main');
    });
    await sent;
  };

  // One stage for the panel: whichever slot is busy. An approval restored from an
  // older record keeps saying 授权确认中 and watches the approval hash.
  const stage: BatchStage = attempt.stage !== 'idle' ? attempt.stage : attempt.approveStage;
  const pendingKind: BatchPendingKind | null =
    attempt.stage === 'pending' ? 'batch' : attempt.approveStage === 'pending' ? 'approve' : null;
  const watch =
    attempt.stage === 'idle' && attempt.approveStage !== 'idle'
      ? attempt.approveWatch
      : attempt.watch;

  return {
    stage,
    pendingKind,
    error: attempt.error,
    watch,
    approve,
    submit,
    clearError: () => attempt.clearError(),
  };
}
