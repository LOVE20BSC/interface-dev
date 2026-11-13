import { copy } from '@/shared/config/copy-pages';
import { isUserRejection } from '@/shared/lib/errors';
import { isTxSendNonceError, isTxStaleBlockError } from '@/shared/lib/tx-send-errors';

function messageChain(value: unknown, depth = 0): string {
  if (depth > 5 || typeof value !== 'object' || value === null) return '';
  const record = value as Record<string, unknown>;
  const own = typeof record.message === 'string' ? record.message : '';
  return `${own} ${messageChain(record.cause, depth + 1)}`.toLowerCase();
}

export interface LiquidityErrorContext {
  readonly nativeSymbol: string;
  readonly tokenSymbol: string;
}

/**
 * 加池/撤出的错误翻译：每个分支都给出「为什么」与「下一步」，不把
 * revert 选择器、gas、nonce 或原始 RPC 报文带进页面。
 */
export function describeLiquidityError(
  cause: unknown,
  context: LiquidityErrorContext,
): string {
  if (isUserRejection(cause)) return copy.liquidity.errors.rejected;
  if (isTxSendNonceError(cause)) return copy.txWatch.bodies.nonceGap;
  if (isTxStaleBlockError(cause)) return copy.txWatch.staleBlock;

  const message = messageChain(cause);
  if (message.includes('insufficient funds') || message.includes('exceeds balance')) {
    return copy.liquidity.errors.insufficientFunds(context.nativeSymbol);
  }
  if (message.includes('pairwithoutliquidity') || message.includes('pair_missing') || message.includes('pairmissing')) {
    return copy.liquidity.errors.emptyPool;
  }
  if (message.includes('deadlineexpired') || message.includes('expired')) {
    return copy.liquidity.errors.expired;
  }
  if (
    message.includes('insufficient_a_amount') ||
    message.includes('insufficientamounta') ||
    message.includes('insufficient_token_amount') ||
    message.includes('insufficienttokenamount')
  ) {
    return copy.liquidity.errors.tokenMoved(context.tokenSymbol);
  }
  if (
    message.includes('insufficient_b_amount') ||
    message.includes('insufficientamountb') ||
    message.includes('insufficient_native_amount') ||
    message.includes('insufficientparenttokenamount')
  ) {
    return copy.liquidity.errors.nativeMoved(context.nativeSymbol);
  }
  if (message.includes('insufficient_liquidity') || message.includes('insufficient liquidity')) {
    return copy.liquidity.errors.poolTooSmall;
  }
  if (message.includes('zeroswapoutput') || message.includes('amountexceeded')) {
    return copy.liquidity.errors.amountTooSmall;
  }
  return copy.liquidity.errors.reverted;
}
