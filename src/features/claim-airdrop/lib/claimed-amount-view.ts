import { copy } from '@/shared/config/copy-pages';
import { formatTokenAmount } from '@/shared/lib/format';

/**
 * S6 (已铸造) presentation for the airdrop claim page, pure and chain-free.
 *
 * The amount is injected so the "no amount available" branch can be tested
 * without a chain (CI-014 view not yet deployed). The panel only feeds it
 * `readClaimedAmount()`'s result — no other module may invent a number.
 */
export interface ClaimedAmountViewInput {
  readonly amount: bigint | undefined;
  readonly decimals: number | undefined;
  readonly symbol: string | undefined;
  /** `NETWORK.blockExplorerUrl !== null`: tells the user where the amount can be checked. */
  readonly explorerAvailable: boolean;
}

export interface ClaimedAmountView {
  readonly hasAmount: boolean;
  readonly title: string;
  readonly body: string;
}

export function claimedAmountView(input: ClaimedAmountViewInput): ClaimedAmountView {
  const { amount, decimals, symbol, explorerAvailable } = input;
  if (amount !== undefined && decimals !== undefined && symbol !== undefined) {
    return {
      hasAmount: true,
      title: copy.airdrop.claimed.amountLine(formatTokenAmount(amount, decimals), symbol),
      body: copy.airdrop.claimed.amountNote,
    };
  }
  return {
    hasAmount: false,
    title: copy.airdrop.claimed.title,
    body: explorerAvailable
      ? copy.airdrop.claimed.unknownBodyExplorer
      : copy.airdrop.claimed.unknownBody,
  };
}
