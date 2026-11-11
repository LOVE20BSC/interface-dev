import { beforeEach, describe, expect, it } from 'vitest';
import { cache } from '@/shared/lib/cache';
import {
  clearSwapRecord,
  createSwapScope,
  readSwapRecord,
  swapRecordMatchesPair,
  writeSwapRecord,
  type SwapRecord,
} from './swap-receipt-record';
import type { SwapToken } from './swap-types';

const HASH = `0x${'ab'.repeat(32)}` as const;
const WETH = '0x0000000000000000000000000000000000000001';
const TOKEN = '0x0000000000000000000000000000000000000002';
const scope = createSwapScope(
  31337,
  '0x00000000000000000000000000000000000000aa',
  '0x00000000000000000000000000000000000000bb',
);

const native: SwapToken = { kind: 'native', address: undefined, symbol: 'ETH', decimals: 18 };
const wrapped: SwapToken = { kind: 'wrapped', address: WETH, symbol: 'TestWETH', decimals: 18 };
const community: SwapToken = {
  kind: 'community',
  address: TOKEN,
  symbol: 'TestLOVE20',
  decimals: 18,
};

function record(overrides: Partial<SwapRecord> = {}): SwapRecord {
  return {
    hash: HASH,
    kind: 'swap',
    fromKey: 'native',
    toKey: `community:${TOKEN}`,
    fromSymbol: 'ETH',
    toSymbol: 'TestLOVE20',
    fromDecimals: 18,
    toDecimals: 18,
    amountIn: 10n ** 16n,
    minOut: 19n * 10n ** 18n,
    quoteOut: 20n * 10n ** 18n,
    actualOut: 20n * 10n ** 18n,
    paidIn: 10n ** 16n,
    path: [WETH, TOKEN],
    pathSymbols: ['ETH', 'TestLOVE20'],
    pairAddresses: ['0x0000000000000000000000000000000000000010'],
    pairToken0: [TOKEN],
    pairToken1: [WETH],
    belowMinOut: false,
    confirmed: true,
    recordedAt: 1_700_000_000_000,
    ...overrides,
  };
}

beforeEach(() => {
  cache.clearAll();
});

describe('swap receipt record', () => {
  it('round-trips a confirmed receipt as decimal strings', () => {
    writeSwapRecord(scope, record());
    const stored = readSwapRecord(scope);
    expect(stored).toMatchObject({
      hash: HASH,
      confirmed: true,
      actualOut: 20n * 10n ** 18n,
      minOut: 19n * 10n ** 18n,
      belowMinOut: false,
      pairToken0: [TOKEN],
      pairToken1: [WETH],
    });
  });

  it('keeps a pending record recoverable without inventing an amount', () => {
    writeSwapRecord(scope, record({ actualOut: undefined, paidIn: undefined, confirmed: false }));
    const stored = readSwapRecord(scope);
    expect(stored?.confirmed).toBe(false);
    expect(stored?.actualOut).toBeUndefined();
    expect(stored?.hash).toBe(HASH);
  });

  it('self-heals a record with a malformed hash', () => {
    cache.set(scope, 'swapReceipt', { hash: '0x1234', kind: 'swap' });
    expect(readSwapRecord(scope)).toBeNull();
  });

  it('matches only the same pair', () => {
    const stored = record();
    expect(swapRecordMatchesPair(stored, native, community)).toBe(true);
    expect(swapRecordMatchesPair(stored, wrapped, community)).toBe(false);
    expect(swapRecordMatchesPair(stored, native, wrapped)).toBe(false);
  });

  it('clears on demand', () => {
    writeSwapRecord(scope, record());
    clearSwapRecord(scope);
    expect(readSwapRecord(scope)).toBeNull();
  });
});
