import { copy } from '@/shared/config/copy-pages';
import { isUserRejection, toUserMessage } from '@/shared/lib/errors';
import { isTxSendNonceError, isTxStaleBlockError, txSendRecoveryKind } from '@/shared/lib/tx-send-errors';

/**
 * Send-time failure translation for 批量转账 (pure, no React, no chain).
 *
 * The batch contract reports "recipient #i failed" without the inner failure
 * reason (`NativeTransferFailed` / `ERC20TransferFailed` only carry an error
 * fingerprint). The page therefore keeps two explanations apart using the
 * recipient's bytecode:
 *
 * - recipient is a plain wallet → its call failed because the per-recipient gas
 *   budget was too small (an EOA transfer cannot reject anything else);
 * - recipient has bytecode    → a contract rejected the asset (no payable
 *   fallback / no `transferFrom` path).
 *
 * Every other custom error gets its own sentence; no selector, raw revert data,
 * gas or nonce value reaches the UI.
 */
export interface BatchErrorContext {
  readonly nativeSymbol: string;
  readonly tokenSymbol: string;
  /** Bytecode presence per recipient, aligned to the submitted arrays. */
  readonly recipientHasCode: readonly (boolean | undefined)[];
}

export interface BatchErrorMessage {
  readonly message: string;
  /** Recovery family for the send-time nonce/stale-block dead end. */
  readonly kind?: 'nonce' | 'staleBlock';
}

function messageChain(value: unknown, depth = 0): string {
  if (depth > 6 || typeof value !== 'object' || value === null) return '';
  const record = value as Record<string, unknown>;
  const own = typeof record.message === 'string' ? record.message : '';
  return `${own} ${messageChain(record.cause, depth + 1)}`.toLowerCase();
}

interface RevertInfo {
  readonly errorName: string;
  readonly args: readonly unknown[];
}

/**
 * Finds the decoded custom error anywhere in the error chain. viem attaches
 * `data = { errorName, args, abiItem }` to `ContractFunctionRevertedError`;
 * wallets sometimes only put the name into the message text, which the regex
 * fallback below covers.
 */
function revertInfo(cause: unknown, depth = 0): RevertInfo | undefined {
  if (depth > 6 || typeof cause !== 'object' || cause === null) return undefined;
  const record = cause as {
    errorName?: unknown;
    data?: unknown;
    cause?: unknown;
    error?: unknown;
  };
  if (typeof record.errorName === 'string' && record.errorName.length > 0) {
    const args = Array.isArray((record as { args?: unknown }).args)
      ? ((record as { args: unknown[] }).args as readonly unknown[])
      : [];
    return { errorName: record.errorName, args };
  }
  const data = record.data;
  if (typeof data === 'object' && data !== null) {
    const decoded = data as { errorName?: unknown; args?: unknown };
    if (typeof decoded.errorName === 'string' && decoded.errorName.length > 0) {
      return {
        errorName: decoded.errorName,
        args: Array.isArray(decoded.args) ? (decoded.args as readonly unknown[]) : [],
      };
    }
  }
  return revertInfo(record.cause, depth + 1) ?? revertInfo(record.error, depth + 1);
}

function argsIndex(args: readonly unknown[], position: number): number | undefined {
  const value = args[position];
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return undefined;
}

/** The recipient index a *TransferFailed error points at, 0-based. */
function failedRecipientIndex(name: string, args: readonly unknown[]): number | undefined {
  // NativeTransferFailed(uint256 index, ...) / ERC20TransferFailed(address token, uint256 index, ...)
  return name === 'ERC20TransferFailed' ? argsIndex(args, 1) : argsIndex(args, 0);
}

export function describeBatchError(cause: unknown, context: BatchErrorContext): BatchErrorMessage {
  if (isUserRejection(cause)) return { message: copy.batchTransfer.errors.rejected };

  const recovery = txSendRecoveryKind(cause);
  if (recovery === 'nonce') {
    return { message: copy.txWatch.bodies.nonceGap, kind: 'nonce' };
  }
  if (recovery === 'staleBlock') {
    return { message: copy.txWatch.staleBlock, kind: 'staleBlock' };
  }
  // Defensive: the shared helpers and the family recovery must agree.
  if (isTxSendNonceError(cause)) {
    return { message: copy.txWatch.bodies.nonceGap, kind: 'nonce' };
  }
  if (isTxStaleBlockError(cause)) {
    return { message: copy.txWatch.staleBlock, kind: 'staleBlock' };
  }

  const message = messageChain(cause);
  if (message.includes('insufficient funds')) {
    return { message: copy.batchTransfer.errors.insufficientFunds(context.nativeSymbol) };
  }

  const revert = revertInfo(cause);
  if (revert !== undefined) {
    const { errorName, args } = revert;
    switch (errorName) {
      case 'NativeTransferFailed':
      case 'ERC20TransferFailed': {
        const index = failedRecipientIndex(errorName, args);
        if (index !== undefined) {
          const line = index + 1;
          const hasCode = context.recipientHasCode[index];
          if (hasCode === true) {
            return {
              message: copy.batchTransfer.errors.recipientRejected(line, context.tokenSymbol),
            };
          }
          return { message: copy.batchTransfer.errors.gasRow(line) };
        }
        return { message: copy.batchTransfer.errors.reverted };
      }
      case 'ERC20InsufficientBalance':
        return { message: copy.batchTransfer.errors.balanceShort(context.tokenSymbol) };
      case 'ERC20InsufficientAllowance':
        return { message: copy.batchTransfer.errors.allowanceShort(context.tokenSymbol) };
      case 'NativeValueMismatch':
        return { message: copy.batchTransfer.errors.nativeValueMismatch };
      case 'ZeroAmount':
      case 'ZeroRecipient': {
        const index = argsIndex(args, 0);
        return {
          message:
            index === undefined
              ? copy.batchTransfer.errors.emptyBatch
              : copy.batchTransfer.errors.invalidRow(index + 1),
        };
      }
      case 'ArrayLengthMismatch':
      case 'EmptyBatch':
        return { message: copy.batchTransfer.errors.emptyBatch };
      case 'TokenNotContract':
        return { message: copy.batchTransfer.errors.tokenNotContract };
      case 'ERC20BalanceQueryFailed':
      case 'ERC20AllowanceQueryFailed':
        return { message: copy.batchTransfer.errors.tokenUnreadable };
      default:
        break;
    }
  }

  // Wallet-layer fallback: some providers only expose the name in the text.
  const namedIndex = /(?:Native|ERC20)TransferFailed\((\d+)/i.exec(message);
  if (namedIndex !== null) {
    const line = Number.parseInt(namedIndex[1] ?? '0', 10) + 1;
    return { message: copy.batchTransfer.errors.gasRow(line) };
  }
  if (message.includes('insufficient balance') || message.includes('exceeds balance')) {
    return { message: copy.batchTransfer.errors.balanceShort(context.tokenSymbol) };
  }
  if (message.includes('exceeds allowance')) {
    return { message: copy.batchTransfer.errors.allowanceShort(context.tokenSymbol) };
  }
  if (message.includes('revert')) {
    return { message: copy.batchTransfer.errors.reverted };
  }
  return { message: toUserMessage(cause) };
}
