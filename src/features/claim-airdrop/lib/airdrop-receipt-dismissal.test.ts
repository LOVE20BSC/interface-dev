import { describe, expect, it } from 'vitest';
import { selectAirdropReceiptView } from '@/features/claim-airdrop/lib/airdrop-receipt-dismissal';
import type { AirdropClaimReceipt } from '@/features/claim-airdrop/lib/airdrop-claim-record';

const RECEIPT: AirdropClaimReceipt = {
  hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  amount: 10n ** 18n,
  share: 1n,
  totalShare: 10n,
  remainingShare: 9n,
  tokenSymbol: 'TestLOVE20',
  tokenDecimals: 18,
  recordedAt: 1,
};

describe('selectAirdropReceiptView', () => {
  it('shows the receipt until it is dismissed', () => {
    expect(selectAirdropReceiptView(RECEIPT, false, 'claimed')).toBe('receipt');
  });

  it('lands on the S6 claimed state after dismissal', () => {
    expect(selectAirdropReceiptView(RECEIPT, true, 'claimed')).toBe('claimed');
  });

  it('waits for the post-receipt refetch instead of showing the claim CTA again', () => {
    expect(selectAirdropReceiptView(RECEIPT, true, 'eligible')).toBe('waiting');
    expect(selectAirdropReceiptView(null, false, 'loading')).toBe('waiting');
  });
});
