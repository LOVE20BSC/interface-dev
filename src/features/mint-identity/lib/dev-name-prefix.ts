/**
 * DEV/TEST ONLY — remove this module once the contract is fixed.
 *
 * CI-004 (docs/contract-issues/004-member-nft-test-prefix-mismatch.md):
 * when the payment token's symbol starts with `Test`, `MemberNFT.mint()` prepends
 * `Test` to the name *before* validating and pricing it, but
 * `calculateMintCost()` / `isNameUsed()` / `memberId()` do NOT. So on every
 * dev/test deployment the quoted price and the uniqueness check correspond to a
 * different string than the one actually minted, and the effective maximum name
 * length is MAX_NAME_LENGTH - 4 bytes.
 *
 * The workaround is to mirror that single string rule in one place and pass the
 * prefixed name to those three read-only functions. This module is the only copy
 * of the rule in the interface; delete it (and its two call sites in
 * use-mint-quote.ts) once the contract resolves names through one entry point.
 */
export const DEV_NAME_PREFIX = 'Test';
export const DEV_NAME_PREFIX_BYTES = 4;

export interface ResolvedMintName {
  /** The string the contract will actually validate, price and store. */
  readonly effectiveName: string;
  /** True when the dev/test prefix was added locally. */
  readonly isPrefixed: boolean;
}

/**
 * Mirrors MemberNFT._addTestPrefixIfNeeded byte-for-byte:
 *   symbol starts with `Test` && name does not start with `Test`
 *   → `Test` + name (also for names shorter than 4 bytes).
 * A name that already starts with `Test` is left alone, exactly like the chain.
 */
export function applyDevNamePrefixIfNeeded(
  name: string,
  paymentTokenSymbol: string | undefined,
): ResolvedMintName {
  if (paymentTokenSymbol === undefined || !paymentTokenSymbol.startsWith(DEV_NAME_PREFIX)) {
    return { effectiveName: name, isPrefixed: false };
  }
  if (name.startsWith(DEV_NAME_PREFIX)) {
    return { effectiveName: name, isPrefixed: false };
  }
  return { effectiveName: `${DEV_NAME_PREFIX}${name}`, isPrefixed: true };
}
