import { useEffect, useRef, useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { describeApprovalError } from '@/features/approve-token/lib/approval-errors';
import { UNLIMITED_APPROVAL_VALUE } from '@/features/approve-token/lib/approval-amount';
import type {
  ApprovalMode,
  ApprovalRecord,
  ApprovalRequest,
  ApprovalTxError,
} from '@/features/approve-token/lib/approval-types';
import { useNextNonce, useTxWatch, type TxWatch } from '@/shared/model/use-tx-watch';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';

export type ApprovalStage = 'idle' | 'wallet' | 'pending';

export type { ApprovalTxError };

export interface ApprovalTransactionState {
  readonly stage: ApprovalStage;
  readonly record: ApprovalRecord | null;
  readonly error: ApprovalTxError | null;
  readonly watch: TxWatch;
  /** Resolves true when the wallet returned a hash (the sheet may close). */
  readonly submit: (request: ApprovalRequest) => Promise<boolean>;
  readonly resubmit: () => void;
  readonly clearRecord: () => void;
  readonly clearError: () => void;
}

interface PendingApproval {
  readonly hash: `0x${string}`;
  readonly request: ApprovalRequest;
}

/**
 * One 授权/撤销 write. Long-term writes `maxUint256`, revoke writes `0`; both
 * go through the shared bounded watcher so a dropped/nonce-gapped transaction
 * becomes a recovery card instead of an endless 确认中. A mined receipt calls
 * back into the page to refetch allowances, then surfaces a dismissible strip.
 */
export function useApprovalTransaction(onConfirmed: () => void): ApprovalTransactionState {
  const { address: account } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const readNextNonce = useNextNonce(account);

  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [record, setRecord] = useState<ApprovalRecord | null>(null);
  const [isWalletAction, setIsWalletAction] = useState(false);
  const [error, setError] = useState<ApprovalTxError | null>(null);
  const submittingRef = useRef(false);
  const lastAttemptRef = useRef<ApprovalRequest | null>(null);

  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  });

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
      setPending(null);
      setError({ message: copy.approvals.errors.reverted });
      onConfirmedRef.current();
      return;
    }

    const request = pending.request;
    setRecord({
      hash: pending.hash,
      spenderLabel: request.spenderLabel,
      tokenSymbol: request.tokenSymbol,
      mode: request.mode,
    });
    setPending(null);
    setError(null);
    onConfirmedRef.current();
  }, [onChainReceipt, pending]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const send = async (request: ApprovalRequest, nonce?: number): Promise<`0x${string}`> => {
    const nonceOption = nonce !== undefined ? { nonce } : {};
    return writeContractAsync({
      address: request.tokenAddress,
      abi: love20TokenAbi,
      functionName: 'approve',
      args: [request.spender, request.mode === 'unlimited' ? UNLIMITED_APPROVAL_VALUE : 0n],
      ...nonceOption,
    });
  };

  const submitInternal = async (request: ApprovalRequest, nonce?: number): Promise<boolean> => {
    if (submittingRef.current) return false;
    if (account === undefined) return false;
    setError(null);
    setIsWalletAction(true);
    submittingRef.current = true;
    try {
      const hash = await send(request, nonce);
      setPending({ hash, request });
      return true;
    } catch (cause) {
      const message = describeApprovalError(cause, {
        nativeSymbol: NETWORK.nativeCurrency.symbol,
        tokenSymbol: request.tokenSymbol,
        mode: request.mode,
      });
      const recovery = txSendRecoveryKind(cause);
      setError({ message, ...(recovery !== undefined ? { kind: recovery } : {}) });
      return false;
    } finally {
      setIsWalletAction(false);
      submittingRef.current = false;
    }
  };

  const submit = async (request: ApprovalRequest): Promise<boolean> => {
    if (submittingRef.current || pending !== null) return false;
    lastAttemptRef.current = request;
    return submitInternal(request);
  };

  const resubmit = (): void => {
    void (async () => {
      const request = pending?.request ?? lastAttemptRef.current;
      if (request === null || request === undefined) return;
      const nonce = await readNextNonce();
      if (nonce === undefined) {
        setError({ message: copy.txWatch.nonceUnavailable });
        return;
      }
      await submitInternal(request, nonce);
    })();
  };

  const stage: ApprovalStage = isWalletAction
    ? 'wallet'
    : pending !== null && !watch.isStuck
      ? 'pending'
      : 'idle';

  return {
    stage,
    record,
    error,
    watch,
    submit,
    resubmit,
    clearRecord: () => {
      setRecord(null);
      setPending(null);
      setError(null);
    },
    clearError: () => {
      setError(null);
    },
  };
}

/** The 长期授权/撤销 wording of a mined receipt, shared by the strip and tests. */
export function approvalActionLabel(mode: ApprovalMode, spenderLabel: string): string {
  return mode === 'unlimited'
    ? copy.approvals.stripUnlimited(spenderLabel)
    : copy.approvals.stripRevoked(spenderLabel);
}
