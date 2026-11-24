import { useRef } from 'react';
import type { TransactionReceipt } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { batchTransferAbi, love20TokenAbi } from '@/config/abis';
import { NETWORK, configuredAddress, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { decideApproveAmount } from '@/shared/lib/approve-amount';
import { readUnlimitedApprovalPreference } from '@/shared/lib/approval-preference';
import type { CacheScope } from '@/shared/lib/cache';
import type {
  WriteAttempt,
  WriteAttemptError,
  WriteHash,
  WriteStep,
} from '@/shared/lib/write-attempt';
import type { WriteAttemptAdapter } from '@/shared/model/use-write-attempt';
import {
  describeBatchError,
  type BatchErrorMessage,
} from '@/features/batch-transfer/lib/batch-errors';
import {
  clearStoredBatch,
  readStoredBatch,
  writeStoredBatch,
} from '@/features/batch-transfer/lib/batch-record';
import type { BatchRequest } from '@/features/batch-transfer/lib/batch-types';

/** A mined batch has no receipt sheet: only the confirmation callback matters. */
export interface BatchSettlement {
  readonly hash: WriteHash;
}

/** Per-attempt memory the adapter callbacks share across renders. */
interface BatchAttemptMemory {
  /** Step of the last send/hydrated attempt; picks the revert sentence + callback. */
  step: WriteStep;
  /** The request handed to the wallet; `translate` / `onConfirmed` read it back. */
  request: BatchRequest | null;
  /** Hash the wallet returned; a hydrated attempt already has one. */
  hash: WriteHash | undefined;
  /** Set by the `reverted` getter so `onConfirmed` never reports a reverted batch. */
  reverted: boolean;
}

export interface BatchAttemptOptions {
  readonly scope: CacheScope | null;
  readonly onApproved: () => void;
  readonly onBatchConfirmed: (hash: WriteHash, request: BatchRequest) => void;
  /** A hash came back from the wallet (the approval has no persisted record). */
  readonly onHash?: (step: WriteStep) => void;
  /** The send failed; nothing will be persisted for this attempt. */
  readonly onSendFailed?: (step: WriteStep) => void;
  /** The main hash has been persisted (a refresh can resume it). */
  readonly onRecordWritten?: () => void;
}

/** Approve key for the shared core: the token being approved (native has none). */
export function batchApproveKey(request: BatchRequest): string {
  return request.tokenAddress ?? 'native';
}

/**
 * Adapter for one 批量转账 attempt under the shared write-attempt core.
 *
 * `persist: 'afterHash'` keeps R4/R1: the hash is written the moment the wallet
 * returns it, so a refresh resumes the in-flight batch (and blocks a second one)
 * instead of showing an empty, submittable form. A mined record is cleared again —
 * the batch receipt is page state built by the panel's `onBatchConfirmed`.
 *
 * The core persists the main step only; the record therefore always carries
 * `kind: 'batch'`. An `approve` record can still be read (older build / migration):
 * it hydrates the core's approval slot so the page keeps saying 授权确认中.
 *
 * Simulation stays exactly where it was: a doomed batch must never reach the
 * wallet, so `send` runs `simulateContract` first and only then `writeContract`.
 */
export function useBatchAttemptAdapter(
  options: BatchAttemptOptions,
): WriteAttemptAdapter<BatchRequest, BatchSettlement, void> {
  const { address: account } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const batchTransfer = configuredAddress('batchTransfer');
  // Never read during render; `send` / `parseReceipt` / `translate` / `onConfirmed`
  // are the only readers and writers.
  const memory = useRef<BatchAttemptMemory>({
    step: 'main',
    request: null,
    hash: undefined,
    reverted: false,
  });

  const sendApprove = async (request: BatchRequest, nonce?: number): Promise<WriteHash> => {
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

  const sendBatch = async (request: BatchRequest, nonce?: number): Promise<WriteHash> => {
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

  return {
    persist: 'afterHash',
    approve: 'single',
    ownerChanged: copy.txWatch.ownerChanged,
    get reverted(): string {
      // The core has one revert sentence; the batch page has two (授权 vs 转账).
      memory.current.reverted = true;
      return memory.current.step === 'approve'
        ? copy.batchTransfer.errors.approveReverted
        : copy.batchTransfer.errors.reverted;
    },

    readRecord(): WriteAttempt<BatchRequest> | null {
      const { scope } = options;
      if (scope === null) return null;
      const stored = readStoredBatch(scope);
      if (stored === null) return null;
      const step: WriteStep = stored.kind === 'approve' ? 'approve' : 'main';
      memory.current = {
        step,
        request: stored.request,
        hash: stored.hash,
        reverted: false,
      };
      return {
        intent: stored.request,
        owner: { chainId: stored.chainId, account: stored.account },
        step,
        ...(step === 'approve' ? { key: batchApproveKey(stored.request) } : {}),
        hash: stored.hash,
        ...(stored.nonce !== undefined ? { nonce: stored.nonce } : {}),
      };
    },

    writeRecord(attempt: WriteAttempt<BatchRequest>): void {
      const { scope } = options;
      const hash = attempt.hash;
      if (scope === null || hash === undefined) return;
      writeStoredBatch(scope, {
        hash,
        chainId: attempt.owner.chainId,
        account: attempt.owner.account,
        kind: 'batch',
        request: attempt.intent,
        nonce: attempt.nonce,
        recordedAt: Date.now(),
      });
      options.onRecordWritten?.();
    },

    clearRecord(): void {
      const { scope } = options;
      if (scope !== null) clearStoredBatch(scope);
    },

    async send(step: WriteStep, request: BatchRequest, nonce?: number): Promise<WriteHash> {
      memory.current = { step, request, hash: undefined, reverted: false };
      const hash =
        step === 'approve' ? await sendApprove(request, nonce) : await sendBatch(request, nonce);
      memory.current.hash = hash;
      options.onHash?.(step);
      return hash;
    },

    parseReceipt(step: WriteStep, receipt: TransactionReceipt): BatchSettlement | null {
      if (step !== 'main') return null;
      // The batch has no receipt to parse; a non-null value tells the core the
      // transaction succeeded (a null would be reported as a revert).
      return { hash: memory.current.hash ?? receipt.transactionHash };
    },

    translate(cause: unknown): WriteAttemptError {
      options.onSendFailed?.(memory.current.step);
      const request = memory.current.request;
      const error: BatchErrorMessage = describeBatchError(cause, {
        nativeSymbol: NETWORK.nativeCurrency.symbol,
        tokenSymbol: request?.tokenSymbol ?? '',
        recipientHasCode: request?.recipientHasCode ?? [],
      });
      return error;
    },

    onConfirmed(): void {
      const { scope } = options;
      // An approval carry-over record must not survive its confirmation; the core
      // only clears the main record.
      if (scope !== null) clearStoredBatch(scope);
      const current = memory.current;
      if (current.reverted) {
        current.reverted = false;
        return;
      }
      if (current.step === 'approve') {
        options.onApproved();
        return;
      }
      if (current.request === null || current.hash === undefined) return;
      options.onBatchConfirmed(current.hash, current.request);
    },
  };
}
