import { describe, expect, it } from 'vitest';
import {
  classifyTxSendError,
  isTxSendNonceError,
  isTxStaleBlockError,
  txSendRecoveryKind,
} from './tx-send-errors';

function named(name: string, message = ''): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function wrapped(cause: unknown): Error {
  const outer = new Error('The request failed.');
  outer.name = 'TransactionExecutionError';
  (outer as Error & { cause: unknown }).cause = cause;
  return outer;
}

function messageError(message: string): Error {
  return new Error(message);
}

describe('classifyTxSendError', () => {
  it('classifies viem nonce error names', () => {
    expect(classifyTxSendError(named('NonceTooLowError'))).toBe('nonceMismatch');
    expect(classifyTxSendError(named('NonceTooHighError'))).toBe('nonceMismatch');
  });

  it('classifies the raw "nonce too low" family', () => {
    for (const message of [
      'nonce too low',
      'Nonce too low: next nonce 69, tx nonce 68',
      'nonce has already been used',
      'transaction already imported',
    ]) {
      expect(classifyTxSendError(messageError(message))).toBe('nonceMismatch');
    }
  });

  it('classifies the "nonce too high" family', () => {
    for (const message of [
      'nonce too high',
      'Nonce too high. Expected nonce to be 3 but got 68.',
      'Nonce provided for the transaction (68) is higher than the next one expected.',
    ]) {
      expect(classifyTxSendError(messageError(message))).toBe('nonceMismatch');
    }
  });

  it('classifies replacement underpriced', () => {
    expect(classifyTxSendError(messageError('replacement transaction underpriced'))).toBe(
      'underpriced',
    );
    expect(classifyTxSendError(messageError('Replacement underpriced'))).toBe('underpriced');
  });

  it('classifies already known / known transaction', () => {
    expect(classifyTxSendError(messageError('already known'))).toBe('alreadyKnown');
    expect(classifyTxSendError(messageError('known transaction: 0xabc'))).toBe('alreadyKnown');
  });

  it('walks the wagmi/viem cause chain around the provider error', () => {
    expect(classifyTxSendError(wrapped({ code: -32000, message: 'nonce too low' }))).toBe(
      'nonceMismatch',
    );
    expect(classifyTxSendError(wrapped(wrapped(messageError('nonce has already been used'))))).toBe(
      'nonceMismatch',
    );
    // MetaMask nests provider errors under info.error.
    expect(
      classifyTxSendError({
        name: 'TransactionExecutionError',
        info: { error: { message: 'nonce too low' } },
      }),
    ).toBe('nonceMismatch');
  });

  it('classifies the stale wallet chain view (anvil BlockOutOfRangeError)', () => {
    expect(classifyTxSendError(named('BlockOutOfRangeError'))).toBe('staleBlock');
    expect(
      classifyTxSendError(
        messageError(
          'Invalid params: BlockOutOfRangeError: block height is 970 but requested was 982',
        ),
      ),
    ).toBe('staleBlock');
    expect(
      classifyTxSendError(
        wrapped({
          code: -32602,
          message:
            'RPC request failed: Request: EthGetCodeAt(...), Some(0x3d6) Error: Invalid params: BlockOutOfRangeError: block height is 970 but requested was 982',
        }),
      ),
    ).toBe('staleBlock');
    expect(classifyTxSendError(messageError('header not found'))).toBe('staleBlock');
    expect(classifyTxSendError(messageError('unknown block'))).toBe('staleBlock');
  });

  it('keeps nonce and stale-block families apart for the UI action', () => {
    expect(isTxSendNonceError(messageError('block height is 970 but requested was 982'))).toBe(
      false,
    );
    expect(isTxStaleBlockError(messageError('block height is 970 but requested was 982'))).toBe(
      true,
    );
    expect(isTxStaleBlockError(messageError('nonce too low'))).toBe(false);
    expect(txSendRecoveryKind(messageError('nonce too low'))).toBe('nonce');
    expect(txSendRecoveryKind(messageError('nonce has already been used'))).toBe('nonce');
    expect(txSendRecoveryKind(messageError('already known'))).toBe('nonce');
    expect(txSendRecoveryKind(messageError('BlockOutOfRangeError'))).toBe('staleBlock');
    expect(txSendRecoveryKind(messageError('insufficient funds'))).toBeUndefined();
    expect(txSendRecoveryKind({ code: 4001 })).toBeUndefined();
  });

  it('does not steal non-nonce failures', () => {
    expect(classifyTxSendError(named('TransactionExecutionError'))).toBeNull();
    expect(classifyTxSendError({ code: 4001, message: 'User rejected the request.' })).toBeNull();
    expect(
      classifyTxSendError(messageError('insufficient funds for gas * price + value')),
    ).toBeNull();
    expect(
      classifyTxSendError(
        messageError('execution reverted: ERC20: transfer amount exceeds balance'),
      ),
    ).toBeNull();
    expect(classifyTxSendError(undefined)).toBeNull();
    expect(classifyTxSendError('nonce too low')).toBe('nonceMismatch');
  });

  it('exposes the boolean used by the three error helpers', () => {
    expect(isTxSendNonceError(messageError('nonce too low'))).toBe(true);
    expect(isTxSendNonceError(messageError('replacement transaction underpriced'))).toBe(true);
    expect(isTxSendNonceError(messageError('already known'))).toBe(true);
    expect(isTxSendNonceError({ code: 4001, message: 'User rejected the request.' })).toBe(false);
    expect(isTxSendNonceError(messageError('insufficient funds'))).toBe(false);
  });
});
