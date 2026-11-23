import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi';
import { batchTransferAbi, love20TokenAbi } from '@/config/abis';
import { NETWORK, configuredAddress, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { decideApproveAmount } from '@/shared/lib/approve-amount';
import { readUnlimitedApprovalPreference } from '@/shared/lib/approval-preference';
import { usePendingNonce, useTxWatch, type TxWatch } from '@/shared/model/use-tx-watch';
import { isSameTxOwner, type TxOwner } from '@/shared/lib/tx-owner';
import {
  describeBatchError,
  type BatchErrorMessage,
} from '@/features/batch-transfer/lib/batch-errors';
import {
  clearStoredBatch,
  createBatchScope,
  readStoredBatch,
  writeStoredBatch,
  type BatchPendingKind,
} from '@/features/batch-transfer/lib/batch-record';
import type { BatchRequest } from '@/features/batch-transfer/lib/batch-types';

export type BatchStage = 'idle' | 'wallet' | 'pending';
export type { BatchPendingKind };

export interface BatchTransactionState {
  readonly stage: BatchStage;
  readonly pendingKind: BatchPendingKind | null;
  readonly error: BatchErrorMessage | null;
  readonly watch: TxWatch;
  /** `approve(BatchTransfer, 合计)`; the panel re-reads the allowance on confirm. */
  readonly approve: (request: BatchRequest) => Promise<void>;
  /** Simulates, then sends the batch. A simulation failure never asks the wallet. */
  readonly submit: (request: BatchRequest) => Promise<void>;
  readonly clearError: () => void;
}

export interface UseBatchTransactionOptions {
  readonly onApproved: () => void;
  readonly onBatchConfirmed: (hash: `0x${string}`, request: BatchRequest) => void;
}

interface PendingBatch {
  readonly hash: `0x${string}`;
  readonly owner: TxOwner;
  readonly kind: BatchPendingKind;
  readonly request: BatchRequest;
  readonly nonce: number | undefined;
}

/**
 * The 批量转账 write path: one optional `approve` for the exact batch total, then
 * one atomic `batchTransferNative` / `batchTransferERC20`.
 *
 * The batch is **simulated before the wallet sheet opens**. The contract's
 * `NativeTransferFailed` / `ERC20TransferFailed` errors only say *which* row
 * failed, so a simulation is the only place the page can refuse a doomed batch
 * (gas budget too low, recipient contract rejects the asset, insufficient
 * balance) without burning gas — and it keeps 「你的资产没有变化」 literally true.
 *
 * Waiting is the shared bounded watcher; a stuck hash exposes the recovery card,
 * exactly like 代币转账. Owner 2026-11-23 removed the re-send: the record is only
 * written once the wallet returned a hash, so a refresh restores the in-flight
 * card (and blocks a second batch) while a rejected send is just an error.
 */
export function useBatchTransaction(options: UseBatchTransactionOptions): BatchTransactionState {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const batchTransfer = configuredAddress('batchTransfer');
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const readPendingNonce = usePendingNonce(account);

  const [pending, setPending] = useState<PendingBatch | null>(null);
  const [isWalletAction, setIsWalletAction] = useState(false);
  const [error, setError] = useState<BatchErrorMessage | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const submittingRef = useRef(false);

  const onApprovedRef = useRef(options.onApproved);
  const onBatchConfirmedRef = useRef(options.onBatchConfirmed);
  useEffect(() => {
    onApprovedRef.current = options.onApproved;
    onBatchConfirmedRef.current = options.onBatchConfirmed;
  });

  const scope = useMemo(
    () => (account !== undefined ? createBatchScope(chainId, account) : null),
    [account, chainId],
  );

  // R4: a refresh (or leaving the page and coming back) resumes the in-flight batch
  // instead of showing an empty, submittable form.
  /* eslint-disable react-hooks/set-state-in-effect -- hydration from the namespaced cache */
  useEffect(() => {
    setPending(null);
    setError(null);
    setIsWalletAction(false);
    submittingRef.current = false;
    setIsHydrating(true);
    if (scope === null || account === undefined) {
      setIsHydrating(false);
      return;
    }
    const stored = readStoredBatch(scope);
    if (stored !== null) {
      const owner: TxOwner = { chainId: stored.chainId, account: stored.account };
      // R3: a task belonging to another wallet/chain is cleared, never signed.
      if (!isSameTxOwner(owner, { chainId, account })) {
        clearStoredBatch(scope);
        setError({ message: copy.txWatch.ownerChanged });
        setIsHydrating(false);
        return;
      }
      if (stored.hash !== null) {
        setPending({
          hash: stored.hash,
          owner,
          kind: stored.kind,
          request: stored.request,
          nonce: stored.nonce,
        });
      } else {
        // 旧版本在发送前落下的无哈希记录：没有在途交易可恢复，直接丢掉。
        clearStoredBatch(scope);
      }
    }
    setIsHydrating(false);
  }, [account, chainId, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const watch = useTxWatch({
    hash: pending?.hash ?? null,
    wallet: account,
    walletAction: isWalletAction,
    enabled: pending !== null,
  });
  const mined = watch.receipt;

  /* eslint-disable react-hooks/set-state-in-effect -- a mined receipt is an external chain fact */
  useEffect(() => {
    if (pending === null || mined === null) return;

    if (mined.status === 'reverted') {
      if (scope !== null) clearStoredBatch(scope);
      setPending(null);
      setError({
        message:
          pending.kind === 'approve'
            ? copy.batchTransfer.errors.approveReverted
            : copy.batchTransfer.errors.reverted,
      });
      return;
    }

    if (scope !== null) clearStoredBatch(scope);
    setPending(null);
    if (pending.kind === 'approve') {
      onApprovedRef.current();
    } else {
      onBatchConfirmedRef.current(pending.hash, pending.request);
    }
  }, [mined, pending, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const errorContext = (request: BatchRequest) => ({
    nativeSymbol: NETWORK.nativeCurrency.symbol,
    tokenSymbol: request.tokenSymbol,
    recipientHasCode: request.recipientHasCode,
  });

  const sendApprove = async (request: BatchRequest, nonce?: number): Promise<`0x${string}`> => {
    if (request.tokenAddress === undefined || batchTransfer === undefined) {
      throw new Error('batch transfer configuration unavailable');
    }
    // 默认使用长期授权 (owner 2026-11-16): the amount is read at send time, so the
    // current preference always wins. Off → the exact batch total (unchanged);
    // on → maxUint256, same value the approvals page writes.
    return writeContractAsync({
      address: request.tokenAddress,
      abi: love20TokenAbi,
      functionName: 'approve',
      args: [batchTransfer, decideApproveAmount(readUnlimitedApprovalPreference(), request.total)],
      ...(nonce !== undefined ? { nonce } : {}),
    });
  };

  const sendBatch = async (request: BatchRequest, nonce?: number): Promise<`0x${string}`> => {
    if (batchTransfer === undefined) throw new Error('batch transfer configuration unavailable');
    const recipients = request.rows.map((row) => row.address);
    const amounts = request.rows.map((row) => row.amount);
    const nonceOption = nonce !== undefined ? { nonce } : {};

    if (request.mode === 'native') {
      // Simulation first: a doomed batch must not reach the wallet.
      if (publicClient !== undefined && account !== undefined) {
        await publicClient.simulateContract({
          account,
          address: batchTransfer,
          abi: batchTransferAbi,
          functionName: 'batchTransferNative',
          args: [recipients, amounts, BigInt(request.gasLimit)],
          value: request.total,
        });
      }
      return writeContractAsync({
        address: batchTransfer,
        abi: batchTransferAbi,
        functionName: 'batchTransferNative',
        args: [recipients, amounts, BigInt(request.gasLimit)],
        value: request.total,
        ...nonceOption,
      });
    }

    if (request.tokenAddress === undefined) throw new Error('token address unavailable');
    const tokenAddress: HexAddress = request.tokenAddress;
    if (publicClient !== undefined && account !== undefined) {
      await publicClient.simulateContract({
        account,
        address: batchTransfer,
        abi: batchTransferAbi,
        functionName: 'batchTransferERC20',
        args: [tokenAddress, recipients, amounts, BigInt(request.gasLimit)],
      });
    }
    return writeContractAsync({
      address: batchTransfer,
      abi: batchTransferAbi,
      functionName: 'batchTransferERC20',
      args: [tokenAddress, recipients, amounts, BigInt(request.gasLimit)],
      ...nonceOption,
    });
  };

  const submitInternal = async (request: BatchRequest, kind: BatchPendingKind): Promise<void> => {
    if (submittingRef.current) return;
    if (account === undefined || request.rows.length === 0) return;
    const owner: TxOwner = { chainId, account };
    setError(null);
    setIsWalletAction(true);
    submittingRef.current = true;
    try {
      // R5: a new operation queues behind whatever the wallet already broadcast.
      const sendNonce = await readPendingNonce();
      const hash =
        kind === 'approve'
          ? await sendApprove(request, sendNonce)
          : await sendBatch(request, sendNonce);
      // 只有拿到哈希之后才落记录：签名失败不保留任何可重发的请求。
      if (scope !== null) {
        writeStoredBatch(scope, {
          hash,
          chainId: owner.chainId,
          account: owner.account,
          kind,
          request,
          nonce: sendNonce,
          recordedAt: Date.now(),
        });
      }
      setPending({ hash, owner, kind, request, nonce: sendNonce });
    } catch (cause) {
      setError(describeBatchError(cause, errorContext(request)));
    } finally {
      setIsWalletAction(false);
      submittingRef.current = false;
    }
  };

  const approve = async (request: BatchRequest): Promise<void> => {
    if (submittingRef.current || pending !== null) return;
    await submitInternal(request, 'approve');
  };

  const submit = async (request: BatchRequest): Promise<void> => {
    if (submittingRef.current || pending !== null || isHydrating) return;
    await submitInternal(request, 'batch');
  };

  const stage: BatchStage = isWalletAction ? 'wallet' : pending !== null ? 'pending' : 'idle';

  return {
    stage,
    pendingKind: pending?.kind ?? null,
    error,
    watch,
    approve,
    submit,
    clearError: () => setError(null),
  };
}
