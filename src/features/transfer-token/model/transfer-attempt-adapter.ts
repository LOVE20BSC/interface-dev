import { useRef } from 'react';
import type { TransactionReceipt } from 'viem';
import { useSendTransaction, useWriteContract } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import { NETWORK, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import type { CacheScope } from '@/shared/lib/cache';
import { isSameTxOwner } from '@/shared/lib/tx-owner';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';
import type {
  WriteAttempt,
  WriteAttemptError,
  WriteHash,
  WriteStep,
} from '@/shared/lib/write-attempt';
import type { WriteAttemptAdapter } from '@/shared/model/use-write-attempt';
import { describeTransferError } from '@/features/transfer-token/lib/transfer-errors';
import {
  clearStoredTransfer,
  readStoredTransfer,
  storedTransferToRecord,
  writeStoredTransfer,
  type StoredTransfer,
} from '@/features/transfer-token/lib/transfer-record';
import type { TransferRecord } from '@/features/transfer-token/lib/transfer-receipt';
import type { TransferToken } from '@/features/transfer-token/lib/transfer-types';

/** One transfer, as the form submits it — also the write attempt's intent. */
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

/** Per-attempt memory the adapter callbacks share across renders. */
interface TransferAttemptMemory {
  /** The request handed to the wallet; `translate` and `parseReceipt` read it back. */
  request: TransferRequest | null;
  /** Confirmed projection of a parsed receipt, written back by `onConfirmed`. */
  settled: StoredTransfer | null;
}

export interface TransferAttemptOptions {
  readonly scope: CacheScope | null;
  readonly chainId: number;
  readonly account: HexAddress | undefined;
  readonly onRestoredRecord: (record: TransferRecord | null) => void;
  readonly onHydrationError: (error: TransferTxError | null) => void;
  readonly onConfirmed: () => void;
}

function requestOf(stored: StoredTransfer): TransferRequest {
  return {
    token: stored.token,
    amount: stored.amount,
    recipient: stored.recipient,
    recipientLabel: stored.recipientLabel,
  };
}

/**
 * Adapter for one 代币转账 under the shared write-attempt core.
 *
 * 代币转账 has two write shapes: the native coin is a plain value transfer,
 * every ERC20 is `transfer(to, amount)` directly — there is no approval step
 * (and the page never mentions one). The branch stays here, exactly as the
 * pre-migration `send` did.
 *
 * `persist: 'afterHash'` keeps D1: the hash is written the moment the wallet
 * returns it, so a refresh in the pending window resumes the same hash instead of
 * offering a second transfer. A confirmed record is the D4 success strip and is
 * allowed to outlive the receipt sheet (the page never replays the sheet); an
 * unconfirmed record is dropped as soon as the attempt settles, reverts, or the
 * receipt is dismissed.
 *
 * R3: the record carries `{chainId, account}` and a record written by another
 * wallet is removed with the neutral `ownerChanged` copy instead of being signed.
 */
export function useTransferAttemptAdapter(
  options: TransferAttemptOptions,
): WriteAttemptAdapter<TransferRequest, TransferRecord, StoredTransfer | null> {
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  // Never read during render; the callbacks below (send / parse / translate /
  // onConfirmed) are the only readers and writers.
  const memory = useRef<TransferAttemptMemory>({ request: null, settled: null });

  return {
    persist: 'afterHash',
    approve: 'none',
    ownerChanged: copy.txWatch.ownerChanged,
    reverted: copy.transfer.errors.reverted,

    readRecord(): WriteAttempt<TransferRequest> | null {
      const { scope, chainId, account } = options;
      options.onRestoredRecord(null);
      options.onHydrationError(null);
      if (scope === null) return null;
      const stored = readStoredTransfer(scope);
      if (stored === null) return null;
      const owner = { chainId: stored.chainId, account: stored.account };
      if (account === undefined || !isSameTxOwner(owner, { chainId, account })) {
        // R3: never restore/sign another wallet's task, and never leave it behind.
        clearStoredTransfer(scope);
        options.onHydrationError({ message: copy.txWatch.ownerChanged });
        return null;
      }
      if (stored.confirmed) {
        // D4: only the success strip is replayed; the receipt sheet is one-time.
        options.onRestoredRecord(storedTransferToRecord(stored));
        return null;
      }
      return {
        intent: requestOf(stored),
        owner,
        step: 'main',
        hash: stored.hash,
        ...(stored.nonce !== undefined ? { nonce: stored.nonce } : {}),
      };
    },

    writeRecord(attempt: WriteAttempt<TransferRequest>): StoredTransfer | null {
      const hash = attempt.hash;
      const scope = options.scope;
      if (hash === undefined || scope === null) return null;
      const stored: StoredTransfer = {
        hash,
        chainId: attempt.owner.chainId,
        account: attempt.owner.account,
        token: attempt.intent.token,
        amount: attempt.intent.amount,
        recipient: attempt.intent.recipient,
        recipientLabel: attempt.intent.recipientLabel,
        nonce: attempt.nonce,
        confirmed: false,
        recordedAt: Date.now(),
      };
      writeStoredTransfer(scope, stored);
      return stored;
    },

    clearRecord(): void {
      const scope = options.scope;
      if (scope === null) return;
      const stored = readStoredTransfer(scope);
      // A confirmed task is the D4 success strip: dismissing the receipt clears
      // page state, not the hash a refresh keeps showing. Everything else here is
      // an in-flight attempt the core has just settled / rejected / re-owned.
      if (stored?.confirmed === true) return;
      clearStoredTransfer(scope);
    },

    async send(_step: WriteStep, request: TransferRequest, nonce?: number): Promise<WriteHash> {
      memory.current.request = request;
      memory.current.settled = null;
      const nonceOption = nonce !== undefined ? { nonce } : {};
      if (request.token.kind === 'native') {
        return sendTransactionAsync({
          to: request.recipient,
          value: request.amount,
          ...nonceOption,
        });
      }
      const tokenAddress = request.token.address;
      if (tokenAddress === undefined) throw new Error('token address unavailable');
      return writeContractAsync({
        address: tokenAddress,
        abi: love20TokenAbi,
        functionName: 'transfer',
        args: [request.recipient, request.amount],
        ...nonceOption,
      });
    },

    parseReceipt(step: WriteStep, receipt: TransactionReceipt): TransferRecord | null {
      if (step !== 'main') return null;
      const scope = options.scope;
      const stored = scope !== null ? readStoredTransfer(scope) : null;
      const request = memory.current.request ?? (stored !== null ? requestOf(stored) : null);
      if (request === null) return null;
      const hash = stored?.hash ?? receipt.transactionHash;
      const record: TransferRecord = {
        hash,
        tokenSymbol: request.token.symbol,
        tokenDecimals: request.token.decimals,
        native: request.token.kind === 'native',
        amount: request.amount,
        recipient: request.recipient,
        recipientLabel: request.recipientLabel,
        recordedAt: Date.now(),
      };
      // The core clears the pending record right after this parse; keep the
      // confirmed projection here so `onConfirmed` can write the strip back.
      const base: StoredTransfer | null =
        stored !== null
          ? stored
          : options.account !== undefined
            ? {
                hash,
                chainId: options.chainId,
                account: options.account,
                token: request.token,
                amount: request.amount,
                recipient: request.recipient,
                recipientLabel: request.recipientLabel,
                nonce: undefined,
                confirmed: false,
                recordedAt: record.recordedAt,
              }
            : null;
      memory.current.settled = base !== null ? { ...base, recordedAt: record.recordedAt } : null;
      return record;
    },

    translate(cause: unknown): WriteAttemptError {
      const message = describeTransferError(cause, {
        nativeSymbol: NETWORK.nativeCurrency.symbol,
        tokenSymbol: memory.current.request?.token.symbol ?? '',
      });
      const recovery = txSendRecoveryKind(cause);
      return { message, ...(recovery !== undefined ? { kind: recovery } : {}) };
    },

    onConfirmed(): void {
      const settled = memory.current.settled;
      memory.current.settled = null;
      const scope = options.scope;
      if (settled !== null && scope !== null) {
        writeStoredTransfer(scope, { ...settled, confirmed: true });
        options.onRestoredRecord(null);
      }
      options.onConfirmed();
    },
  };
}
