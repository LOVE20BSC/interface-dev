import { useEffect, useMemo, useRef, useState } from 'react';
import { parseEventLogs } from 'viem';
import { useAccount, useChainId, useWriteContract } from 'wagmi';
import { airdropDistributorAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import type { AirdropSnapshotEntry } from '@/domain/airdrop-snapshot';
import { copy } from '@/shared/config/copy-pages';
import { useNextNonce, useTxWatch, type TxWatch } from '@/shared/model/use-tx-watch';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';
import { describeAirdropClaimError } from '@/features/claim-airdrop/lib/airdrop-errors';
import {
  clearAirdropClaimRecord,
  createAirdropClaimScope,
  readAirdropClaimRecord,
  writeAirdropClaimPending,
  type AirdropClaimReceipt,
  type HexHash,
} from '@/features/claim-airdrop/lib/airdrop-claim-record';

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
  /** Re-sends the claim with an explicitly correct nonce (recovery card). */
  readonly resubmit: () => void;
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

interface PendingClaim {
  readonly hash: HexHash;
}

/**
 * Single-step claim transaction (no ERC20 approval: the airdrop contract pays
 * the token itself). Pending grammar is 铸造中… (wallet) → 确认中… (submitted).
 *
 * The hash is persisted before waiting, so a refresh resumes the receipt. The
 * confirmed record stores AirdropClaimed.amount — the estimate is never used as
 * the final number. Local storage is wallet/chain/contract scoped by cache.ts.
 *
 * The receipt wait is the shared bounded watcher (`useTxWatch`): a dropped,
 * replaced or nonce-gapped claim becomes an actionable recovery card instead of
 * an endless 确认中.
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
  const { writeContractAsync } = useWriteContract();
  const readNextNonce = useNextNonce(account);

  const [pending, setPending] = useState<PendingClaim | null>(null);
  const [receipt, setReceipt] = useState<AirdropClaimReceipt | null>(null);
  const [walletAction, setWalletAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'nonce' | 'staleBlock' | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const submittingRef = useRef(false);

  const onConfirmedRef = useRef<(() => void) | undefined>(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  });

  const scope = useMemo(
    () =>
      account !== undefined && airdropAddress !== undefined
        ? createAirdropClaimScope(chainId, airdropAddress, account)
        : null,
    [account, airdropAddress, chainId],
  );

  // A refresh must resume the pending hash or show the confirmed receipt,
  // instead of offering a second mint.
  /* eslint-disable react-hooks/set-state-in-effect -- hydration from the namespaced cache */
  useEffect(() => {
    setPending(null);
    setReceipt(null);
    setError(null);
    setErrorKind(null);
    setWalletAction(false);
    setIsHydrating(true);
    submittingRef.current = false;
    if (scope === null) {
      setIsHydrating(false);
      return;
    }
    const stored = readAirdropClaimRecord(scope);
    // Only an unconfirmed hash is resumed. A confirmed receipt is shown once in
    // the session that mined it; revisiting the page must not replay it (owner
    // 2026-11-14) — the page falls back to its S6 已铸造 state from the chain.
    if (stored !== null) {
      if (stored.amount !== undefined) clearAirdropClaimRecord(scope);
      else setPending({ hash: stored.hash });
    }
    setIsHydrating(false);
  }, [scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const watch = useTxWatch({
    hash: pending?.hash ?? null,
    wallet: account,
    walletAction,
    enabled: pending !== null,
  });
  const onChainReceipt = watch.receipt;

  /* eslint-disable react-hooks/set-state-in-effect -- a mined receipt is an external chain fact */
  useEffect(() => {
    if (pending === null || onChainReceipt === null) return;

    if (onChainReceipt.status === 'reverted') {
      if (scope !== null) clearAirdropClaimRecord(scope);
      setPending(null);
      setError(copy.airdrop.errors.reverted);
      onConfirmedRef.current?.();
      return;
    }

    // A malformed log must show a neutral result, never crash or show the estimate.
    const events = (() => {
      try {
        return parseEventLogs({
          abi: airdropDistributorAbi,
          logs: onChainReceipt.logs,
          eventName: 'AirdropClaimed',
        });
      } catch {
        return [];
      }
    })();
    const event = events.find((candidate) => {
      const args = candidate.args;
      const eventClaimer = args.claimer;
      const eventToken = args.tokenAddress;
      return (
        account !== undefined &&
        tokenAddress !== undefined &&
        typeof eventClaimer === 'string' &&
        typeof eventToken === 'string' &&
        eventClaimer.toLowerCase() === account.toLowerCase() &&
        eventToken.toLowerCase() === tokenAddress.toLowerCase()
      );
    });

    if (event === undefined) {
      if (scope !== null) clearAirdropClaimRecord(scope);
      setPending(null);
      setError(copy.airdrop.receipt.missingBody);
      onConfirmedRef.current?.();
      return;
    }

    const nextReceipt: AirdropClaimReceipt = {
      hash: onChainReceipt.transactionHash,
      amount: event.args.amount,
      share: event.args.share,
      totalShare,
      remainingShare: event.args.remainingShare,
      tokenSymbol,
      tokenDecimals,
      recordedAt: Date.now(),
    };
    if (scope !== null) clearAirdropClaimRecord(scope);
    setReceipt(nextReceipt);
    setPending(null);
    setError(null);
    onConfirmedRef.current?.();
  }, [
    account,
    onChainReceipt,
    pending,
    scope,
    tokenAddress,
    tokenDecimals,
    tokenSymbol,
    totalShare,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** One place for the claim write, so 「重新提交」 reuses the exact same call. */
  const submitClaim = async (nonce?: number): Promise<void> => {
    if (submittingRef.current) return;
    if (airdropAddress === undefined || tokenAddress === undefined || account === undefined) return;
    if (entry === null) return;
    setError(null);
    setErrorKind(null);
    setWalletAction(true);
    submittingRef.current = true;
    try {
      const hash = await writeContractAsync({
        address: airdropAddress,
        abi: airdropDistributorAbi,
        functionName: 'claim',
        args: [tokenAddress, entry.share, entry.proof],
        ...(nonce !== undefined ? { nonce } : {}),
      });
      // Persist before waiting: a refresh while pending must recover this hash.
      if (scope !== null) writeAirdropClaimPending(scope, hash);
      setPending({ hash });
    } catch (cause) {
      setError(describeAirdropClaimError(cause));
      setErrorKind(txSendRecoveryKind(cause) ?? null);
      // Another device may have claimed first (AlreadyClaimed), or the pool
      // may have changed: resync so the page does not keep offering the CTA.
      onConfirmedRef.current?.();
    } finally {
      setWalletAction(false);
      submittingRef.current = false;
    }
  };

  const claim = (): void => {
    if (submittingRef.current || receipt !== null) return;
    if (pending !== null && !watch.isStuck) return;
    void submitClaim();
  };

  /**
   * Recovery action for a stuck hash: re-send the same claim with the on-chain
   * nonce, so a wallet that cached a stale nonce heals the gap itself.
   */
  const resubmit = (): void => {
    void (async () => {
      const nonce = await readNextNonce();
      if (nonce === undefined) {
        setError(copy.txWatch.nonceUnavailable);
        setErrorKind(null);
        return;
      }
      await submitClaim(nonce);
    })();
  };

  // A stuck hash frees the CTA; the recovery card owns the manual actions.
  const stage: AirdropClaimTxStage = walletAction
    ? 'wallet'
    : pending !== null && !watch.isStuck
      ? 'pending'
      : 'idle';

  return {
    stage,
    receipt,
    pendingHash: pending?.hash ?? null,
    error,
    errorKind,
    isHydrating,
    watch,
    resubmit,
    claim,
    clearError: () => {
      setError(null);
      setErrorKind(null);
    },
  };
}
