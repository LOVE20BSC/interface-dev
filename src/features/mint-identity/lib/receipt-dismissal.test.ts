import { describe, expect, it } from 'vitest';
import {
  mintPostDismiss,
  selectMintReceiptView,
} from '@/features/mint-identity/lib/receipt-dismissal';
import type { MintedIdentity } from '@/features/mint-identity/model/use-mint-transaction';

const RECEIPT: MintedIdentity = {
  memberId: 7n,
  name: 'Testdev-member-7',
  cost: 10n,
  hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

describe('selectMintReceiptView', () => {
  it('shows the receipt while it has not been dismissed', () => {
    expect(selectMintReceiptView(RECEIPT, null)).toBe('receipt');
    expect(selectMintReceiptView(RECEIPT, '0xother')).toBe('receipt');
  });

  it('turns into the success strip after dismissal', () => {
    expect(selectMintReceiptView(RECEIPT, RECEIPT.hash)).toBe('dismissed');
  });

  it('a new mint hash opens the receipt again', () => {
    expect(selectMintReceiptView({ ...RECEIPT, hash: '0xbb' }, RECEIPT.hash)).toBe('receipt');
  });

  it('has no post-success state without a receipt', () => {
    expect(selectMintReceiptView(null, null)).toBe('none');
  });
});

describe('mintPostDismiss', () => {
  it('resets the name so the minted name cannot be submitted again', () => {
    expect(mintPostDismiss(RECEIPT)).toEqual({
      name: '',
      memberId: 7n,
      nameOnChain: 'Testdev-member-7',
    });
  });
});
