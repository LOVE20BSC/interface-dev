/**
 * Airdrop merkle snapshot: shape validation and the O(1) address index.
 *
 * The JSON is data from a static same-origin file, so it is parsed defensively:
 * a malformed or partially-written snapshot must disable eligibility, never
 * throw on first paint. Pure TypeScript — no fetch, no chain SDKs.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX32_RE = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL_RE = /^\d+$/;

export interface AirdropSnapshotEntry {
  readonly account: `0x${string}`;
  readonly share: bigint;
  readonly proof: readonly `0x${string}`[];
}

export interface AirdropSnapshot {
  readonly merkleRoot: `0x${string}`;
  readonly sourceChainId: number;
  readonly sourceBlockNumber: number;
  readonly totalShare: bigint;
  readonly entries: readonly AirdropSnapshotEntry[];
  /** Lowercase account → entry. O(1) lookup; built once when the file loads. */
  readonly byAccount: ReadonlyMap<string, AirdropSnapshotEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decimal(value: unknown): bigint | null {
  if (typeof value !== 'string' || !DECIMAL_RE.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function hex32(value: unknown): `0x${string}` | null {
  return typeof value === 'string' && HEX32_RE.test(value) ? (value as `0x${string}`) : null;
}

function parseEntry(value: unknown): AirdropSnapshotEntry | null {
  if (!isRecord(value)) return null;
  const account = value.account;
  const share = decimal(value.share);
  const proof = value.proof;
  if (typeof account !== 'string' || !ADDRESS_RE.test(account)) return null;
  if (share === null || share === 0n || !Array.isArray(proof)) return null;
  const parsedProof: `0x${string}`[] = [];
  for (const node of proof) {
    const hash = hex32(node);
    if (hash === null) return null;
    parsedProof.push(hash);
  }
  return { account: account as `0x${string}`, share, proof: parsedProof };
}

/** Returns null when the document cannot be trusted; callers fall back to a neutral state. */
export function parseAirdropSnapshot(raw: unknown): AirdropSnapshot | null {
  if (!isRecord(raw)) return null;
  const merkleRoot = hex32(raw.merkleRoot);
  const totalShare = decimal(raw.totalShare);
  const sourceChainId = decimal(raw.sourceChainId);
  const sourceBlockNumber = decimal(raw.sourceBlockNumber);
  if (merkleRoot === null || totalShare === null) return null;
  if (sourceChainId === null || sourceBlockNumber === null) return null;
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) return null;

  const entries: AirdropSnapshotEntry[] = [];
  const byAccount = new Map<string, AirdropSnapshotEntry>();
  for (const item of raw.entries) {
    const entry = parseEntry(item);
    if (entry === null) return null;
    const key = entry.account.toLowerCase();
    if (byAccount.has(key)) return null;
    byAccount.set(key, entry);
    entries.push(entry);
  }

  return {
    merkleRoot,
    sourceChainId: Number(sourceChainId),
    sourceBlockNumber: Number(sourceBlockNumber),
    totalShare,
    entries,
    byAccount,
  };
}

export function findSnapshotEntry(
  snapshot: AirdropSnapshot,
  account: string | null | undefined,
): AirdropSnapshotEntry | null {
  if (account == null || account.length === 0) return null;
  return snapshot.byAccount.get(account.toLowerCase()) ?? null;
}

export interface ChainSnapshotBinding {
  readonly chainId: number;
  readonly merkleRoot: string;
}

/**
 * The document root must equal the root registered for this token on chain
 * (`merkleRootByTokenAddress`). This is the one check that makes a bundled or
 * remotely fetched JSON trustworthy: the contract verifies every proof against
 * that same root, so a mismatch can only mean the wrong file.
 */
export function snapshotRootMatches(
  snapshot: AirdropSnapshot,
  merkleRoot: string | null | undefined,
): boolean {
  if (merkleRoot === null || merkleRoot === undefined) return false;
  return snapshot.merkleRoot.toLowerCase() === merkleRoot.toLowerCase();
}

/**
 * The snapshot is only trusted when it was produced for this chain and its root
 * equals the root baked into the deployed AirdropDistributor.
 */
export function snapshotMatchesChain(
  snapshot: AirdropSnapshot,
  binding: ChainSnapshotBinding,
): boolean {
  if (snapshot.sourceChainId !== binding.chainId) return false;
  return snapshotRootMatches(snapshot, binding.merkleRoot);
}

export type AirdropSnapshotSource =
  | { readonly kind: 'bundle'; readonly path: string }
  | { readonly kind: 'uri'; readonly url: string }
  | { readonly kind: 'none' };

export interface AirdropSnapshotSourceInput {
  /** `snapshotUriByTokenAddress(token)`; empty for the genesis token by design (CI-017). */
  readonly snapshotUri: string | null | undefined;
  /** Build-time bundled genesis snapshot path, or null in variants that ship none. */
  readonly bundledPath: string | null;
  readonly isGenesis: boolean;
}

/**
 * Which document to load for a token (spec §3.4):
 *   - a non-empty on-chain URI wins (future Launch tokens);
 *   - the genesis token has no URI by design, so it uses the bundled JSON;
 *   - an empty URI for any other token means "no snapshot source" (not a number).
 * A non-http(s) URI is rejected rather than fed to fetch.
 */
export function selectAirdropSnapshotSource(
  input: AirdropSnapshotSourceInput,
): AirdropSnapshotSource {
  const uri = typeof input.snapshotUri === 'string' ? input.snapshotUri.trim() : '';
  if (uri.length > 0) {
    try {
      const parsed = new URL(uri);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return { kind: 'uri', url: parsed.toString() };
      }
    } catch {
      // fall through to none
    }
    return { kind: 'none' };
  }
  if (input.isGenesis && input.bundledPath !== null) {
    return { kind: 'bundle', path: input.bundledPath };
  }
  return { kind: 'none' };
}

export function isAirdropEligible(input: {
  readonly hasEntry: boolean;
  readonly claimed: boolean;
  readonly claimableAmount: bigint;
}): boolean {
  return input.hasEntry && !input.claimed && input.claimableAmount > 0n;
}
