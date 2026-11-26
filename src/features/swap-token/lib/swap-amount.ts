import { NATIVE_FEE_RESERVE_WEI, parseAmountInput } from '@/shared/lib/amount-input';
import { applySlippageDown, percentToBps } from '@/shared/lib/percent';
import type { SwapPairInfo } from './swap-types';
import { sameAddress } from './swap-types';
import type { HexAddress } from '@/config/networks';

export const DEFAULT_SLIPPAGE_PERCENT = 0.5;
export const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0] as const;
export const MIN_SLIPPAGE_PERCENT = 0.01;
export const MAX_SLIPPAGE_PERCENT = 50;
export const QUOTE_MAX_AGE_SECONDS = 30;
/**
 * Display-only reserve for 全部; the copy always says 约.
 * 值来自 `shared/lib/amount-input`（C2 收口），保留旧名以免动调用方。
 */
export const NATIVE_GAS_RESERVE_WEI = NATIVE_FEE_RESERVE_WEI;

export type ParsedSwapAmount =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'too-precise'; readonly digits: number }
  | { readonly kind: 'ok'; readonly value: bigint };

export function parseSwapAmount(raw: string, decimals: number): ParsedSwapAmount {
  const parsed = parseAmountInput(raw, { decimals, strategy: 'reject-precision' });
  switch (parsed.kind) {
    case 'empty':
      return { kind: 'empty' };
    case 'too-precise':
      return { kind: 'too-precise', digits: parsed.digits };
    case 'zero':
    case 'invalid':
      return { kind: 'invalid' };
    case 'ok':
      return { kind: 'ok', value: parsed.value };
  }
}

export { percentToBps };

export function isSlippagePercentValid(percent: number): boolean {
  return (
    Number.isFinite(percent) && percent >= MIN_SLIPPAGE_PERCENT && percent <= MAX_SLIPPAGE_PERCENT
  );
}

/** quote × (1 − tolerance), floored to wei. */
export function applySlippage(quoteOut: bigint, bps: number): bigint {
  return applySlippageDown(quoteOut, bps);
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
