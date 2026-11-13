import { describe, expect, it } from 'vitest';
import { copy } from '@/shared/config/copy-pages';
import { isUserRejection } from '@/shared/lib/errors';
import { describeBatchError } from './batch-errors';

const CONTEXT = {
  nativeSymbol: 'ETH',
  tokenSymbol: 'TestLOVE20',
  recipientHasCode: [false, true, undefined],
};

function revert(errorName: string, args: readonly unknown[]): Error {
  const error = new Error('execution reverted') as Error & {
    cause: unknown;
  };
  error.cause = {
    name: 'ContractFunctionRevertedError',
    message: 'execution reverted',
    data: { errorName, args },
  };
  return error;
}

describe('describeBatchError', () => {
  it('maps a wallet rejection to the no-op sentence', () => {
    const cause = { code: 4001, message: 'User rejected the request.' };
    expect(isUserRejection(cause)).toBe(true);
    expect(describeBatchError(cause, CONTEXT)).toEqual({
      message: copy.batchTransfer.errors.rejected,
    });
  });

  it('explains a plain-wallet failure as an insufficient per-recipient gas budget', () => {
    const message = describeBatchError(revert('NativeTransferFailed', [0, '0xabc', 1n]), CONTEXT);

    expect(message.message).toBe(copy.batchTransfer.errors.gasRow(1));
  });

  it('explains a contract recipient failure as a rejection', () => {
    const message = describeBatchError(revert('NativeTransferFailed', [1]), CONTEXT);

    expect(message.message).toBe(
      copy.batchTransfer.errors.recipientRejected(2, CONTEXT.tokenSymbol),
    );
  });

  it('reads the failing index of an ERC20 transfer failure from the second argument', () => {
    const message = describeBatchError(
      revert('ERC20TransferFailed', ['0xtoken', 2, '0xabc', 1n]),
      CONTEXT,
    );

    // Index 2 has unknown bytecode in CONTEXT → the conservative gas wording.
    expect(message.message).toBe(copy.batchTransfer.errors.gasRow(3));
  });

  it('keeps balance and allowance races apart', () => {
    expect(describeBatchError(revert('ERC20InsufficientBalance', []), CONTEXT).message).toBe(
      copy.batchTransfer.errors.balanceShort(CONTEXT.tokenSymbol),
    );
    expect(describeBatchError(revert('ERC20InsufficientAllowance', []), CONTEXT).message).toBe(
      copy.batchTransfer.errors.allowanceShort(CONTEXT.tokenSymbol),
    );
  });

  it('turns a zero-amount argument error into the line that is wrong', () => {
    const message = describeBatchError(revert('ZeroAmount', [1]), CONTEXT);

    expect(message.message).toBe(copy.batchTransfer.errors.invalidRow(2));
  });

  it('falls back to the custom-error name in the message when data is not decoded', () => {
    const cause = new Error('reverted with custom error NativeTransferFailed(1, 0xabc');

    expect(describeBatchError(cause, CONTEXT).message).toBe(copy.batchTransfer.errors.gasRow(2));
  });

  it('classifies a nonce-shaped wallet failure with the recovery kind', () => {
    const result = describeBatchError(new Error('nonce too low'), CONTEXT);

    expect(result.kind).toBe('nonce');
    expect(result.message).toBe(copy.txWatch.bodies.nonceGap);
  });

  it('never leaks an unknown library error to the user', () => {
    const message = describeBatchError(new Error('boom internal'), CONTEXT);

    expect(message.message).toBe(copy.errors.generic);
  });
});
