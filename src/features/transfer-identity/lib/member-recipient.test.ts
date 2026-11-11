import { describe, expect, it, vi } from 'vitest';
import { BaseError, ContractFunctionRevertedError } from 'viem';
import { memberNftAbi } from '@/config/abis';
import {
  classifyOwnerOfError,
  parseMemberId,
  resolveMemberRecipient,
} from '@/features/transfer-identity/lib/member-recipient';

const SELF = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('parseMemberId', () => {
  it('accepts a plain integer and the optional #', () => {
    expect(parseMemberId('12')).toBe(12n);
    expect(parseMemberId('#12')).toBe(12n);
    expect(parseMemberId('  #12  ')).toBe(12n);
    expect(parseMemberId('0')).toBe(0n);
  });

  it('rejects empty, signed, decimal, spaced and non-numeric input', () => {
    expect(parseMemberId('')).toBeNull();
    expect(parseMemberId('#')).toBeNull();
    expect(parseMemberId('-1')).toBeNull();
    expect(parseMemberId('+1')).toBeNull();
    expect(parseMemberId('1.0')).toBeNull();
    expect(parseMemberId('# 1')).toBeNull();
    expect(parseMemberId('1 2')).toBeNull();
    expect(parseMemberId('abc')).toBeNull();
    expect(parseMemberId('１２')).toBeNull();
  });

  it('rejects ids outside uint256', () => {
    expect(parseMemberId((1n << 256n).toString())).toBeNull();
    expect(parseMemberId(((1n << 256n) - 1n).toString())).toBe((1n << 256n) - 1n);
  });
});

describe('classifyOwnerOfError', () => {
  it('treats an ownerOf revert as a non-existent identity NFT', () => {
    const reverted = new ContractFunctionRevertedError({
      abi: memberNftAbi,
      functionName: 'ownerOf',
      message: 'execution reverted',
    });
    expect(classifyOwnerOfError(reverted)).toBe('not-found');
    expect(classifyOwnerOfError(new BaseError('call failed', { cause: reverted }))).toBe(
      'not-found',
    );
  });

  it('treats transport and unknown failures as retryable errors', () => {
    expect(classifyOwnerOfError(new Error('network down'))).toBe('error');
    expect(classifyOwnerOfError('nope')).toBe('error');
  });
});

describe('resolveMemberRecipient', () => {
  it('resolves another wallet as the recipient', async () => {
    const readOwner = vi.fn().mockResolvedValue(OTHER);
    await expect(resolveMemberRecipient(2n, SELF, readOwner)).resolves.toEqual({
      status: 'ok',
      address: OTHER,
      memberId: 2n,
    });
    expect(readOwner).toHaveBeenCalledWith(2n);
  });

  it('rejects an identity NFT owned by the connected wallet', async () => {
    await expect(resolveMemberRecipient(1n, SELF, async () => SELF)).resolves.toEqual({
      status: 'self',
    });
  });

  it('maps a reverted ownerOf read to not-found', async () => {
    const reverted = new ContractFunctionRevertedError({
      abi: memberNftAbi,
      functionName: 'ownerOf',
      message: 'execution reverted',
    });
    await expect(
      resolveMemberRecipient(999n, SELF, async () => {
        throw reverted;
      }),
    ).resolves.toEqual({ status: 'not-found' });
  });

  it('keeps a transient read failure retryable', async () => {
    await expect(
      resolveMemberRecipient(2n, SELF, async () => {
        throw new Error('fetch failed');
      }),
    ).resolves.toEqual({ status: 'error' });
  });
});
