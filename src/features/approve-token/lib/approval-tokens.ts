import type { TransferToken } from '@/features/transfer-token/lib/transfer-types';

/**
 * Token-universe decisions of 代币授权 that must be provable without a browser.
 *
 * D1: the default token is the first community token. Reading wrapped/LP before
 * the community directory's first load finishes makes the wrapped token (usually
 * balance 0) win the race and stay selected forever, so the fallback is only
 * allowed after that directory has settled.
 *
 * D4: a custom ERC20 address that is already a built-in token (community /
 * wrapped / LP) must not become a second same-name option — the built-in entry
 * is the one that gets selected.
 */

export interface ApprovalTokenCatalog {
  readonly communityTokens: readonly TransferToken[];
  readonly wrappedToken: TransferToken | undefined;
  readonly lpToken: TransferToken | undefined;
  /** Community directory is still reading its first page. */
  readonly communityLoading: boolean;
}

/**
 * First usable token in the declared fallback order 社区代币 → 包装原生币 → LP.
 * Returns `undefined` while the community directory is still loading, which is
 * what tells the page to wait instead of locking in a fallback.
 */
export function pickDefaultApprovalToken(
  catalog: ApprovalTokenCatalog,
): TransferToken | undefined {
  if (catalog.communityLoading) return undefined;
  return catalog.communityTokens[0] ?? catalog.wrappedToken ?? catalog.lpToken;
}

/** Address lookup that ignores case; native tokens (no address) never match. */
export function findTokenByAddress(
  tokens: readonly TransferToken[],
  address: string,
): TransferToken | undefined {
  const needle = address.toLowerCase();
  return tokens.find((token) => token.address?.toLowerCase() === needle);
}
