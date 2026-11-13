import { describe, expect, it } from 'vitest';
import {
  BATCH_GAS_DEFAULT_NATIVE,
  BATCH_GAS_DEFAULT_TOKEN,
  BATCH_GAS_MAX,
  BATCH_GAS_MIN,
  NATIVE_FEE_RESERVE_WEI,
  isBatchGasOverBlock,
  nativeBatchAvailable,
  nativeBatchReserve,
  parseBatchGas,
} from './batch-gas';

describe('parseBatchGas', () => {
  it('accepts the defaults and both bounds', () => {
    expect(parseBatchGas(String(BATCH_GAS_DEFAULT_NATIVE))).toEqual({ kind: 'ok', value: 30000 });
    expect(parseBatchGas(String(BATCH_GAS_DEFAULT_TOKEN))).toEqual({ kind: 'ok', value: 60000 });
    expect(parseBatchGas(String(BATCH_GAS_MIN))).toEqual({ kind: 'ok', value: 21000 });
    expect(parseBatchGas(String(BATCH_GAS_MAX))).toEqual({ kind: 'ok', value: 1000000 });
  });

  it('reports out-of-range and malformed values as reasons', () => {
    expect(parseBatchGas('')).toEqual({ kind: 'error', reason: 'empty' });
    expect(parseBatchGas('abc')).toEqual({ kind: 'error', reason: 'invalid' });
    expect(parseBatchGas('1.5')).toEqual({ kind: 'error', reason: 'invalid' });
    expect(parseBatchGas('-21000')).toEqual({ kind: 'error', reason: 'invalid' });
    expect(parseBatchGas('20999')).toEqual({ kind: 'error', reason: 'belowMin' });
    expect(parseBatchGas('1000001')).toEqual({ kind: 'error', reason: 'aboveMax' });
  });
});

describe('batch gas total', () => {
  it('caps the batch at one block of gas', () => {
    expect(isBatchGasOverBlock(300, 100000)).toBe(false); // exactly 30,000,000
    expect(isBatchGasOverBlock(301, 100000)).toBe(true);
    expect(isBatchGasOverBlock(400, 100000)).toBe(true);
    expect(isBatchGasOverBlock(0, 100000)).toBe(false);
  });
});

describe('native reserve', () => {
  it('uses the 0.001 ETH floor for small batches', () => {
    expect(nativeBatchReserve(4, 30000)).toBe(NATIVE_FEE_RESERVE_WEI);
  });

  it('scales with recipients × gasLimit once that is larger', () => {
    // 100 × 100000 × 1 gwei = 0.01 ETH > 0.001 ETH
    expect(nativeBatchReserve(100, 100000)).toBe(10000000000000000n);
  });

  it('never returns a negative spendable balance', () => {
    expect(nativeBatchAvailable(500n, 4, 30000)).toBe(0n);
    expect(nativeBatchAvailable(undefined, 4, 30000)).toBeUndefined();
    expect(nativeBatchAvailable(2000000000000000000n, 4, 30000)).toBe(1999000000000000000n);
  });
});
