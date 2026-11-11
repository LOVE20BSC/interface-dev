import { describe, expect, it } from 'vitest';
import { copy } from '@/shared/config/copy-pages';
import { claimedAmountView } from './claimed-amount-view';

/**
 * S6 branch is chain-free: the amount is injected, so the "no amount available"
 * path (test/prod until CI-014 ships) is tested without a node.
 */
describe('claimedAmountView', () => {
  it('renders 「已铸造 {X} LOVE20」 when the adapter returned a real amount', () => {
    const view = claimedAmountView({
      amount: 5_000_000_000_000_000_000n,
      decimals: 18,
      symbol: 'LOVE20',
      explorerAvailable: true,
    });
    expect(view.hasAmount).toBe(true);
    expect(view.title).toBe('已铸造 5 LOVE20');
    expect(view.body).toBe(copy.airdrop.claimed.amountNote);
  });

  it('never invents a number when the amount is undefined', () => {
    const view = claimedAmountView({
      amount: undefined,
      decimals: 18,
      symbol: 'LOVE20',
      explorerAvailable: true,
    });
    expect(view.hasAmount).toBe(false);
    expect(view.title).toBe(copy.airdrop.claimed.title);
    expect(view.body).toBe(copy.airdrop.claimed.unknownBodyExplorer);
    expect(view.title).not.toContain('—');
  });

  it('uses the no-explorer explanation when the environment has no explorer (anvil)', () => {
    const view = claimedAmountView({
      amount: undefined,
      decimals: 18,
      symbol: 'LOVE20',
      explorerAvailable: false,
    });
    expect(view.body).toBe(copy.airdrop.claimed.unknownBody);
  });

  it('falls back to the unknown branch when symbol/decimals are missing', () => {
    expect(
      claimedAmountView({
        amount: 1n,
        decimals: undefined,
        symbol: 'LOVE20',
        explorerAvailable: false,
      }).hasAmount,
    ).toBe(false);
    expect(
      claimedAmountView({ amount: 1n, decimals: 18, symbol: undefined, explorerAvailable: false })
        .hasAmount,
    ).toBe(false);
  });
});
