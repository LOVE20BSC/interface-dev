import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useWriteContract } from 'wagmi';
import { parseEventLogs } from 'viem';
import { love20TokenAbi, memberNftAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cache } from '@/shared/lib/cache';
import { describeMintError } from '@/features/mint-identity/lib/mint-errors';
import { useNextNonce, useTxWatch, type TxWatch } from '@/shared/model/use-tx-watch';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';

type HexHash = `0x${string}`;
type PendingKind = 'approve' | 'mint';

interface PendingTx {
  readonly kind: PendingKind;
  readonly hash: HexHash;
  /** For an approval, the amount just approved (drives the optimistic allowance). */
  readonly amount?: bigint;
  /** For a mint, the submitted name so 「重新提交」 can resend without the form. */
  readonly name?: string;
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
  /** Send-time recovery family: nonce mismatch / stale wallet block view. */
  readonly kind?: 'nonce' | 'staleBlock';
}

type ResendTarget =
  | { readonly kind: 'approve'; readonly amount: bigint }
  | { readonly kind: 'mint'; readonly name: string };

function recoveryKindFor(cause: unknown): 'nonce' | 'staleBlock' | undefined {
  return txSendRecoveryKind(cause);
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
  /** Bounded wait for the submitted hash; `isStuck` frees the CTA + shows recovery. */
  readonly watch: TxWatch;
  /** Re-sends the pending step with an explicitly correct nonce (recovery card). */
  readonly resubmit: () => void;
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
  readonly name?: unknown;
}

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function readStoredPending(
  raw: StoredMintTask | null,
): { readonly hash: HexHash; readonly name?: string } | null {
  if (raw === null || typeof raw.hash !== 'string' || !HASH_RE.test(raw.hash)) return null;
  const name =
    typeof raw.name === 'string' && raw.name.length > 0 && raw.name.length <= 256
      ? raw.name
      : undefined;
  return name === undefined ? { hash: raw.hash as HexHash } : { hash: raw.hash as HexHash, name };
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
  const readNextNonce = useNextNonce(account);

  const [walletAction, setWalletAction] = useState<PendingKind | null>(null);
  const [pending, setPending] = useState<PendingTx | null>(null);
  const [receipt, setReceipt] = useState<MintedIdentity | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [approvedAmount, setApprovedAmount] = useState<bigint | null>(null);
  const [error, setError] = useState<MintTransactionError | null>(null);
  const lastAttemptRef = useRef<ResendTarget | null>(null);

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
    const storedPending = readStoredPending(stored);
    if (storedPending !== null) {
      setPending(
        storedPending.name === undefined
          ? { kind: 'mint', hash: storedPending.hash }
          : { kind: 'mint', hash: storedPending.hash, name: storedPending.name },
      );
    }
  }, [scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // A bounded wait for the submitted hash. It replaces a bare receipt poll so a
  // nonce-gapped/dropped/underpriced transaction cannot trap the page in 确认中.
  const watch = useTxWatch({
    hash: pending?.hash ?? null,
    wallet: account,
    walletAction: walletAction !== null,
    enabled: pending !== null,
  });
  const onChainReceipt = watch.receipt;

  /* eslint-disable react-hooks/set-state-in-effect -- a mined receipt is an external chain fact */
  useEffect(() => {
    if (pending === null || onChainReceipt === null) return;

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

  const approve = (amount: bigint, nonce?: number): void => {
    if (memberNftAddress === undefined || paymentTokenAddress === undefined || amount <= 0n) {
      return;
    }
    lastAttemptRef.current = { kind: 'approve', amount };
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
          // 重新提交 passes the on-chain nonce so a wallet stuck on a stale
          // queued nonce heals itself instead of signing into a gap forever.
          ...(nonce !== undefined ? { nonce } : {}),
        });
        setPending({ kind: 'approve', hash, amount });
      } catch (cause) {
        const recovery = recoveryKindFor(cause);
        setError({
          action: 'approve',
          message: describeMintError(cause, { paymentSymbol: paymentTokenSymbol }),
          ...(recovery !== undefined ? { kind: recovery } : {}),
        });
      } finally {
        setWalletAction(null);
      }
    })();
  };

  const mint = (name: string, nonce?: number): void => {
    if (memberNftAddress === undefined || name.length === 0) return;
    lastAttemptRef.current = { kind: 'mint', name };
    setError(null);
    setWalletAction('mint');
    void (async () => {
      try {
        const hash = await writeContractAsync({
          address: memberNftAddress,
          abi: memberNftAbi,
          functionName: 'mint',
          args: [name],
          ...(nonce !== undefined ? { nonce } : {}),
        });
        // Persist before waiting: a refresh while pending must recover this hash.
        if (scope !== null) cache.set(scope, MINT_TASK_KEY, { hash, name });
        setPending({ kind: 'mint', hash, name });
      } catch (cause) {
        const recovery = recoveryKindFor(cause);
        setError({
          action: 'mint',
          message: describeMintError(cause, { paymentSymbol: paymentTokenSymbol }),
          ...(recovery !== undefined ? { kind: recovery } : {}),
        });
      } finally {
        setWalletAction(null);
      }
    })();
  };

  const resubmit = (): void => {
    const target: ResendTarget | null =
      pending === null
        ? lastAttemptRef.current
        : pending.kind === 'approve'
          ? { kind: 'approve', amount: pending.amount ?? 0n }
          : pending.name !== undefined
            ? { kind: 'mint', name: pending.name }
            : lastAttemptRef.current;
    if (target === null || walletAction !== null) return;
    void (async () => {
      const nonce = await readNextNonce();
      if (nonce === undefined) {
        setError({ action: target.kind, message: copy.txWatch.nonceUnavailable });
        return;
      }
      if (target.kind === 'approve') approve(target.amount, nonce);
      else mint(target.name, nonce);
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

  // A stuck hash frees the primary action so 授权/铸造 can be retried; the
  // recovery card keeps the hash and its manual actions visible until then.
  const approveStage: MintTxStage =
    walletAction === 'approve'
      ? 'wallet'
      : pending?.kind === 'approve' && !watch.isStuck
        ? 'pending'
        : 'idle';
  const mintStage: MintTxStage =
    walletAction === 'mint'
      ? 'wallet'
      : pending?.kind === 'mint' && !watch.isStuck
        ? 'pending'
        : 'idle';

  return {
    approveStage,
    mintStage,
    isApproved,
    receipt,
    error,
    approvedAmount: isApproved ? approvedAmount : null,
    pendingHash: pending?.hash ?? null,
    watch,
    resubmit,
    approve,
    mint,
    clearReceipt,
    clearError: () => {
      setError(null);
    },
  };
}
