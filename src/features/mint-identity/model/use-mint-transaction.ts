import { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import type { CacheScope } from '@/shared/lib/cache';
import { useWriteAttempt } from '@/shared/model/use-write-attempt';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import {
  useMintAttemptAdapter,
  type HexHash,
  type MintedIdentity,
} from '@/features/mint-identity/model/mint-attempt-adapter';

export type { MintedIdentity };

export type MintTxStage = 'idle' | 'wallet' | 'pending';

type PendingKind = 'approve' | 'mint';

export interface MintTransactionError {
  readonly action: PendingKind;
  readonly message: string;
  /** Send-time recovery family: nonce mismatch / stale wallet block view. */
  readonly kind?: 'nonce' | 'staleBlock';
}

export interface MintTransactionState {
  readonly approveStage: MintTxStage;
  readonly mintStage: MintTxStage;
  /** Approval confirmed in this session (drives the ✓ 已授权 line). */
  readonly isApproved: boolean;
  readonly receipt: MintedIdentity | null;
  readonly error: MintTransactionError | null;
  /** Amount approved in this session, so stage 2 appears without waiting for a refetch. */
  readonly approvedAmount: bigint | null;
  readonly pendingHash: HexHash | null;
  /** Bounded wait for the submitted hash; the recovery card explains a stuck one. */
  readonly watch: TxWatch;
  readonly approve: (amount: bigint) => void;
  readonly mint: (name: string) => void;
  readonly clearReceipt: () => void;
  readonly clearError: () => void;
}

export interface UseMintTransactionOptions {
  readonly memberNftAddress: HexAddress | undefined;
  readonly paymentTokenAddress: HexAddress | undefined;
  readonly paymentTokenSymbol: string | undefined;
  /** Called once the approval or mint transaction is mined (refetch quote/balance). */
  readonly onConfirmed?: () => void;
}

/**
 * Approve → mint ladder and receipt recovery.
 *
 * The write itself, its `afterHash` persistence (only the mint hash), the
 * approve→mint ladder and the bounded wait live in the shared write-attempt core;
 * this hook only projects the core state onto the page's frozen props.
 *
 * Only the mint hash is persisted: it is the one transaction whose result is a
 * user-visible page state. An approval is recovered from `allowance()` instead
 * (a refresh simply leaves stage 1 visible only while allowance is short), so
 * the persisted shape stays `{ hash }` (UX spec §4.2).
 */
export function useMintTransaction(options: UseMintTransactionOptions): MintTransactionState {
  const { memberNftAddress, paymentTokenAddress, paymentTokenSymbol, onConfirmed } = options;
  const { address: account } = useAccount();
  const chainId = useChainId();
  const [missingReceiptLog, setMissingReceiptLog] = useState(false);
  // Revision of the approval that counts for ✓ 已授权; dismissing the receipt
  // invalidates it (the original `clearReceipt` reset).
  const [approvalFloor, setApprovalFloor] = useState(0);

  const scope: CacheScope | null = useMemo(
    () =>
      account !== undefined && memberNftAddress !== undefined
        ? { chainId, contractAddress: memberNftAddress, wallet: account }
        : null,
    [account, chainId, memberNftAddress],
  );

  const adapter = useMintAttemptAdapter({
    scope,
    chainId,
    account,
    memberNftAddress,
    paymentTokenAddress,
    paymentTokenSymbol,
    onMissingReceiptLog: () => setMissingReceiptLog(true),
    onConfirmed: () => onConfirmed?.(),
  });
  const attempt = useWriteAttempt(adapter);

  // A ✓ 已授权 belongs to the session wallet/chain, exactly like the original
  // hydration reset; a wallet switch must not carry it over.
  /* eslint-disable react-hooks/set-state-in-effect -- a wallet/chain switch invalidates the session approval */
  useEffect(() => {
    setApprovalFloor(attempt.approveRevision);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on wallet/chain change
  }, [account, chainId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const approvalIntent = attempt.lastApproval?.intent;
  const isApproved =
    attempt.lastApproval !== null &&
    attempt.approveRevision > approvalFloor &&
    attempt.approveStage === 'idle';
  const approvedAmount =
    isApproved && approvalIntent !== undefined && approvalIntent.action === 'approve'
      ? approvalIntent.amount
      : null;

  const approve = (amount: bigint): void => {
    if (memberNftAddress === undefined || paymentTokenAddress === undefined || amount <= 0n) {
      return;
    }
    if (attempt.isHydrating || attempt.stage !== 'idle' || attempt.approveStage !== 'idle') return;
    if (attempt.receipt !== null) return;
    setMissingReceiptLog(false);
    void attempt.approve(paymentTokenAddress.toLowerCase(), { action: 'approve', amount });
  };

  const mint = (name: string): void => {
    if (memberNftAddress === undefined || name.length === 0) return;
    if (attempt.isHydrating || attempt.stage !== 'idle' || attempt.approveStage !== 'idle') return;
    if (attempt.receipt !== null) return;
    setMissingReceiptLog(false);
    void attempt.run({ action: 'mint', name });
  };

  // A reverted mint and a mined mint without its log are different cards.
  const error: MintTransactionError | null =
    attempt.error === null
      ? null
      : missingReceiptLog
        ? { action: 'mint', message: copy.mintIdentity.receipt.missingMessage }
        : {
            action: adapter.lastAction(),
            message: attempt.error.message,
            ...(attempt.error.kind !== undefined ? { kind: attempt.error.kind } : {}),
          };

  const clearReceipt = (): void => {
    setMissingReceiptLog(false);
    setApprovalFloor(attempt.approveRevision);
    attempt.clearReceipt();
  };

  // Stage stays 'pending' for as long as a hash is in flight: a stuck transaction
  // is reported by the watcher card, it does not re-enable the CTA.
  return {
    approveStage: attempt.approveStage,
    mintStage: attempt.stage,
    isApproved,
    receipt: attempt.receipt,
    error,
    approvedAmount,
    pendingHash: attempt.pendingHash ?? attempt.approveHash,
    watch:
      attempt.stage === 'idle' && attempt.approveStage !== 'idle'
        ? attempt.approveWatch
        : attempt.watch,
    approve,
    mint,
    clearReceipt,
    clearError: () => {
      setMissingReceiptLog(false);
      attempt.clearError();
    },
  };
}
