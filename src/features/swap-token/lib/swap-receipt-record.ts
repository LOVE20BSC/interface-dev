import { cache, type CacheScope } from '@/shared/lib/cache';
import { swapTokenKey, type SwapToken } from './swap-types';

export type HexHash = `0x${string}`;
export type SwapRecordKind = 'swap' | 'wrap' | 'unwrap';

/** Everything the receipt needs, persisted before the transaction is mined. */
export interface SwapRecord {
  readonly hash: HexHash;
  readonly kind: SwapRecordKind;
  /** swapTokenKey() of each side, so a later selection cannot show a stale receipt. */
  readonly fromKey: string;
  readonly toKey: string;
  readonly fromSymbol: string;
  readonly toSymbol: string;
  readonly fromDecimals: number | undefined;
  readonly toDecimals: number | undefined;
  readonly amountIn: bigint | undefined;
  readonly minOut: bigint | undefined;
  readonly quoteOut: bigint | undefined;
  readonly actualOut: bigint | undefined;
  readonly paidIn: bigint | undefined;
  readonly path: readonly string[];
  readonly pathSymbols: readonly string[];
  readonly pairAddresses: readonly string[];
  readonly pairToken0: readonly string[];
  readonly pairToken1: readonly string[];
  readonly belowMinOut: boolean;
  /** Pending records are recovered as 确认中, confirmed ones as the receipt. */
  readonly confirmed: boolean;
  readonly recordedAt: number | undefined;
}

/** Semantic key; the scope already namespaces chain/router/wallet. */
export const SWAP_RECORD_CACHE_KEY = 'swapReceipt';

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL_RE = /^\d+$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function createSwapScope(
  chainId: number,
  routerAddress: string,
  wallet: string,
): CacheScope {
  return { chainId, contractAddress: routerAddress, wallet };
}

export function swapRecordMatchesPair(record: SwapRecord, from: SwapToken, to: SwapToken): boolean {
  return record.fromKey === swapTokenKey(from) && record.toKey === swapTokenKey(to);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hashOf(value: unknown): HexHash | null {
  return typeof value === 'string' && HASH_RE.test(value) ? (value as HexHash) : null;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined;
}

function decimalOf(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || !DECIMAL_RE.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function decimalsOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 36
    ? value
    : undefined;
}

function timestampOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function stringListOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function addressListOf(value: unknown): string[] {
  return stringListOf(value).filter((entry) => ADDRESS_RE.test(entry));
}

function kindOf(value: unknown): SwapRecordKind | undefined {
  return value === 'swap' || value === 'wrap' || value === 'unwrap' ? value : undefined;
}

export function readSwapRecord(scope: CacheScope): SwapRecord | null {
  const raw: unknown = cache.get<unknown>(scope, SWAP_RECORD_CACHE_KEY);
  if (!isRecord(raw)) return null;
  const hash = hashOf(raw.hash);
  const kind = kindOf(raw.kind);
  const fromKey = stringOf(raw.fromKey);
  const toKey = stringOf(raw.toKey);
  const fromSymbol = stringOf(raw.fromSymbol);
  const toSymbol = stringOf(raw.toSymbol);
  if (
    hash === null ||
    kind === undefined ||
    fromKey === undefined ||
    toKey === undefined ||
    fromSymbol === undefined ||
    toSymbol === undefined
  ) {
    return null;
  }
  return {
    hash,
    kind,
    fromKey,
    toKey,
    fromSymbol,
    toSymbol,
    fromDecimals: decimalsOf(raw.fromDecimals),
    toDecimals: decimalsOf(raw.toDecimals),
    amountIn: decimalOf(raw.amountIn),
    minOut: decimalOf(raw.minOut),
    quoteOut: decimalOf(raw.quoteOut),
    actualOut: decimalOf(raw.actualOut),
    paidIn: decimalOf(raw.paidIn),
    path: addressListOf(raw.path),
    pathSymbols: stringListOf(raw.pathSymbols),
    pairAddresses: addressListOf(raw.pairAddresses),
    pairToken0: addressListOf(raw.pairToken0),
    pairToken1: addressListOf(raw.pairToken1),
    belowMinOut: raw.belowMinOut === true,
    confirmed: raw.confirmed === true,
    recordedAt: timestampOf(raw.recordedAt),
  };
}

/**
 * Persist before the wallet returns? No: the hash only exists after the wallet
 * accepts. Call immediately after it, so a refresh while pending still resumes.
 */
export function writeSwapRecord(scope: CacheScope, record: SwapRecord): void {
  cache.set(scope, SWAP_RECORD_CACHE_KEY, {
    hash: record.hash,
    kind: record.kind,
    fromKey: record.fromKey,
    toKey: record.toKey,
    fromSymbol: record.fromSymbol,
    toSymbol: record.toSymbol,
    ...(record.fromDecimals !== undefined ? { fromDecimals: record.fromDecimals } : {}),
    ...(record.toDecimals !== undefined ? { toDecimals: record.toDecimals } : {}),
    ...(record.amountIn !== undefined ? { amountIn: record.amountIn.toString() } : {}),
    ...(record.minOut !== undefined ? { minOut: record.minOut.toString() } : {}),
    ...(record.quoteOut !== undefined ? { quoteOut: record.quoteOut.toString() } : {}),
    ...(record.actualOut !== undefined ? { actualOut: record.actualOut.toString() } : {}),
    ...(record.paidIn !== undefined ? { paidIn: record.paidIn.toString() } : {}),
    path: [...record.path],
    pathSymbols: [...record.pathSymbols],
    pairAddresses: [...record.pairAddresses],
    pairToken0: [...record.pairToken0],
    pairToken1: [...record.pairToken1],
    belowMinOut: record.belowMinOut,
    confirmed: record.confirmed,
    ...(record.recordedAt !== undefined ? { recordedAt: record.recordedAt } : {}),
  });
}

export function clearSwapRecord(scope: CacheScope): void {
  cache.remove(scope, SWAP_RECORD_CACHE_KEY);
}
