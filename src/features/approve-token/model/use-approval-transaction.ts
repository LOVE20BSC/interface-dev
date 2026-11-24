import { useState } from 'react';
import { useAccount } from 'wagmi';
import { copy } from '@/shared/config/copy-pages';
import { useWriteAttempt } from '@/shared/model/use-write-attempt';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import type {
  ApprovalMode,
  ApprovalRecord,
  ApprovalRequest,
  ApprovalTxError,
} from '@/features/approve-token/lib/approval-types';
import { useApprovalAttemptAdapter } from '@/features/approve-token/model/approval-attempt-adapter';

export type ApprovalStage = 'idle' | 'wallet' | 'pending';

export type { ApprovalTxError };

export interface ApprovalTransactionState {
  readonly stage: ApprovalStage;
  readonly record: ApprovalRecord | null;
  readonly error: ApprovalTxError | null;
  readonly watch: TxWatch;
  /** Resolves true when the wallet returned a hash (the sheet may close). */
  readonly submit: (request: ApprovalRequest) => Promise<boolean>;
  readonly clearRecord: () => void;
  readonly clearError: () => void;
}

/**
 * One 授权/撤销 write. Long-term writes `maxUint256`, revoke writes `0`; the write
 * itself and the bounded wait live in the shared write-attempt core. A mined
 * receipt calls back into the page to refetch allowances, then surfaces a
 * dismissible strip. Nothing is persisted: an approval is never resumed after a
 * reload.
 */
export function useApprovalTransaction(onConfirmed: () => void): ApprovalTransactionState {
  const { address: account } = useAccount();
  const [retainedRecord, setRetainedRecord] = useState<ApprovalRecord | null>(null);

  const adapter = useApprovalAttemptAdapter({ onConfirmed });
  const attempt = useWriteAttempt(adapter);

  const submit = (request: ApprovalRequest): Promise<boolean> => {
    if (account === undefined) return Promise.resolve(false);
    const settled = attempt.receipt;
    if (settled !== null) {
      // A second 授权/撤销 starts a fresh attempt; the settled strip stays visible
      // until the new receipt replaces it or the user dismisses it.
      setRetainedRecord(settled);
      attempt.clearReceipt();
    }
    return attempt.run(request);
  };

  return {
    stage: attempt.stage,
    record: attempt.receipt ?? retainedRecord,
    error: attempt.error,
    watch: attempt.watch,
    submit,
    clearRecord: () => {
      setRetainedRecord(null);
      attempt.clearReceipt();
    },
    clearError: () => {
      attempt.clearError();
    },
  };
}

/** The 长期授权/撤销 wording of a mined receipt, shared by the strip and tests. */
export function approvalActionLabel(mode: ApprovalMode, spenderLabel: string): string {
  return mode === 'unlimited'
    ? copy.approvals.stripUnlimited(spenderLabel)
    : copy.approvals.stripRevoked(spenderLabel);
}
