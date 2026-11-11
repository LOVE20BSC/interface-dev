import { formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import {
  swapRecordMatchesPair,
  type SwapRecord,
} from '@/features/swap-token/lib/swap-receipt-record';
import type { SwapToken } from '@/features/swap-token/lib/swap-types';

export type SwapReceiptView = 'none' | 'receipt' | 'dismissed';

/** Same pair + same hash gate as before, plus the owner's dismissal. */
export function selectSwapReceiptView(
  record: SwapRecord | null,
  from: SwapToken | undefined,
  to: SwapToken | undefined,
  dismissedHash: string | null,
): SwapReceiptView {
  if (record === null || from === undefined || to === undefined) return 'none';
  if (!swapRecordMatchesPair(record, from, to)) return 'none';
  return record.hash === dismissedHash ? 'dismissed' : 'receipt';
}

export interface SwapPostDismissState {
  readonly amountInput: '';
  readonly received: string;
  readonly symbol: string;
}

/** The form resets to empty; the strip keeps the actual amount from the receipt. */
export function swapPostDismiss(record: SwapRecord): SwapPostDismissState {
  const received =
    record.actualOut !== undefined && record.toDecimals !== undefined
      ? formatTokenAmount(record.actualOut, record.toDecimals)
      : UNKNOWN;
  return { amountInput: '', received, symbol: record.toSymbol };
}
