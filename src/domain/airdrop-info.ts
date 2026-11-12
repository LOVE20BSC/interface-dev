/**
 * The per-token AirdropDistributor state, decoded from one `airdropInfo(token)` read.
 *
 * `core@0cdbe44` collapsed six per-token getters into a single struct view.
 * Every consumer now derives its view from this one document:
 *   - `merkleRoot`      → snapshot-root validation;
 *   - `claimableFromRound` → the S5-G round gate;
 *   - `snapshotUri`     → which snapshot document to load (CI-017);
 *   - `totalClaimedShare` / `totalRemainingShare` → share accounting;
 *   - `totalClaimedAmount` / `remainingAmount` → pool/claimed display.
 *
 * Pure TypeScript: it normalises a decoded ABI tuple defensively and knows no
 * chain client. A malformed document returns null; callers turn that into the
 * neutral read-error state instead of showing invented numbers.
 */

export interface AirdropInfo {
  readonly tokenAddress: `0x${string}`;
  readonly merkleRoot: `0x${string}`;
  readonly claimableFromRound: bigint;
  readonly totalClaimedShare: bigint;
  readonly totalRemainingShare: bigint;
  readonly totalClaimedAmount: bigint;
  readonly remainingAmount: bigint;
  /** Empty for the genesis token by design (CI-017); http(s) for launched tokens. */
  readonly snapshotUri: string;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX32_RE = /^0x[0-9a-fA-F]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function address(value: unknown): `0x${string}` | null {
  return typeof value === 'string' && ADDRESS_RE.test(value) ? (value as `0x${string}`) : null;
}

function hex32(value: unknown): `0x${string}` | null {
  return typeof value === 'string' && HEX32_RE.test(value) ? (value as `0x${string}`) : null;
}

function uint(value: unknown): bigint | null {
  return typeof value === 'bigint' && value >= 0n ? value : null;
}

/**
 * Normalises a decoded `AirdropInfo` tuple. Returns null when any field is
 * missing or has the wrong type, so a wiring mistake surfaces as "read error"
 * rather than as a zero amount or an empty root.
 */
export function toAirdropInfo(raw: unknown): AirdropInfo | null {
  if (!isRecord(raw)) return null;
  const tokenAddress = address(raw.tokenAddress);
  const merkleRoot = hex32(raw.merkleRoot);
  const claimableFromRound = uint(raw.claimableFromRound);
  const totalClaimedShare = uint(raw.totalClaimedShare);
  const totalRemainingShare = uint(raw.totalRemainingShare);
  const totalClaimedAmount = uint(raw.totalClaimedAmount);
  const remainingAmount = uint(raw.remainingAmount);
  const snapshotUri = raw.snapshotUri;
  if (
    tokenAddress === null ||
    merkleRoot === null ||
    claimableFromRound === null ||
    totalClaimedShare === null ||
    totalRemainingShare === null ||
    totalClaimedAmount === null ||
    remainingAmount === null ||
    typeof snapshotUri !== 'string'
  ) {
    return null;
  }
  return {
    tokenAddress,
    merkleRoot,
    claimableFromRound,
    totalClaimedShare,
    totalRemainingShare,
    totalClaimedAmount,
    remainingAmount,
    snapshotUri,
  };
}

/** True when the distributor has no root for this token (never configured). */
export function isAirdropConfigured(info: AirdropInfo | null): info is AirdropInfo {
  return info !== null && info.merkleRoot !== `0x${'0'.repeat(64)}`;
}
