import { cache, type CacheScope } from '@/shared/lib/cache';

export type HexHash = `0x${string}`;

/**
 * One claim receipt, as rendered by the page.
 *
 * `amount` is the value parsed from AirdropClaimed.amount, never the estimate
 * that was displayed before submitting. A local record without an amount is
 * still useful: it lets a refresh resume the pending transaction instead of
 * showing a fresh CTA.
 */
export interface AirdropClaimReceipt {
  readonly hash: HexHash;
  readonly amount: bigint | undefined;
  readonly share: bigint | undefined;
  /** Snapshot total at claim time, so percentages survive a refresh without a re-read. */
  readonly totalShare: bigint | undefined;
  readonly remainingShare: bigint | undefined;
  readonly tokenSymbol: string | undefined;
  readonly tokenDecimals: number | undefined;
  /** Local confirmation time (ms since epoch); not a chain timestamp. */
  readonly recordedAt: number | undefined;
}

/** Semantic cache key; the scope already namespaces chain/contract/wallet. */
export const AIRDROP_CLAIM_CACHE_KEY = 'airdropClaim';

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL_RE = /^\d+$/;

interface StoredAirdropClaim {
  readonly hash?: unknown;
  readonly amount?: unknown;
  readonly share?: unknown;
  readonly totalShare?: unknown;
  readonly remainingShare?: unknown;
  readonly tokenSymbol?: unknown;
  readonly tokenDecimals?: unknown;
  readonly recordedAt?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hashOf(value: unknown): HexHash | null {
  return typeof value === 'string' && HASH_RE.test(value) ? (value as HexHash) : null;
}

function decimalOf(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || !DECIMAL_RE.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function symbolOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : undefined;
}

function decimalsOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 36
    ? value
    : undefined;
}

function timestampOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function createAirdropClaimScope(
  chainId: number,
  contractAddress: string,
  wallet: string,
): CacheScope {
  return { chainId, contractAddress, wallet };
}

/**
 * Reads the local claim record. A malformed hash invalidates the record (the
 * page falls back to the on-chain isClaimed read); a missing amount keeps the
 * hash so a pending transaction can be recovered.
 */
export function readAirdropClaimRecord(scope: CacheScope): AirdropClaimReceipt | null {
  const raw: unknown = cache.get<unknown>(scope, AIRDROP_CLAIM_CACHE_KEY);
  if (!isRecord(raw)) return null;
  const record = raw as StoredAirdropClaim;
  const hash = hashOf(record.hash);
  if (hash === null) return null;
  return {
    hash,
    amount: decimalOf(record.amount),
    share: decimalOf(record.share),
    totalShare: decimalOf(record.totalShare),
    remainingShare: decimalOf(record.remainingShare),
    tokenSymbol: symbolOf(record.tokenSymbol),
    tokenDecimals: decimalsOf(record.tokenDecimals),
    recordedAt: timestampOf(record.recordedAt),
  };
}

/** Persists the hash as soon as the wallet returns it, before it is mined. */
export function writeAirdropClaimPending(scope: CacheScope, hash: HexHash): void {
  cache.set(scope, AIRDROP_CLAIM_CACHE_KEY, { hash });
}

/** Persists the confirmed receipt so a refresh keeps showing 已铸造 + the amount. */
export function writeAirdropClaimReceipt(scope: CacheScope, receipt: AirdropClaimReceipt): void {
  cache.set(scope, AIRDROP_CLAIM_CACHE_KEY, {
    hash: receipt.hash,
    ...(receipt.amount !== undefined ? { amount: receipt.amount.toString() } : {}),
    ...(receipt.share !== undefined ? { share: receipt.share.toString() } : {}),
    ...(receipt.totalShare !== undefined ? { totalShare: receipt.totalShare.toString() } : {}),
    ...(receipt.remainingShare !== undefined
      ? { remainingShare: receipt.remainingShare.toString() }
      : {}),
    ...(receipt.tokenSymbol !== undefined ? { tokenSymbol: receipt.tokenSymbol } : {}),
    ...(receipt.tokenDecimals !== undefined ? { tokenDecimals: receipt.tokenDecimals } : {}),
    ...(receipt.recordedAt !== undefined ? { recordedAt: receipt.recordedAt } : {}),
  });
}

export function clearAirdropClaimRecord(scope: CacheScope): void {
  cache.remove(scope, AIRDROP_CLAIM_CACHE_KEY);
}
