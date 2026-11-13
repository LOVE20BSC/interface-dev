import type { HexAddress } from '@/config/networks';
import { formatTokenAmount } from '@/shared/lib/format';

/**
 * Everything the success receipt renders for one completed transfer. Built from
 * the submitted request (token, amount, recipient) at confirmation time; the
 * chain call itself has no return value to read, so the numbers here are the
 * exact wei the transaction carried — not an estimate.
 */
export interface TransferRecord {
  readonly hash: `0x${string}`;
  readonly tokenSymbol: string;
  readonly tokenDecimals: number;
  readonly native: boolean;
  readonly amount: bigint;
  readonly recipient: HexAddress;
  /** Optional context line, e.g. 身份 NFT #2 Testdev-member-1. */
  readonly recipientLabel: string | undefined;
  readonly recordedAt: number;
}

/** `已转出 1.5 TestLOVE20` / `已转出 0.1 ETH` amount part, exact to wei. */
export function transferAmountText(amount: bigint, decimals: number, symbol: string): string {
  return `${formatTokenAmount(amount, decimals)} ${symbol}`;
}
