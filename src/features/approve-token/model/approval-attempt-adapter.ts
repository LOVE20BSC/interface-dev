import { useRef } from 'react';
import type { TransactionReceipt } from 'viem';
import { useWriteContract } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';
import type {
  WriteAttempt,
  WriteAttemptError,
  WriteHash,
  WriteStep,
} from '@/shared/lib/write-attempt';
import type { WriteAttemptAdapter } from '@/shared/model/use-write-attempt';
import { describeApprovalError } from '@/features/approve-token/lib/approval-errors';
import { UNLIMITED_APPROVAL_VALUE } from '@/features/approve-token/lib/approval-amount';
import type { ApprovalRecord, ApprovalRequest } from '@/features/approve-token/lib/approval-types';

/** Memory the adapter callbacks share across renders. */
interface ApprovalAttemptMemory {
  /** The request handed to the wallet; `parseReceipt`/`translate` read it back. */
  request: ApprovalRequest | null;
  /** Hash of the write the wallet returned, for the mined receipt's strip. */
  hash: WriteHash | undefined;
}

export interface ApprovalAttemptOptions {
  readonly onConfirmed: () => void;
}

/**
 * Adapter for one 授权/撤销 under the shared write-attempt core.
 *
 * `persist: 'none'`: an approval is a single write the page never resumes after
 * a reload, so its success strip is page state only — nothing is read back from
 * the cache and nothing is written to it.
 *
 * The 长期授权 writes `maxUint256`, 撤销 writes `0`; the receipt strip is built
 * from the submitted request at confirmation time.
 */
export function useApprovalAttemptAdapter(
  options: ApprovalAttemptOptions,
): WriteAttemptAdapter<ApprovalRequest, ApprovalRecord, null> {
  const { writeContractAsync } = useWriteContract();
  // Never read during render; only `send` / `parseReceipt` / `translate` touch it.
  const memory = useRef<ApprovalAttemptMemory>({ request: null, hash: undefined });

  return {
    persist: 'none',
    approve: 'none',
    ownerChanged: copy.txWatch.ownerChanged,
    reverted: copy.approvals.errors.reverted,

    readRecord(): WriteAttempt<ApprovalRequest> | null {
      return null;
    },

    writeRecord(_attempt: WriteAttempt<ApprovalRequest>): null {
      return null;
    },

    clearRecord(): void {
      // Nothing is persisted: the success strip is page state.
    },

    async send(_step: WriteStep, request: ApprovalRequest, nonce?: number): Promise<WriteHash> {
      memory.current.request = request;
      memory.current.hash = undefined;
      const hash = await writeContractAsync({
        address: request.tokenAddress,
        abi: love20TokenAbi,
        functionName: 'approve',
        args: [request.spender, request.mode === 'unlimited' ? UNLIMITED_APPROVAL_VALUE : 0n],
        ...(nonce !== undefined ? { nonce } : {}),
      });
      memory.current.hash = hash;
      return hash;
    },

    parseReceipt(step: WriteStep, receipt: TransactionReceipt): ApprovalRecord | null {
      if (step !== 'main') return null;
      const request = memory.current.request;
      if (request === null) return null;
      return {
        hash: memory.current.hash ?? receipt.transactionHash,
        spenderLabel: request.spenderLabel,
        tokenSymbol: request.tokenSymbol,
        mode: request.mode,
      };
    },

    translate(cause: unknown): WriteAttemptError {
      const request = memory.current.request;
      const message = describeApprovalError(cause, {
        nativeSymbol: NETWORK.nativeCurrency.symbol,
        tokenSymbol: request?.tokenSymbol ?? '',
        mode: request?.mode ?? 'unlimited',
      });
      const recovery = txSendRecoveryKind(cause);
      return { message, ...(recovery !== undefined ? { kind: recovery } : {}) };
    },

    onConfirmed(): void {
      options.onConfirmed();
    },
  };
}
