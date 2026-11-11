import { copy } from '@/shared/config/copy-pages';
import { isUserRejection, toUserMessage } from '@/shared/lib/errors';

function messageChain(value: unknown, depth = 0): string {
  if (depth > 5 || typeof value !== 'object' || value === null) return '';
  const record = value as Record<string, unknown>;
  const own = typeof record.message === 'string' ? record.message : '';
  return `${own} ${messageChain(record.cause, depth + 1)}`.toLowerCase();
}

export interface SwapErrorContext {
  readonly nativeSymbol: string;
  readonly fromSymbol: string;
}

/**
 * Swaps inherit the global §4.4 mapping, with four Uniswap-specific results
 * spelled out because the generic fallback would not give a next step.
 * No revert selector, gas, nonce or stack ever reaches the UI.
 */
export function describeSwapError(cause: unknown, context: SwapErrorContext): string {
  if (isUserRejection(cause)) return copy.swap.errors.rejected;

  const message = messageChain(cause);
  if (
    message.includes('insufficient_output_amount') ||
    message.includes('too little received') ||
    message.includes('price slippage') ||
    message.includes('amountoutmin')
  ) {
    return copy.swap.errors.priceMoved;
  }
  if (message.includes('expired') || message.includes('deadline')) {
    return copy.swap.errors.expired;
  }
  if (message.includes('insufficient_liquidity') || message.includes('insufficient liquidity')) {
    return copy.swap.errors.liquidity;
  }
  if (
    message.includes('transfer_from_failed') ||
    message.includes('transfer_helper') ||
    message.includes('insufficient allowance') ||
    message.includes('allowance')
  ) {
    return copy.swap.ladder.approvalShort;
  }
  if (message.includes('insufficient balance') || message.includes('exceeds balance')) {
    return copy.swap.errors.balanceShort(context.fromSymbol);
  }
  if (message.includes('insufficient funds')) {
    return copy.swap.errors.insufficientFunds(context.nativeSymbol);
  }
  return toUserMessage(cause);
}

export function swapRetryLabel(message: string): string | undefined {
  if (
    message === copy.swap.errors.priceMoved ||
    message === copy.swap.errors.liquidity ||
    message === copy.swap.errors.expired
  ) {
    return copy.swap.errors.priceMovedNext;
  }
  return undefined;
}
