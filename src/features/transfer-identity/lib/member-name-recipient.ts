import { BaseError, ContractFunctionRevertedError } from 'viem';
import type { HexAddress } from '@/config/networks';
import { isSameAddress } from '@/shared/lib/format';

/**
 * Cache-key mirror of the contract's `_toLowerCase` (ASCII A–Z only). The
 * contract's `memberId(name)` normalises its own input, so this is never sent
 * on-chain: it only lets `Testdev-Member-1` and `testdev-member-1` share one
 * session-cache entry instead of two `memberId` reads.
 */
export function normalizeMemberName(value: string): string {
  return value.replace(/[A-Z]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 32));
}

export type MemberNameResolution =
  | {
      readonly status: 'ok';
      readonly memberId: bigint;
      readonly name: string;
      readonly address: HexAddress;
    }
  | { readonly status: 'self'; readonly memberId: bigint; readonly name: string }
  | { readonly status: 'not-found' }
  | { readonly status: 'error' };

/** The only chain reads the resolver needs; injected so the lookup is unit-testable. */
export interface MemberNameReader {
  /** Contract `memberId(rawName)`: O(1), returns 0 for an unused name. */
  readonly memberId: (rawName: string) => Promise<bigint>;
  /** Canonical on-chain name for the id, shown in the confirmation gate. */
  readonly memberName: (memberId: bigint) => Promise<string>;
  readonly ownerOf: (memberId: bigint) => Promise<string>;
}

/** Session-scoped name → id cache. Ownership is always read fresh. */
export interface MemberNameCache {
  readonly get: (
    normalizedName: string,
  ) => { readonly memberId: bigint; readonly name: string } | undefined;
  readonly set: (
    normalizedName: string,
    value: { readonly memberId: bigint; readonly name: string },
  ) => void;
}

export function createMemberNameCache(): MemberNameCache {
  const entries = new Map<string, { readonly memberId: bigint; readonly name: string }>();
  return {
    get: (normalizedName) => entries.get(normalizedName),
    set: (normalizedName, value) => {
      entries.set(normalizedName, value);
    },
  };
}

/**
 * Resolve an identity name to its id and current owner with the contract's
 * O(1) `memberId(rawName)` getter. The contract lowercases the input itself,
 * so the typed name is passed through unchanged apart from trimming.
 *
 * - not-found: `memberId` returned 0, or the call reverted (unknown name /
 *   older deployment without the getter).
 * - error: any other read failed (transient); the caller offers retry.
 */
export async function resolveMemberNameByName(
  input: string,
  self: string | undefined,
  reader: MemberNameReader,
  cache?: MemberNameCache,
): Promise<MemberNameResolution> {
  const trimmed = input.trim();
  if (trimmed === '') return { status: 'not-found' };

  const cacheKey = normalizeMemberName(trimmed);
  const cached = cache?.get(cacheKey);
  if (cached !== undefined) {
    return resolveOwner(cached.memberId, cached.name, self, reader);
  }

  let memberId: bigint;
  try {
    memberId = await reader.memberId(trimmed);
  } catch (error) {
    return { status: classifyReadError(error) };
  }
  if (memberId === 0n) return { status: 'not-found' };

  let name: string;
  try {
    name = await reader.memberName(memberId);
  } catch (error) {
    return { status: classifyReadError(error) };
  }
  const canonicalName = name === '' ? trimmed : name;
  cache?.set(cacheKey, { memberId, name: canonicalName });
  return resolveOwner(memberId, canonicalName, self, reader);
}

async function resolveOwner(
  memberId: bigint,
  name: string,
  self: string | undefined,
  reader: MemberNameReader,
): Promise<MemberNameResolution> {
  let owner: string;
  try {
    owner = await reader.ownerOf(memberId);
  } catch (error) {
    // A vanished token is not the same as a transient RPC failure, but for a
    // name that just matched an existing id both mean "cannot safely send".
    return { status: classifyReadError(error) };
  }
  if (self !== undefined && isSameAddress(owner, self)) {
    return { status: 'self', memberId, name };
  }
  return { status: 'ok', memberId, name, address: owner as HexAddress };
}

function classifyReadError(error: unknown): 'not-found' | 'error' {
  if (error instanceof BaseError) {
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted !== null) return 'not-found';
  }
  return 'error';
}
