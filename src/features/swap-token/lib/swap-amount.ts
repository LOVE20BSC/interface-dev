import { parseUnits } from 'viem';
import { formatAmount, UNKNOWN } from '@/shared/lib/format';
import type { SwapPairInfo } from './swap-types';
import { sameAddress } from './swap-types';
import type { HexAddress } from '@/config/networks';

export const DEFAULT_SLIPPAGE_PERCENT = 0.5;
export const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0] as const;
export const MIN_SLIPPAGE_PERCENT = 0.01;
export const MAX_SLIPPAGE_PERCENT = 50;
export const QUOTE_MAX_AGE_SECONDS = 30;
/** Display-only reserve for 全部; the copy always says 约. */
export const NATIVE_GAS_RESERVE_WEI = 10n ** 15n;

export type ParsedSwapAmount =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'too-precise'; readonly digits: number }
  | { readonly kind: 'ok'; readonly value: bigint };

const AMOUNT_RE = /^(?:\d+\.?\d*|\.\d+)$/;

export function parseSwapAmount(raw: string, decimals: number): ParsedSwapAmount {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'empty' };
  if (!AMOUNT_RE.test(trimmed)) return { kind: 'invalid' };

  const [whole = '0', fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) return { kind: 'too-precise', digits: decimals };
  const normalized = fraction.length > 0 ? `${whole === '' ? '0' : whole}.${fraction}` : whole;
  try {
    return { kind: 'ok', value: parseUnits(normalized, decimals) };
  } catch {
    return { kind: 'invalid' };
  }
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export function isSlippagePercentValid(percent: number): boolean {
  return (
    Number.isFinite(percent) && percent >= MIN_SLIPPAGE_PERCENT && percent <= MAX_SLIPPAGE_PERCENT
  );
}

/** quote × (1 − tolerance), floored to wei. */
export function applySlippage(quoteOut: bigint, bps: number): bigint {
  if (bps <= 0) return quoteOut;
  const bounded = Math.min(bps, 9999);
  return (quoteOut * BigInt(10_000 - bounded)) / 10_000n;
}

/** Percentage with up to two decimals, e.g. 123 bps → 1.23. */
export function formatBpsPercent(bps: number): string {
  return formatAmount(BigInt(Math.max(0, Math.round(bps))), 2, 2);
}

/**
 * 1 FROM ≈ rate TO, derived from the amount quote so no extra chain read is
 * needed. Rates below 1e-12 render as 0; the UI still labels the value 预计.
 */
export function formatRate(
  quoteOut: bigint,
  amountIn: bigint,
  fromDecimals: number,
  toDecimals: number,
): string {
  if (amountIn <= 0n || fromDecimals < 0 || toDecimals < 0) return UNKNOWN;
  const precision = 12;
  const numerator = quoteOut * 10n ** BigInt(fromDecimals) * 10n ** BigInt(precision);
  const denominator = amountIn * 10n ** BigInt(toDecimals);
  if (denominator === 0n) return UNKNOWN;
  const scaled = numerator / denominator;
  const integerDigits = (scaled / 10n ** BigInt(precision)).toString().length;
  const maxFraction = Math.min(precision, Math.max(2, 8 - integerDigits));
  return formatAmount(scaled, precision, maxFraction);
}

function reserveFor(
  pair: SwapPairInfo,
  token: HexAddress,
): { readonly reserveIn: bigint; readonly reserveOut: bigint } | null {
  if (sameAddress(pair.token0, token)) {
    return { reserveIn: pair.reserve0, reserveOut: pair.reserve1 };
  }
  if (sameAddress(pair.token1, token)) {
    return { reserveIn: pair.reserve1, reserveOut: pair.reserve0 };
  }
  return null;
}

/**
 * Marginal reserve price vs the executed average from getAmountsOut. The quote
 * already includes the pair fee, so the label is always 约 and only appears
 * above 1% (UX spec §3.5); the raw fee is never hardcoded here.
 */
export function priceImpactBps(
  amountIn: bigint,
  quoteOut: bigint,
  path: readonly HexAddress[],
  pairs: readonly SwapPairInfo[],
): number | undefined {
  if (amountIn <= 0n || quoteOut <= 0n || pairs.length !== path.length - 1) return undefined;

  let ideal = amountIn;
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    const tokenIn = path[index];
    if (pair === undefined || tokenIn === undefined) return undefined;
    const reserves = reserveFor(pair, tokenIn);
    if (reserves === null || reserves.reserveIn === 0n || reserves.reserveOut === 0n) {
      return undefined;
    }
    ideal = (ideal * reserves.reserveOut) / reserves.reserveIn;
    if (ideal === 0n) return undefined;
  }

  if (quoteOut >= ideal) return 0;
  return Number(((ideal - quoteOut) * 10_000n + ideal / 2n) / ideal);
}

/** Human-facing amount for quotes, minimums and receipts. */
export function formatTokenAmount(value: bigint | undefined, decimals: number | undefined): string {
  if (value === undefined || decimals === undefined) return UNKNOWN;
  return formatAmount(value, decimals, 6);
}
