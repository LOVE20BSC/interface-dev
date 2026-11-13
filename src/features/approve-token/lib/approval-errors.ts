import { copy } from '@/shared/config/copy-pages';
import { isUserRejection, toUserMessage } from '@/shared/lib/errors';
import { isTxSendNonceError, isTxStaleBlockError } from '@/shared/lib/tx-send-errors';
import type { ApprovalMode } from '@/features/approve-token/lib/approval-types';

export interface ApprovalErrorContext {
  readonly nativeSymbol: string;
  readonly tokenSymbol: string;
  readonly mode: ApprovalMode;
}

function messageChain(value: unknown, depth = 0): string {
  if (depth > 5 || typeof value !== 'object' || value === null) return '';
  const record = value as Record<string, unknown>;
  const own = typeof record.message === 'string' ? record.message : '';
  return `${own} ${messageChain(record.cause, depth + 1)}`.toLowerCase();
}

/**
 * Send-time failures for one 授权/撤销 write. The page never prints a selector,
 * gas or nonce word; every branch names what the user can do next.
 */
export function describeApprovalError(cause: unknown, context: ApprovalErrorContext): string {
  if (isUserRejection(cause)) return copy.approvals.errors.rejected;
  if (isTxSendNonceError(cause)) return copy.txWatch.bodies.nonceGap;
  if (isTxStaleBlockError(cause)) return copy.txWatch.staleBlock;

  const message = messageChain(cause);
  if (message.includes('insufficient funds')) {
    return copy.approvals.errors.insufficientFunds(context.nativeSymbol);
  }
  if (message.includes('revert') || message.includes('execution reverted')) {
    return copy.approvals.errors.reverted;
  }
  return toUserMessage(cause);
}
