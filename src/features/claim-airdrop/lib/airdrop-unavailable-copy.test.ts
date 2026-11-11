import { describe, expect, it } from 'vitest';
import { copy } from '@/shared/config/copy';
import { airdropUnavailableCopy } from './airdrop-unavailable-copy';

describe('airdropUnavailableCopy', () => {
  it('has a distinct explanation for every S4 reason', () => {
    expect(airdropUnavailableCopy('pool-empty').title).toBe(
      copy.airdrop.unavailable.poolEmptyTitle,
    );
    expect(airdropUnavailableCopy('share-zero').title).toBe(
      copy.airdrop.unavailable.shareZeroTitle,
    );
    expect(airdropUnavailableCopy('share-exceeds-remaining').title).toBe(
      copy.airdrop.unavailable.shareExceedsTitle,
    );
    expect(airdropUnavailableCopy('zero-amount').title).toBe(
      copy.airdrop.unavailable.zeroAmountTitle,
    );
  });

  it('explains the empty pool instead of saying 无空投', () => {
    const poolEmpty = airdropUnavailableCopy('pool-empty');
    expect(poolEmpty.title).toBe('你有一份空投，但空投池还没有代币。');
    expect(poolEmpty.body).toContain('份额没有变化');
  });

  it('never uses 领取 in the S4 copy', () => {
    const all = (['pool-empty', 'share-zero', 'share-exceeds-remaining', 'zero-amount'] as const)
      .map((reason) => airdropUnavailableCopy(reason))
      .map((entry) => `${entry.title}${entry.body}`)
      .join('\n');
    expect(all).not.toContain('领取');
  });
});
