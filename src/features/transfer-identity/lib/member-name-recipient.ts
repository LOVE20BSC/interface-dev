import { BaseError, ContractFunctionRevertedError } from 'viem';
import type { HexAddress } from '@/config/networks';
import { isSameAddress } from '@/shared/lib/format';

/** Chain ids read per Multicall3 batch; the deployed Multicall3 accepts 100+ calls. */
export const NAME_SCAN_CHUNK = 100;

/**
 * Owner rule (2026-11-12): a name scan is bounded so a huge collection can never
 * turn the transfer drawer into a spinner. Beyond this the UI asks for an id or
 * an address instead of guessing.
 */
export const NAME_SCAN_CAP = 1000;

/**
 * The contract has `memberName(tokenId)` but no `normalizedName(tokenId)` in its
 * ABI; `normalizeName(name)` is a pure ASCII lowercasing (`_toLowerCase`). This
 * mirrors that rule byte-for-byte so `memberName()` results can be compared in
 * the browser without one extra eth_call per id.
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
  | { readonly status: 'capped' }
  | { readonly status: 'error' };

/** The only chain reads the resolver needs; injected so the scan is unit-testable. */
export interface MemberNameReader {
  readonly totalSupply: () => Promise<bigint>;
  /** Contract `normalizeName(input)`, the authoritative form of the typed name. */
  readonly normalizeName: (name: string) => Promise<string>;
  /** `memberName(id)` for every id, in order; null when a single read failed. */
  readonly memberNames: (ids: readonly bigint[]) => Promise<readonly (string | null)[]>;
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
 * Resolve an identity name to its id and current owner by enumerating
 * 1..totalSupply in ≤100-id Multicall3 chunks and comparing the contract's
 * normalised form. Stops at the first match. Never polls.
 *
 * - not-found: the scan finished inside the cap with no match.
 * - capped: totalSupply > 1000 and no match inside the first 1000 ids; the UI
 *   asks for an id/address rather than silently continuing.
 * - error: any read failed (transient); the caller offers retry.
 */
export async function resolveMemberNameByName(
  input: string,
  self: string | undefined,
  reader: MemberNameReader,
  cache?: MemberNameCache,
): Promise<MemberNameResolution> {
  const trimmed = input.trim();
  if (trimmed === '') return { status: 'not-found' };

  let normalizedInput: string;
  try {
    normalizedInput = (await reader.normalizeName(trimmed)).trim();
  } catch {
    return { status: 'error' };
  }
  if (normalizedInput === '') return { status: 'not-found' };

  const cached = cache?.get(normalizedInput);
  if (cached !== undefined) {
    return resolveOwner(cached.memberId, cached.name, self, reader);
  }

  let total: bigint;
  try {
    total = await reader.totalSupply();
  } catch {
    return { status: 'error' };
  }

  const cap = BigInt(NAME_SCAN_CAP);
  const scanLimit = total < cap ? total : cap;
  const chunk = BigInt(NAME_SCAN_CHUNK);

  for (let first = 1n; first <= scanLimit; first += chunk) {
    const last = first + chunk - 1n < scanLimit ? first + chunk - 1n : scanLimit;
    const ids: bigint[] = [];
    for (let id = first; id <= last; id += 1n) ids.push(id);

    let names: readonly (string | null)[];
    try {
      names = await reader.memberNames(ids);
    } catch {
      return { status: 'error' };
    }

    for (let index = 0; index < ids.length; index += 1) {
      const rawName = names[index];
      const memberId = ids[index];
      if (rawName === undefined || rawName === null || rawName === '' || memberId === undefined) {
        continue;
      }
      if (normalizeMemberName(rawName) !== normalizedInput) continue;
      cache?.set(normalizedInput, { memberId, name: rawName });
      return resolveOwner(memberId, rawName, self, reader);
    }
  }

  return total > cap ? { status: 'capped' } : { status: 'not-found' };
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
    return { status: classifyOwnerReadError(error) };
  }
  if (self !== undefined && isSameAddress(owner, self)) {
    return { status: 'self', memberId, name };
  }
  return { status: 'ok', memberId, name, address: owner as HexAddress };
}

function classifyOwnerReadError(error: unknown): 'not-found' | 'error' {
  if (error instanceof BaseError) {
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted !== null) return 'not-found';
  }
  return 'error';
}
