import { UNKNOWN, formatAmount, formatPhase, formatTokenAmount } from '@/shared/lib/format';

/**
 * Data-tab formatting for the 关于 page. Every helper keeps the app-wide rule:
 * a value that has not loaded is `—`, never `0` (ADR-0003 §4). The page adds
 * the 未配置 state before calling these; these helpers only handle loaded data.
 */

/** Integer supply (MemberNFT.totalSupply) with grouping, no fraction digits. */
export function formatIntegerSupply(value: bigint): string {
  return formatAmount(value, 0, 0);
}

/** `100,000,000 TestLOVE20`; a missing symbol still shows the amount. */
export function formatSupplyWithSymbol(
  value: bigint,
  decimals: number,
  symbol: string | undefined,
): string {
  const amount = formatAmount(value, decimals, 0);
  return symbol !== undefined && symbol.length > 0 ? `${amount} ${symbol}` : amount;
}

/** Pool/community balance with the shared six-digit token rule. */
export function formatPoolBalance(
  value: bigint,
  decimals: number,
  symbol: string | undefined,
): string {
  const amount = formatTokenAmount(value, decimals);
  return symbol !== undefined && symbol.length > 0 ? `${amount} ${symbol}` : amount;
}

/** Deployment block: an integer from the environment package, or `—` when unknown. */
export function formatDeploymentBlock(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN;
  return formatPhase(BigInt(Math.trunc(value)));
}

/** RPC endpoints are shown one per line; an empty deployment is not reachable. */
export function formatRpcUrls(urls: readonly string[]): string {
  const usable = urls.filter((url) => url.length > 0);
  return usable.length > 0 ? usable.join('\n') : UNKNOWN;
}

/** Phase is a bigint counter; unknown stays `—`. */
export function formatPhaseValue(value: bigint | undefined): string {
  return value === undefined ? UNKNOWN : formatPhase(value);
}
