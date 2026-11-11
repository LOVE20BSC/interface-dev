import { describe, expect, it } from 'vitest';
import {
  selectSwapReceiptView,
  swapPostDismiss,
} from '@/features/swap-token/lib/swap-receipt-dismissal';
import type { SwapRecord } from '@/features/swap-token/lib/swap-receipt-record';
import type { SwapToken } from '@/features/swap-token/lib/swap-types';

const FROM: SwapToken = { kind: 'native', address: undefined, symbol: 'ETH', decimals: 18 };
const TO: SwapToken = {
  kind: 'community',
  address: '0x0000000000000000000000000000000000000001',
  symbol: 'TestLOVE20',
  decimals: 18,
};

const RECORD: SwapRecord = {
  hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  kind: 'swap',
  fromKey: 'native',
  toKey: `community:${TO.address}`,
  fromSymbol: 'ETH',
  toSymbol: 'TestLOVE20',
  fromDecimals: 18,
  toDecimals: 18,
  amountIn: 10n ** 16n,
  minOut: 1n,
  quoteOut: 2n,
  actualOut: 3_000_000_000_000_000_000n,
  paidIn: 10n ** 16n,
  path: [],
  pathSymbols: ['ETH', 'TestLOVE20'],
  pairAddresses: [],
  pairToken0: [],
  pairToken1: [],
  belowMinOut: false,
  confirmed: true,
  recordedAt: 1,
};

describe('selectSwapReceiptView', () => {
  it('shows the receipt for the current pair until dismissed', () => {
    expect(selectSwapReceiptView(RECORD, FROM, TO, null)).toBe('receipt');
    expect(selectSwapReceiptView(RECORD, FROM, TO, RECORD.hash)).toBe('dismissed');
  });

  it('never shows a receipt for a different pair', () => {
    expect(selectSwapReceiptView(RECORD, TO, FROM, null)).toBe('none');
  });
});

describe('swapPostDismiss', () => {
  it('clears the amount input and keeps the actual received amount for the strip', () => {
    expect(swapPostDismiss(RECORD)).toEqual({
      amountInput: '',
      received: '3',
      symbol: 'TestLOVE20',
    });
  });

  it('reports an unknown amount honestly', () => {
    expect(swapPostDismiss({ ...RECORD, actualOut: undefined })).toEqual({
      amountInput: '',
      received: '—',
      symbol: 'TestLOVE20',
    });
  });
});
