import { describe, expect, it } from 'vitest';
import type { HexAddress } from '@/config/networks';
import { isSameTxOwner, isSameTxOwnerOrUnknown } from './tx-owner';

const WALLET_A: HexAddress = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const WALLET_B: HexAddress = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';

describe('isSameTxOwner (R3 跨账户)', () => {
  it('matches the same chain and the same wallet', () => {
    expect(
      isSameTxOwner({ chainId: 31337, account: WALLET_A }, { chainId: 31337, account: WALLET_A }),
    ).toBe(true);
  });

  it('matches a checksummed address against its lower-cased form', () => {
    expect(
      isSameTxOwner(
        { chainId: 31337, account: WALLET_A },
        { chainId: 31337, account: WALLET_A.toLowerCase() as HexAddress },
      ),
    ).toBe(true);
  });

  it('rejects a different wallet (A 发起、切到 B 后不能代签)', () => {
    expect(
      isSameTxOwner({ chainId: 31337, account: WALLET_A }, { chainId: 31337, account: WALLET_B }),
    ).toBe(false);
  });

  it('rejects a different chain even with the same wallet', () => {
    expect(
      isSameTxOwner({ chainId: 31337, account: WALLET_A }, { chainId: 56, account: WALLET_A }),
    ).toBe(false);
  });

  it('treats unknown owners as a mismatch so nothing is ever signed blind', () => {
    expect(isSameTxOwnerOrUnknown(undefined, { chainId: 31337, account: WALLET_A })).toBe(false);
    expect(isSameTxOwnerOrUnknown({ chainId: 31337, account: WALLET_A }, undefined)).toBe(false);
    expect(
      isSameTxOwnerOrUnknown(
        { chainId: 31337, account: WALLET_A },
        { chainId: 31337, account: WALLET_A },
      ),
    ).toBe(true);
  });
});
