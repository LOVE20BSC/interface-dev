import { cache, type CacheScope } from './cache';

export type WriteHash = `0x${string}`;

/** The one envelope every persisted write attempt uses. `hash` is mandatory (T004). */
export interface WriteRecord<Payload> {
  readonly hash: WriteHash;
  readonly chainId: number;
  readonly account: `0x${string}`;
  readonly nonce: number | undefined;
  readonly recordedAt: number;
  readonly payload: Payload;
}

/** Flow-owned payload codec; key/scope stay with the feature record module. */
export interface WriteRecordAdapter<Payload> {
  readonly key: string;
  encodePayload(payload: Payload): unknown;
  decodePayload(raw: unknown): Payload | null;
}

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_RE = /^\d+$/;
const MAX_DEPTH = 4;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hashOf(value: unknown): WriteHash | null {
  return typeof value === 'string' && HASH_RE.test(value) ? (value as WriteHash) : null;
}

export function addressOf(value: unknown): `0x${string}` | null {
  return typeof value === 'string' && ADDRESS_RE.test(value) ? (value as `0x${string}`) : null;
}

export function chainIdOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function nonceOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function timestampOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function labelOf(value: unknown, max = 256): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined;
}

/** JSON-safe tagged bigints; used by payload codecs that store calls/amounts. */
export function serializeDeep(value: unknown): unknown {
  if (typeof value === 'bigint') return { __bigint: value.toString() };
  if (Array.isArray(value)) return value.map((entry) => serializeDeep(entry));
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) result[key] = serializeDeep(entry);
    return result;
  }
  return value;
}

export type DeepValue = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

/** Inverse of serializeDeep; rejects over-long / over-deep / malformed payloads. */
export function deserializeDeep(value: unknown, depth = 0): DeepValue {
  if (depth > MAX_DEPTH) return { ok: false };
  if (typeof value === 'string') return value.length <= 512 ? { ok: true, value } : { ok: false };
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  }
  if (typeof value === 'boolean' || value === null) return { ok: true, value };
  if (Array.isArray(value)) {
    if (value.length > 64) return { ok: false };
    const out: unknown[] = [];
    for (const entry of value) {
      const parsed = deserializeDeep(entry, depth + 1);
      if (!parsed.ok) return { ok: false };
      out.push(parsed.value);
    }
    return { ok: true, value: out };
  }
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '__bigint') {
      const raw = value.__bigint;
      if (typeof raw !== 'string' || !DECIMAL_RE.test(raw)) return { ok: false };
      try {
        return { ok: true, value: BigInt(raw) };
      } catch {
        return { ok: false };
      }
    }
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === '__bigint' || key.length > 64) return { ok: false };
      const parsed = deserializeDeep(entry, depth + 1);
      if (!parsed.ok) return { ok: false };
      out[key] = parsed.value;
    }
    return { ok: true, value: out };
  }
  return { ok: false };
}

/**
 * Validating read. A missing/invalid envelope, or a payload codec rejection,
 * is treated as absent; a bad record can never rebuild a signable attempt.
 * The embedded owner is returned as-is; the hook compares it with the wallet.
 */
export function readWriteRecord<Payload>(
  adapter: WriteRecordAdapter<Payload>,
  scope: CacheScope,
): WriteRecord<Payload> | null {
  const raw: unknown = cache.get<unknown>(scope, adapter.key);
  if (!isRecord(raw)) return null;
  const hash = hashOf(raw.hash);
  const chainId = chainIdOf(raw.chainId);
  const account = addressOf(raw.account);
  const recordedAt = timestampOf(raw.recordedAt);
  if (hash === null || chainId === undefined || account === null || recordedAt === undefined) {
    return null;
  }
  const payload = adapter.decodePayload(raw.payload);
  if (payload === null) return null;
  return { hash, chainId, account, nonce: nonceOf(raw.nonce), recordedAt, payload };
}

export function writeWriteRecord<Payload>(
  adapter: WriteRecordAdapter<Payload>,
  scope: CacheScope,
  record: WriteRecord<Payload>,
): void {
  cache.set(scope, adapter.key, {
    hash: record.hash,
    chainId: record.chainId,
    account: record.account,
    ...(record.nonce !== undefined ? { nonce: record.nonce } : {}),
    recordedAt: record.recordedAt,
    payload: serializeDeep(adapter.encodePayload(record.payload)),
  });
}

export function clearWriteRecord<Payload>(
  adapter: WriteRecordAdapter<Payload>,
  scope: CacheScope,
): void {
  cache.remove(scope, adapter.key);
}
