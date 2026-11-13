import { copy } from '@/shared/config/copy-pages';
import { isUserRejection, toUserMessage } from '@/shared/lib/errors';
import { isTxSendNonceError, isTxStaleBlockError } from '@/shared/lib/tx-send-errors';

export interface TransferErrorContext {
  readonly nativeSymbol: string;
  readonly tokenSymbol: string;
}

function messageChain(value: unknown, depth = 0): string {
  if (depth > 5 || typeof value !== 'object' || value === null) return '';
  const record = value as Record<string, unknown>;
  const own = typeof record.message === 'string' ? record.message : '';
  return `${own} ${messageChain(record.cause, depth + 1)}`.toLowerCase();
}

/**
 * Send-time failures for a plain transfer. The only ERC20 revert worth naming
 * is a balance/allowance mismatch (we pre-check the balance, so this is a race);
 * everything else keeps the global §4.4 mapping. No selector, gas or nonce word
 * reaches the UI.
 */
export function describeTransferError(cause: unknown, context: TransferErrorContext): string {
  if (isUserRejection(cause)) return copy.transfer.errors.rejected;
  if (isTxSendNonceError(cause)) return copy.txWatch.bodies.nonceGap;
  if (isTxStaleBlockError(cause)) return copy.txWatch.staleBlock;

  const message = messageChain(cause);
  if (message.includes('insufficient funds')) {
    return copy.transfer.errors.insufficientFunds(context.nativeSymbol);
  }
  if (
    message.includes('insufficient balance') ||
    message.includes('exceeds balance') ||
    message.includes('transfer amount exceeds')
  ) {
    return copy.transfer.errors.balanceShort(context.tokenSymbol);
  }
  if (message.includes('revert') || message.includes('execution reverted')) {
    return copy.transfer.errors.reverted;
  }
  return toUserMessage(cause);
}
