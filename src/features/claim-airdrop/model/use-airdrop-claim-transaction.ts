import { useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import type { HexAddress } from '@/config/networks';
import type { AirdropSnapshotEntry } from '@/domain/airdrop-snapshot';
import { copy } from '@/shared/config/copy-pages';
import { useWriteAttempt } from '@/shared/model/use-write-attempt';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import {
  createAirdropClaimScope,
  type AirdropClaimReceipt,
  type HexHash,
} from '@/features/claim-airdrop/lib/airdrop-claim-record';
import {
  useAirdropClaimAttemptAdapter,
  type AirdropClaimIntent,
} from '@/features/claim-airdrop/model/airdrop-attempt-adapter';

export type AirdropClaimTxStage = 'idle' | 'wallet' | 'pending';

export interface AirdropClaimTransactionState {
  readonly stage: AirdropClaimTxStage;
  readonly receipt: AirdropClaimReceipt | null;
  readonly pendingHash: HexHash | null;
  readonly error: string | null;
  /** Send-time recovery family: nonce mismatch / stale wallet block view. */
  readonly errorKind: 'nonce' | 'staleBlock' | null;
  /** False until the local pending/receipt record has been read. */
  readonly isHydrating: boolean;
  /** Bounded wait for the submitted hash; `isStuck` frees the CTA + shows recovery. */
  readonly watch: TxWatch;
  readonly claim: () => void;
  readonly clearError: () => void;
}

export interface AirdropClaimTransactionOptions {
  readonly airdropAddress: HexAddress | undefined;
  readonly tokenAddress: HexAddress | undefined;
  readonly tokenSymbol: string | undefined;
  readonly tokenDecimals: number | undefined;
  readonly totalShare: bigint | undefined;
  readonly entry: AirdropSnapshotEntry | null;
  /** Refetch eligibility after a mine/revert so the page leaves the stale state. */
  readonly onConfirmed?: () => void;
}

/**
 * Single-step claim transaction (no ERC20 approval: the airdrop contract pays
 * the token itself). Pending grammar is 铸造中… (wallet) → 确认中… (submitted).
 * The write itself, its persistence policy and the bounded wait live in the shared
 * write-attempt core; this hook only projects the core state onto the page's
 * frozen props.
 *
 * The hash is persisted before waiting, so a refresh resumes the receipt. The
 * confirmed record stores AirdropClaimed.amount — the estimate is never used as
 * the final number. Local storage is wallet/chain/contract scoped by cache.ts.
 */
export function useAirdropClaimTransaction(
  options: AirdropClaimTransactionOptions,
): AirdropClaimTransactionState {
  const {
    airdropAddress,
    tokenAddress,
    tokenSymbol,
    tokenDecimals,
    totalShare,
    entry,
    onConfirmed,
  } = options;
  const { address: account } = useAccount();
  const chainId = useChainId();
  const [missingReceiptLog, setMissingReceiptLog] = useState(false);

  const scope = useMemo(
    () =>
      account !== undefined && airdropAddress !== undefined
        ? createAirdropClaimScope(chainId, airdropAddress, account)
        : null,
    [account, airdropAddress, chainId],
  );

  const adapter = useAirdropClaimAttemptAdapter({
    scope,
    chainId,
    account,
    airdropAddress,
    tokenAddress,
    tokenSymbol,
    tokenDecimals,
    totalShare,
    entry,
    onMissingReceiptLog: () => setMissingReceiptLog(true),
    onConfirmed: () => onConfirmed?.(),
  });
  const attempt = useWriteAttempt(adapter);

  const claim = (): void => {
    if (attempt.isHydrating || attempt.stage !== 'idle' || attempt.receipt !== null) return;
    if (airdropAddress === undefined || tokenAddress === undefined || account === undefined) return;
    if (entry === null) return;
    const intent: AirdropClaimIntent = {
      tokenAddress,
      share: entry.share,
      proof: entry.proof,
    };
    setMissingReceiptLog(false);
    void attempt.run(intent).then((started) => {
      // A failed send may mean another device already claimed first
      // (AlreadyClaimed) or that the pool changed: resync so the page does not
      // keep offering the CTA.
      if (!started) onConfirmed?.();
    });
  };

  // A claimed receipt whose AirdropClaimed log could not be read is not a revert:
  // the transaction was submitted, only the amount is still unknown.
  const error =
    attempt.error === null
      ? null
      : missingReceiptLog
        ? copy.airdrop.receipt.missingBody
        : attempt.error.message;

  return {
    stage: attempt.stage,
    receipt: attempt.receipt,
    pendingHash: attempt.pendingHash,
    error,
    errorKind: attempt.error?.kind ?? null,
    isHydrating: attempt.isHydrating,
    watch: attempt.watch,
    claim,
    clearError: () => {
      setMissingReceiptLog(false);
      attempt.clearError();
    },
  };
}
