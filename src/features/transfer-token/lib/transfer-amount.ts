import { parseUnits } from 'viem';
import { NATIVE_FEE_RESERVE_WEI } from './transfer-types';

/**
 * Amount parsing for 代币转账 (pure, no React, no chain).
 *
 * Extra fraction digits are truncated to the token's `decimals()` (the page
 * says "已按精度截断"), never rounded up — 1.5000000000000000009 becomes
 * 1.5 exactly. `0` / `0.000` is `zero`, and a negative sign or anything
 * non-numeric is `invalid`. The parsed wei value is what the transaction carries.
 */
export type ParsedTransferAmount =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid' }
  | {
      readonly kind: 'zero';
      /**
       * True when the input was non-zero but every fraction digit fell below the
       * token precision (e.g. `0.0000000000000000009` at 18 decimals). Callers
       * use it to say "按精度截断后为 0" instead of the generic "必须大于 0".
       */
      readonly truncated?: boolean;
    }
  | { readonly kind: 'ok'; readonly value: bigint; readonly truncated: boolean };

const AMOUNT_RE = /^(?:\d+\.?\d*|\.\d+)$/;

export function parseTransferAmount(raw: string, decimals: number): ParsedTransferAmount {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'empty' };
  // Rejects a leading minus, exponent notation, spaces and full-width digits.
  if (!AMOUNT_RE.test(trimmed)) return { kind: 'invalid' };

  const [whole = '0', fraction = ''] = trimmed.split('.');
  if (!/\d/.test(trimmed)) return { kind: 'invalid' };
  const truncated = fraction.length > decimals;
  const kept = truncated ? fraction.slice(0, decimals) : fraction;

  let value: bigint;
  try {
    value = parseUnits(kept.length > 0 ? `${whole === '' ? '0' : whole}.${kept}` : whole, decimals);
  } catch {
    return { kind: 'invalid' };
  }
  if (value === 0n) return truncated ? { kind: 'zero', truncated: true } : { kind: 'zero' };
  return { kind: 'ok', value, truncated };
}

/**
 * 「全部」 amount in wei. For the native coin the network fee comes out of the
 * same balance, so a fixed display-only reserve is withheld; for tokens the whole
 * balance is transferable. Never returns a negative value.
 */
export function maxTransferAmount(balance: bigint, native: boolean): bigint {
  if (!native) return balance > 0n ? balance : 0n;
  return balance > NATIVE_FEE_RESERVE_WEI ? balance - NATIVE_FEE_RESERVE_WEI : 0n;
}

/**
 * The spendable balance used by the "insufficient" check: tokens use the full
 * balance, the native coin uses balance − reserve (the fee still has to fit).
 */
export function spendableTransferBalance(
  balance: bigint | undefined,
  native: boolean,
): bigint | undefined {
  if (balance === undefined) return undefined;
  return native ? maxTransferAmount(balance, true) : balance;
}
