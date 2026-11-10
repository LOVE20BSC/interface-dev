/**
 * Identity ordering is a pure product rule, not a chain fact:
 * current identity first, then the rest by memberId ascending (UX spec §3.2).
 */

export interface OrderableIdentity {
  readonly tokenId: bigint;
}

export function orderIdentities<T extends OrderableIdentity>(
  identities: readonly T[],
  currentTokenId: bigint | null,
): readonly T[] {
  return [...identities].sort((left, right) => {
    if (currentTokenId !== null) {
      const leftIsCurrent = left.tokenId === currentTokenId;
      const rightIsCurrent = right.tokenId === currentTokenId;
      if (leftIsCurrent && !rightIsCurrent) return -1;
      if (rightIsCurrent && !leftIsCurrent) return 1;
    }
    if (left.tokenId < right.tokenId) return -1;
    if (left.tokenId > right.tokenId) return 1;
    return 0;
  });
}
