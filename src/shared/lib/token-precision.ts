/**
 * 精度字样显示规则 (owner 2026-11-14: 「只有18位不显示精度，其他都要显示」).
 *
 * One global rule for every page that renders a token's decimals (转账 / 代币授权
 * / 流动性 / 兑换 / 批量转账): the 18-digit default is noise and must never be
 * written out, while every other precision — 0, 6, 8, 24 … — must be shown.
 *
 * The rule is deliberately "not 18" instead of "≥ 18": a 24-digit token is rarer
 * than the default and therefore needs the label even more than a 6-digit one.
 * `undefined` means the metadata read has not settled (or failed): never invent
 * a precision, so the label stays hidden.
 *
 * Kept in shared so no feature has to import another feature (eslint
 * dependency-direction rule), and so the pages cannot drift apart again.
 */

/** The precision that is treated as the default and therefore never labelled. */
export const DEFAULT_TOKEN_DECIMALS = 18;

/**
 * True when the page should render 「精度 {decimals} 位」.
 *
 * `undefined` → false (metadata unknown); `18` → false (the default); anything
 * else, including `0`, → true.
 */
export function shouldShowPrecision(decimals: number | undefined): boolean {
  return decimals !== undefined && decimals !== DEFAULT_TOKEN_DECIMALS;
}
