import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useTransactionReceipt, useWriteContract } from 'wagmi';
import { parseEventLogs } from 'viem';
import { love20TokenAbi, memberNftAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cache } from '@/shared/lib/cache';
import { describeMintError } from '@/features/mint-identity/lib/mint-errors';

type HexHash = `0x${string}`;
type PendingKind = 'approve' | 'mint';

interface PendingTx {
  readonly kind: PendingKind;
  readonly hash: HexHash;
  /** For an approval, the amount just approved (drives the optimistic allowance). */
  readonly amount?: bigint;
}

export interface MintedIdentity {
  readonly memberId: bigint;
  /** On-chain memberName (MemberMinted.name); the chain stores the raw input verbatim. */
  readonly name: string;
  /** MemberMinted.cost — exactly what the contract pulled and burned. */
  readonly cost: bigint;
  readonly hash: HexHash;
}

export type MintTxStage = 'idle' | 'wallet' | 'pending';

export interface MintTransactionError {
  readonly action: PendingKind;
  readonly message: string;
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

const MINT_TASK_KEY = 'mintTask';

interface StoredMintTask {
  readonly hash?: unknown;
}

function readStoredHash(raw: StoredMintTask | null): HexHash | undefined {
  if (raw === null || typeof raw.hash !== 'string') return undefined;
  return /^0x[0-9a-fA-F]{64}$/.test(raw.hash) ? (raw.hash as HexHash) : undefined;
}

/**
 * Approve → mint ladder and receipt recovery.
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
  const { writeContractAsync } = useWriteContract();

  const [walletAction, setWalletAction] = useState<PendingKind | null>(null);
  const [pending, setPending] = useState<PendingTx | null>(null);
  const [receipt, setReceipt] = useState<MintedIdentity | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [approvedAmount, setApprovedAmount] = useState<bigint | null>(null);
  const [error, setError] = useState<MintTransactionError | null>(null);

  const onConfirmedRef = useRef<(() => void) | undefined>(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  });

  const scope = useMemo(
    () =>
      account !== undefined && memberNftAddress !== undefined
        ? { chainId, contractAddress: memberNftAddress, wallet: account }
        : null,
    [account, chainId, memberNftAddress],
  );

  // A refresh must resume the mint receipt instead of showing an empty form.
  /* eslint-disable react-hooks/set-state-in-effect -- hydration from the namespaced cache */
  useEffect(() => {
    setPending(null);
    setReceipt(null);
    setError(null);
    setIsApproved(false);
    setApprovedAmount(null);
    setWalletAction(null);
    if (scope === null) return;
    const stored = cache.get<StoredMintTask>(scope, MINT_TASK_KEY);
    const hash = readStoredHash(stored);
    if (hash !== undefined) setPending({ kind: 'mint', hash });
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
      if (pending.kind === 'mint' && scope !== null) cache.remove(scope, MINT_TASK_KEY);
      setError({ action: pending.kind, message: copy.mintIdentity.errors.reverted });
      setPending(null);
      return;
    }

    if (pending.kind === 'approve') {
      setIsApproved(true);
      setApprovedAmount(pending.amount ?? null);
      setPending(null);
      onConfirmedRef.current?.();
      return;
    }

    // A malformed log must show the neutral "读不到身份编号" card, never crash.
    const events = (() => {
      try {
        return parseEventLogs({
          abi: memberNftAbi,
          logs: onChainReceipt.logs,
          eventName: 'MemberMinted',
        });
      } catch {
        return [];
      }
    })();
    const event = events[0];
    if (event === undefined) {
      if (scope !== null) cache.remove(scope, MINT_TASK_KEY);
      setError({
        action: 'mint',
        message: copy.mintIdentity.receipt.missingMessage,
      });
      setPending(null);
      return;
    }

    setReceipt({
      memberId: event.args.memberId,
      name: event.args.name,
      cost: event.args.cost,
      hash: onChainReceipt.transactionHash,
    });
    setPending(null);
    onConfirmedRef.current?.();
  }, [onChainReceipt, pending, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const approve = (amount: bigint): void => {
    if (memberNftAddress === undefined || paymentTokenAddress === undefined || amount <= 0n) {
      return;
    }
    setError(null);
    setIsApproved(false);
    setWalletAction('approve');
    void (async () => {
      try {
        const hash = await writeContractAsync({
          address: paymentTokenAddress,
          abi: love20TokenAbi,
          functionName: 'approve',
          args: [memberNftAddress, amount],
        });
        setPending({ kind: 'approve', hash, amount });
      } catch (cause) {
        setError({
          action: 'approve',
          message: describeMintError(cause, { paymentSymbol: paymentTokenSymbol }),
        });
      } finally {
        setWalletAction(null);
      }
    })();
  };

  const mint = (name: string): void => {
    if (memberNftAddress === undefined || name.length === 0) return;
    setError(null);
    setWalletAction('mint');
    void (async () => {
      try {
        const hash = await writeContractAsync({
          address: memberNftAddress,
          abi: memberNftAbi,
          functionName: 'mint',
          args: [name],
        });
        // Persist before waiting: a refresh while pending must recover this hash.
        if (scope !== null) cache.set(scope, MINT_TASK_KEY, { hash, name });
        setPending({ kind: 'mint', hash });
      } catch (cause) {
        setError({
          action: 'mint',
          message: describeMintError(cause, { paymentSymbol: paymentTokenSymbol }),
        });
      } finally {
        setWalletAction(null);
      }
    })();
  };

  const clearReceipt = (): void => {
    setReceipt(null);
    setError(null);
    setPending(null);
    setIsApproved(false);
    setApprovedAmount(null);
    if (scope !== null) cache.remove(scope, MINT_TASK_KEY);
  };

  const approveStage: MintTxStage =
    walletAction === 'approve' ? 'wallet' : pending?.kind === 'approve' ? 'pending' : 'idle';
  const mintStage: MintTxStage =
    walletAction === 'mint' ? 'wallet' : pending?.kind === 'mint' ? 'pending' : 'idle';

  return {
    approveStage,
    mintStage,
    isApproved,
    receipt,
    error,
    approvedAmount: isApproved ? approvedAmount : null,
    pendingHash: pending?.hash ?? null,
    approve,
    mint,
    clearReceipt,
    clearError: () => {
      setError(null);
    },
  };
}
