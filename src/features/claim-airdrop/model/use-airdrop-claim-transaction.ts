import { useEffect, useMemo, useRef, useState } from 'react';
import { parseEventLogs } from 'viem';
import { useAccount, useChainId, useTransactionReceipt, useWriteContract } from 'wagmi';
import { airdropAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import type { AirdropSnapshotEntry } from '@/domain/airdrop-snapshot';
import { copy } from '@/shared/config/copy';
import { describeAirdropClaimError } from '@/features/claim-airdrop/lib/airdrop-errors';
import {
  clearAirdropClaimRecord,
  createAirdropClaimScope,
  readAirdropClaimRecord,
  writeAirdropClaimPending,
  writeAirdropClaimReceipt,
  type AirdropClaimReceipt,
  type HexHash,
} from '@/features/claim-airdrop/lib/airdrop-claim-record';

export type AirdropClaimTxStage = 'idle' | 'wallet' | 'pending';

export interface AirdropClaimTransactionState {
  readonly stage: AirdropClaimTxStage;
  readonly receipt: AirdropClaimReceipt | null;
  readonly pendingHash: HexHash | null;
  readonly error: string | null;
  /** False until the local pending/receipt record has been read. */
  readonly isHydrating: boolean;
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

  const [pending, setPending] = useState<PendingClaim | null>(null);
  const [receipt, setReceipt] = useState<AirdropClaimReceipt | null>(null);
  const [walletAction, setWalletAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setWalletAction(false);
    setIsHydrating(true);
    submittingRef.current = false;
    if (scope === null) {
      setIsHydrating(false);
      return;
    }
    const stored = readAirdropClaimRecord(scope);
    if (stored !== null) {
      if (stored.amount !== undefined) setReceipt(stored);
      else setPending({ hash: stored.hash });
    }
    setIsHydrating(false);
  }, [scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const receiptQuery = useTransactionReceipt({
    ...(pending !== null ? { hash: pending.hash } : {}),
    query: { enabled: pending !== null },
  });
  const onChainReceipt = receiptQuery.data;

  /* eslint-disable react-hooks/set-state-in-effect -- a mined receipt is an external chain fact */
  useEffect(() => {
    if (pending === null || onChainReceipt === undefined) return;

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
          abi: airdropAbi,
          logs: onChainReceipt.logs,
          eventName: 'AirdropClaimed',
        });
      } catch {
        return [];
      }
    })();
    const event = events.find((candidate) => {
      const args = candidate.args;
      const eventAccount = args.account;
      const eventToken = args.token;
      return (
        account !== undefined &&
        tokenAddress !== undefined &&
        typeof eventAccount === 'string' &&
        typeof eventToken === 'string' &&
        eventAccount.toLowerCase() === account.toLowerCase() &&
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
    if (scope !== null) writeAirdropClaimReceipt(scope, nextReceipt);
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

  // A hash from a previous chain that no longer exists would otherwise leave the
  // page stuck in 确认中 forever. This is a one-shot read, not a polling loop.
  /* eslint-disable react-hooks/set-state-in-effect -- the receipt query is an external system */
  useEffect(() => {
    if (pending === null || !receiptQuery.isError) return;
    if (scope !== null) clearAirdropClaimRecord(scope);
    setPending(null);
    setError(copy.airdrop.errors.pendingUnknown);
    onConfirmedRef.current?.();
  }, [pending, receiptQuery.isError, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const claim = (): void => {
    if (submittingRef.current || receipt !== null || pending !== null) return;
    if (
      airdropAddress === undefined ||
      tokenAddress === undefined ||
      account === undefined ||
      entry === null
    ) {
      return;
    }
    setError(null);
    setWalletAction(true);
    submittingRef.current = true;
    void (async () => {
      try {
        const hash = await writeContractAsync({
          address: airdropAddress,
          abi: airdropAbi,
          functionName: 'claim',
          args: [tokenAddress, account, entry.share, entry.proof],
        });
        // Persist before waiting: a refresh while pending must recover this hash.
        if (scope !== null) writeAirdropClaimPending(scope, hash);
        setPending({ hash });
      } catch (cause) {
        setError(describeAirdropClaimError(cause));
        // Another device may have claimed first (AlreadyClaimed), or the pool
        // may have changed: resync so the page does not keep offering the CTA.
        onConfirmedRef.current?.();
      } finally {
        setWalletAction(false);
        submittingRef.current = false;
      }
    })();
  };

  const stage: AirdropClaimTxStage = walletAction
    ? 'wallet'
    : pending !== null
      ? 'pending'
      : 'idle';

  return {
    stage,
    receipt,
    pendingHash: pending?.hash ?? null,
    error,
    isHydrating,
    claim,
    clearError: () => {
      setError(null);
    },
  };
}
