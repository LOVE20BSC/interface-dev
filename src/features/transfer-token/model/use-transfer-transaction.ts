import { useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { useWriteAttempt } from '@/shared/model/use-write-attempt';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import { createTransferScope } from '@/features/transfer-token/lib/transfer-record';
import type { TransferRecord } from '@/features/transfer-token/lib/transfer-receipt';
import {
  useTransferAttemptAdapter,
  type TransferRequest,
  type TransferTxError,
} from '@/features/transfer-token/model/transfer-attempt-adapter';

export type { TransferRequest, TransferTxError };

export type TransferStage = 'idle' | 'wallet' | 'pending';

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
  readonly submit: (request: TransferRequest) => Promise<void>;
  readonly clearReceipt: () => void;
  readonly clearError: () => void;
}

/**
 * One transfer, two write shapes: the native coin uses a plain value transfer,
 * every ERC20 uses `transfer(to, amount)` directly — there is no approval step
 * (and the page never mentions one). The write itself, its persistence policy and
 * the bounded wait live in the shared write-attempt core; this hook only projects
 * the core state onto the page's frozen props.
 *
 * D1 (owner 2026-11-14): the submitted hash + its request are persisted before
 * waiting. A refresh in the pending window restores the pending card and keeps
 * watching the SAME hash, so the form-level 确认转账 can never send the same
 * transfer a second time (the QA run saw the recipient credited twice). A
 * refresh after the receipt is mined restores only the success strip (D4); the
 * receipt sheet is a one-time page state and never pops up again.
 *
 * R3: a restored record carries `{chainId, account}` and is never signed by
 * another wallet.
 */
export function useTransferTransaction(onConfirmed: () => void): TransferTransactionState {
  const { address: account } = useAccount();
  const chainId = useChainId();

  const [restoredRecord, setRestoredRecord] = useState<TransferRecord | null>(null);
  const [hydrationError, setHydrationError] = useState<TransferTxError | null>(null);

  const scope = useMemo(
    () => (account !== undefined ? createTransferScope(chainId, account) : null),
    [account, chainId],
  );

  const adapter = useTransferAttemptAdapter({
    scope,
    chainId,
    account,
    onRestoredRecord: setRestoredRecord,
    onHydrationError: setHydrationError,
    onConfirmed,
  });
  const attempt = useWriteAttempt(adapter);

  const submit = async (request: TransferRequest): Promise<void> => {
    // D1: an in-flight or restored transfer blocks a second submission. The
    // panel disables the CTA for the same condition; this guard keeps the hook
    // honest when a stale click slips through.
    if (account === undefined || request.amount <= 0n) return;
    if (attempt.isHydrating || attempt.stage !== 'idle' || attempt.receipt !== null) return;
    setHydrationError(null);
    // The page never awaits `submit` (the CTA follows `stage`), and the core's
    // promise settles from an effect that needs the signed/rejected render.
    void attempt.run(request);
  };

  return {
    stage: attempt.stage,
    receipt: attempt.receipt,
    restoredRecord,
    pendingHash: attempt.pendingHash,
    error: attempt.error ?? hydrationError,
    watch: attempt.watch,
    isHydrating: attempt.isHydrating,
    submit,
    clearReceipt: () => {
      setHydrationError(null);
      attempt.clearReceipt();
    },
    clearError: () => {
      setHydrationError(null);
      attempt.clearError();
    },
  };
}
