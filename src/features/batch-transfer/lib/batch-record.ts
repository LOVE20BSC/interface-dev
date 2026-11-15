import { ZERO_ADDRESS, type HexAddress } from '@/config/networks';
import { cache, type CacheScope } from '@/shared/lib/cache';
import type { BatchMode, BatchRequest, BatchRequestRow } from './batch-types';

export type HexHash = `0x${string}`;
export type BatchPendingKind = 'approve' | 'batch';

/**
 * One 批量转账 attempt persisted before the wallet sheet opens (R1) and kept
 * while the hash waits (R4).
 *
 * 批量转账 has no per-user contract of its own, so the cache scope is the
 * contract-less ZERO_ADDRESS one — `{chainId, wallet}` is the whole namespace.
 * The record also carries `{chainId, account}` *inside* itself: a record read
 * through the wrong scope (or written by an older build) is rejected instead of
 * being signed by whichever wallet is connected now (R3), and `nonce` lets a
 * 「重新提交」 after a refresh replace the original transaction instead of sending a
 * second batch (R2).
 */
export interface StoredBatch {
  /** The hash the wallet returned, or `null` while the attempt has not landed yet. */
  readonly hash: HexHash | null;
  readonly chainId: number;
  readonly account: HexAddress;
  readonly kind: BatchPendingKind;
  readonly request: BatchRequest;
  readonly nonce: number | undefined;
  readonly recordedAt: number;
}

/** Semantic key; the scope already namespaces chain/wallet. */
export const BATCH_TASK_CACHE_KEY = 'batchTransferTask';

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_RE = /^\d+$/;
/** Same ceiling the parser accepts; a bigger list is not a real batch. */
const MAX_ROWS = 500;

export function createBatchScope(chainId: number, wallet: string): CacheScope {
  return { chainId, contractAddress: ZERO_ADDRESS, wallet };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hashOf(value: unknown): HexHash | null {
  return typeof value === 'string' && HASH_RE.test(value) ? (value as HexHash) : null;
}

function addressOf(value: unknown): HexAddress | null {
  return typeof value === 'string' && ADDRESS_RE.test(value) ? (value as HexAddress) : null;
}

function chainIdOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function nonceOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function symbolOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : undefined;
}

function decimalsOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 36
    ? value
    : undefined;
}

function gasLimitOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function decimalOf(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || !DECIMAL_RE.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function rowsOf(value: unknown): readonly BatchRequestRow[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ROWS) return null;
  const rows: BatchRequestRow[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const address = addressOf(entry.address);
    const amount = decimalOf(entry.amount);
    if (address === null || amount === undefined) return null;
    rows.push({ address, amount });
  }
  return rows;
}

function optionalBigints(value: unknown): readonly (bigint | undefined)[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: (bigint | undefined)[] = [];
  for (const entry of value) {
    if (entry === null) {
      result.push(undefined);
      continue;
    }
    const parsed = decimalOf(entry);
    if (parsed === undefined) return undefined;
    result.push(parsed);
  }
  return result;
}

function optionalBooleans(value: unknown): readonly (boolean | undefined)[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: (boolean | undefined)[] = [];
  for (const entry of value) {
    if (entry === null) {
      result.push(undefined);
      continue;
    }
    if (typeof entry !== 'boolean') return undefined;
    result.push(entry);
  }
  return result;
}

function requestOf(value: unknown): BatchRequest | null {
  if (!isRecord(value)) return null;
  const mode: BatchMode | undefined =
    value.mode === 'native' ? 'native' : value.mode === 'token' ? 'token' : undefined;
  if (mode === undefined) return null;
  const tokenSymbol = symbolOf(value.tokenSymbol);
  const tokenDecimals = decimalsOf(value.tokenDecimals);
  const rows = rowsOf(value.rows);
  const total = decimalOf(value.total);
  const gasLimit = gasLimitOf(value.gasLimit);
  if (tokenSymbol === undefined || tokenDecimals === undefined) return null;
  if (rows === null || total === undefined || gasLimit === undefined) return null;
  const tokenAddress = mode === 'token' ? addressOf(value.tokenAddress) : null;
  if (mode === 'token' && tokenAddress === null) return null;
  return {
    mode,
    tokenAddress: tokenAddress ?? undefined,
    tokenSymbol,
    tokenDecimals,
    rows,
    total,
    gasLimit,
    preBalances: optionalBigints(value.preBalances) ?? [],
    recipientHasCode: optionalBooleans(value.recipientHasCode) ?? [],
  };
}

/**
 * Validating read: a malformed entry is treated as absent, so a bad record can
 * never rebuild a submittable batch. The owner inside the record is returned
 * as-is; the hook compares it with the connected wallet before restoring or
 * signing anything (R3) so the mismatch surfaces as neutral copy.
 */
export function readStoredBatch(scope: CacheScope): StoredBatch | null {
  const raw: unknown = cache.get<unknown>(scope, BATCH_TASK_CACHE_KEY);
  if (!isRecord(raw)) return null;
  const chainId = chainIdOf(raw.chainId);
  const account = addressOf(raw.account);
  const kind: BatchPendingKind | undefined =
    raw.kind === 'approve' ? 'approve' : raw.kind === 'batch' ? 'batch' : undefined;
  const request = requestOf(raw.request);
  const recordedAt = raw.recordedAt;
  if (chainId === undefined || account === null) return null;
  if (kind === undefined || request === null) return null;
  if (typeof recordedAt !== 'number' || !Number.isFinite(recordedAt)) return null;
  // `hash` is optional (an attempt that never reached the wallet has none), but a
  // present-yet-invalid hash must reject the record instead of being read as
  // 「还没有 hash」 and re-signed.
  const hash = raw.hash === undefined || raw.hash === null ? null : hashOf(raw.hash);
  if (raw.hash !== undefined && raw.hash !== null && hash === null) return null;
  return {
    hash,
    chainId,
    account,
    kind,
    request,
    nonce: nonceOf(raw.nonce),
    recordedAt,
  };
}

function serializeRequest(request: BatchRequest): Record<string, unknown> {
  return {
    mode: request.mode,
    ...(request.tokenAddress !== undefined ? { tokenAddress: request.tokenAddress } : {}),
    tokenSymbol: request.tokenSymbol,
    tokenDecimals: request.tokenDecimals,
    rows: request.rows.map((row) => ({ address: row.address, amount: row.amount.toString() })),
    total: request.total.toString(),
    gasLimit: request.gasLimit,
    preBalances: request.preBalances.map((value) => (value === undefined ? null : value.toString())),
    recipientHasCode: request.recipientHasCode.map((value) =>
      value === undefined ? null : value,
    ),
  };
}

/** Persist before the wallet opens (attempt without a hash) and again with the hash. */
export function writeStoredBatch(scope: CacheScope, stored: StoredBatch): void {
  cache.set(scope, BATCH_TASK_CACHE_KEY, {
    ...(stored.hash !== null ? { hash: stored.hash } : {}),
    chainId: stored.chainId,
    account: stored.account,
    kind: stored.kind,
    request: serializeRequest(stored.request),
    ...(stored.nonce !== undefined ? { nonce: stored.nonce } : {}),
    recordedAt: stored.recordedAt,
  });
}

export function clearStoredBatch(scope: CacheScope): void {
  cache.remove(scope, BATCH_TASK_CACHE_KEY);
}
