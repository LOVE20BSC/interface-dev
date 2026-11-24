import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import type { HexAddress } from '@/config/networks';
import { useWriteAttempt } from '@/shared/model/use-write-attempt';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import { swapRetryLabel } from '@/features/swap-token/lib/swap-errors';
import {
  createSwapScope,
  swapRecordMatchesPair,
  type SwapRecord,
} from '@/features/swap-token/lib/swap-receipt-record';
import type { SwapRoute, SwapToken } from '@/features/swap-token/lib/swap-types';
import { swapTokenKey } from '@/features/swap-token/lib/swap-types';
import {
  swapMainIntent,
  useSwapAttemptAdapter,
  type SwapTxAction,
} from '@/features/swap-token/model/swap-attempt-adapter';

export type SwapTxStage = 'idle' | 'wallet' | 'pending';

export type { SwapTxAction };

export interface SwapTxError {
  readonly action: SwapTxAction;
  readonly message: string;
  readonly retryLabel: string | undefined;
  /** Send-time recovery family: nonce mismatch / stale wallet block view. */
  readonly kind?: 'nonce' | 'staleBlock';
}

export interface SwapTransactionInput {
  readonly router: HexAddress | undefined;
  readonly wrappedAddress: HexAddress | undefined;
  readonly from: SwapToken | undefined;
  readonly to: SwapToken | undefined;
  readonly route: SwapRoute | null;
  readonly nativeSymbol: string;
  readonly onConfirmed?: () => void;
}

export interface SwapExecution {
  readonly amountIn: bigint;
  readonly minOut: bigint;
  readonly quoteOut: bigint | undefined;
}

export interface SwapTransactionState {
  readonly approveStage: SwapTxStage;
  readonly swapStage: SwapTxStage;
  readonly isApproved: boolean;
  readonly approvedAmount: bigint | null;
  readonly receipt: SwapRecord | null;
  readonly pendingHash: `0x${string}` | null;
  readonly pendingKind: SwapTxAction | null;
  readonly error: SwapTxError | null;
  readonly isHydrating: boolean;
  /** Bounded wait for the submitted hash; the recovery card explains a stuck one. */
  readonly watch: TxWatch;
  readonly approve: (amount: bigint) => void;
  readonly execute: (execution: SwapExecution) => Promise<void>;
  readonly clearReceipt: () => void;
  readonly clearError: () => void;
}

/**
 * ERC20 input: exact-amount approve first, then the swap. The mint ladder's
 * grammar is reused: wallet → 确认中 → mined. The hash (and all receipt context)
 * is persisted before waiting so a refresh resumes the pending transaction.
 *
 * The write itself, its `afterHash` persistence, the approve→swap ladder and the
 * bounded wait live in the shared write-attempt core; this hook only projects the
 * core state onto the page's frozen props. The receipt wait is still the shared
 * `useTxWatch`: a dropped/replaced/nonce-gapped transaction becomes an actionable
 * recovery card instead of an endless 确认中.
 */
export function useSwapTransaction(options: SwapTransactionInput): SwapTransactionState {
  const { router, wrappedAddress, from, to, route, nativeSymbol, onConfirmed } = options;
  const { address: account } = useAccount();
  const chainId = useChainId();
  // Revision of the approval that counts for the current input token. Switching
  // the token (or dismissing the receipt) invalidates an earlier ✓ 已授权.
  const [approvalFloor, setApprovalFloor] = useState(0);
  // `execute` keeps its pre-migration `Promise<void>` shape: it settles when the
  // main hash is persisted. The core's own promise resolves from a wallet→pending
  // render, which a fast/mocked wallet can fold into one commit while awaiting.
  const sendWaiter = useRef<(() => void) | null>(null);
  const settleSend = (): void => {
    const resolve = sendWaiter.current;
    sendWaiter.current = null;
    resolve?.();
  };

  const fromKey = from !== undefined ? swapTokenKey(from) : '';

  const scope = useMemo(
    () =>
      account !== undefined && router !== undefined
        ? createSwapScope(chainId, router, account)
        : null,
    [account, chainId, router],
  );

  const adapter = useSwapAttemptAdapter({
    scope,
    chainId,
    account,
    router,
    wrappedAddress,
    nativeSymbol,
    fromSymbol: from?.symbol ?? '',
    ...(onConfirmed !== undefined ? { onConfirmed } : {}),
    onSendFailed: () => settleSend(),
    onRecordWritten: () => settleSend(),
  });
  const attempt = useWriteAttempt(adapter);

  // An approval belongs to one token/wallet; switching either must not reuse it.
  /* eslint-disable react-hooks/set-state-in-effect -- a token/wallet switch invalidates the session approval */
  useEffect(() => {
    setApprovalFloor(attempt.approveRevision);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on token/wallet change
  }, [fromKey, account, chainId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // A receipt from another pair must not disable the current form.
  const activeReceipt =
    attempt.receipt !== null &&
    from !== undefined &&
    to !== undefined &&
    swapRecordMatchesPair(attempt.receipt, from, to)
      ? attempt.receipt
      : null;

  const approvalIntent = attempt.lastApproval?.intent;
  const approvedAmount =
    attempt.lastApproval !== null &&
    from?.address !== undefined &&
    attempt.lastApproval.key === from.address.toLowerCase() &&
    attempt.approveRevision > approvalFloor &&
    attempt.approveStage === 'idle' &&
    approvalIntent?.action === 'approve'
      ? approvalIntent.amount
      : null;
  const isApproved = approvedAmount !== null;

  const approve = (amount: bigint): void => {
    if (attempt.isHydrating || attempt.stage !== 'idle' || attempt.approveStage !== 'idle') return;
    if (activeReceipt !== null) return;
    if (
      from === undefined ||
      from.kind === 'native' ||
      from.address === undefined ||
      router === undefined ||
      amount <= 0n
    ) {
      return;
    }
    void attempt.approve(from.address.toLowerCase(), {
      action: 'approve',
      tokenAddress: from.address,
      amount,
    });
  };

  const execute = async (execution: SwapExecution): Promise<void> => {
    if (attempt.isHydrating || attempt.stage !== 'idle' || attempt.approveStage !== 'idle') return;
    if (activeReceipt !== null) return;
    // A settled receipt for another pair is not page state; release it so the
    // core does not treat it as a submit guard.
    if (attempt.receipt !== null) attempt.clearReceipt();
    if (
      router === undefined ||
      account === undefined ||
      from === undefined ||
      to === undefined ||
      route === null ||
      execution.amountIn <= 0n
    ) {
      return;
    }
    const sent = new Promise<void>((resolve) => {
      sendWaiter.current = resolve;
    });
    void attempt.run(swapMainIntent(route, from, to, execution)).then((ok) => {
      if (!ok) settleSend();
    });
    await sent;
  };

  const clearReceipt = (): void => {
    setApprovalFloor(attempt.approveRevision);
    attempt.clearReceipt();
  };

  // Stage stays 'pending' for as long as a hash is in flight: a stuck transaction
  // is reported by the watcher card, it does not re-enable the CTA.
  const error: SwapTxError | null =
    attempt.error === null
      ? null
      : {
          action: adapter.lastAction(),
          message: attempt.error.message,
          retryLabel: swapRetryLabel(attempt.error.message),
          ...(attempt.error.kind !== undefined ? { kind: attempt.error.kind } : {}),
        };

  return {
    approveStage: attempt.approveStage,
    swapStage: attempt.stage,
    isApproved,
    approvedAmount,
    receipt: activeReceipt,
    pendingHash: attempt.pendingHash ?? attempt.approveHash,
    pendingKind:
      attempt.stage === 'pending' ? 'swap' : attempt.approveStage === 'pending' ? 'approve' : null,
    error,
    isHydrating: attempt.isHydrating,
    watch:
      attempt.stage === 'idle' && attempt.approveStage !== 'idle'
        ? attempt.approveWatch
        : attempt.watch,
    approve,
    execute,
    clearReceipt,
    clearError: () => {
      attempt.clearError();
    },
  };
}
