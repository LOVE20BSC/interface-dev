import { useEffect, useRef, useState } from 'react';
import { useAccount, useSendTransaction, useWriteContract } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import { NETWORK, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { useNextNonce, useTxWatch, type TxWatch } from '@/shared/model/use-tx-watch';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';
import { describeTransferError } from '@/features/transfer-token/lib/transfer-errors';
import type { TransferRecord } from '@/features/transfer-token/lib/transfer-receipt';
import type { TransferToken } from '@/features/transfer-token/lib/transfer-types';

export type TransferStage = 'idle' | 'wallet' | 'pending';

export interface TransferRequest {
  readonly token: TransferToken;
  readonly amount: bigint;
  readonly recipient: HexAddress;
  readonly recipientLabel: string | undefined;
}

export interface TransferTxError {
  readonly message: string;
  /** Send-time recovery family: nonce mismatch / stale wallet block view. */
  readonly kind?: 'nonce' | 'staleBlock';
}

export interface TransferTransactionState {
  readonly stage: TransferStage;
  readonly receipt: TransferRecord | null;
  readonly pendingHash: `0x${string}` | null;
  readonly error: TransferTxError | null;
  /** Bounded wait for the submitted hash; `isStuck` frees the CTA + recovery card. */
  readonly watch: TxWatch;
  /** Re-sends the same transfer with an explicitly correct nonce. */
  readonly resubmit: () => void;
  readonly submit: (request: TransferRequest) => Promise<void>;
  readonly clearReceipt: () => void;
  readonly clearError: () => void;
}

interface PendingTransfer {
  readonly hash: `0x${string}`;
  readonly request: TransferRequest;
}

/**
 * One transfer, two write shapes: the native coin uses a plain value transfer,
 * every ERC20 uses `transfer(to, amount)` directly — there is no approval step
 * (and the page never mentions one). Waiting is the shared bounded watcher, so a
 * dropped / nonce-gapped transaction becomes an actionable recovery card instead
 * of an endless 确认中, and 重新提交 re-sends with the on-chain nonce.
 */
export function useTransferTransaction(onConfirmed: () => void): TransferTransactionState {
  const { address: account } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const readNextNonce = useNextNonce(account);

  const [pending, setPending] = useState<PendingTransfer | null>(null);
  const [receipt, setReceipt] = useState<TransferRecord | null>(null);
  const [isWalletAction, setIsWalletAction] = useState(false);
  const [error, setError] = useState<TransferTxError | null>(null);
  const submittingRef = useRef(false);
  const lastAttemptRef = useRef<TransferRequest | null>(null);

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
      setError({ message: copy.transfer.errors.reverted });
      onConfirmedRef.current();
      return;
    }

    const request = pending.request;
    setReceipt({
      hash: pending.hash,
      tokenSymbol: request.token.symbol,
      tokenDecimals: request.token.decimals,
      native: request.token.kind === 'native',
      amount: request.amount,
      recipient: request.recipient,
      recipientLabel: request.recipientLabel,
      recordedAt: Date.now(),
    });
    setPending(null);
    setError(null);
    onConfirmedRef.current();
  }, [onChainReceipt, pending]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const send = async (request: TransferRequest, nonce?: number): Promise<`0x${string}`> => {
    const nonceOption = nonce !== undefined ? { nonce } : {};
    if (request.token.kind === 'native') {
      return sendTransactionAsync({
        to: request.recipient,
        value: request.amount,
        ...nonceOption,
      });
    }
    if (request.token.address === undefined) throw new Error('token address unavailable');
    return writeContractAsync({
      address: request.token.address,
      abi: love20TokenAbi,
      functionName: 'transfer',
      args: [request.recipient, request.amount],
      ...nonceOption,
    });
  };

  const submitInternal = async (request: TransferRequest, nonce?: number): Promise<void> => {
    if (submittingRef.current) return;
    if (account === undefined || request.amount <= 0n) return;
    setError(null);
    setIsWalletAction(true);
    submittingRef.current = true;
    try {
      const hash = await send(request, nonce);
      setPending({ hash, request });
    } catch (cause) {
      const message = describeTransferError(cause, {
        nativeSymbol: NETWORK.nativeCurrency.symbol,
        tokenSymbol: request.token.symbol,
      });
      const recovery = txSendRecoveryKind(cause);
      setError({ message, ...(recovery !== undefined ? { kind: recovery } : {}) });
    } finally {
      setIsWalletAction(false);
      submittingRef.current = false;
    }
  };

  const submit = async (request: TransferRequest): Promise<void> => {
    if (submittingRef.current || pending !== null || receipt !== null) return;
    lastAttemptRef.current = request;
    await submitInternal(request);
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

  const stage: TransferStage = isWalletAction
    ? 'wallet'
    : pending !== null && !watch.isStuck
      ? 'pending'
      : 'idle';

  return {
    stage,
    receipt,
    pendingHash: pending?.hash ?? null,
    error,
    watch,
    resubmit,
    submit,
    clearReceipt: () => {
      setReceipt(null);
      setPending(null);
      setError(null);
    },
    clearError: () => {
      setError(null);
    },
  };
}
