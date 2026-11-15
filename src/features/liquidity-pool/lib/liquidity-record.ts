import { love20HubAbi, love20TokenAbi, uniswapV2PairAbi, uniswapV2Router02Abi } from '@/config/abis';
import { ZERO_ADDRESS, type HexAddress } from '@/config/networks';
import { cache, type CacheScope } from '@/shared/lib/cache';
import type { Abi } from 'viem';
import type { LiquidityCall } from '../model/use-liquidity-transaction';

export type HexHash = `0x${string}`;

/**
 * One 加池/撤出 attempt persisted so 离页或刷新 does not lose it (R4) and so a
 * 「重新提交」 after a refresh replaces the same transaction instead of sending a
 * second liquidity operation (R2/R7).
 *
 * 流动性页没有「属于某一页」的合约：scope 用 contract-less 的 ZERO_ADDRESS，
 * `{chainId, wallet}` 就是全部命名空间。记录内部另外写 `{chainId, account}`，
 * 这样一条被旧版本留下 / 读错 scope 的记录也不会被当前钱包代签（R3）——流动性
 * 的 `to` 参数指向旧账户时，代签等于花新账户的资产给旧账户发凭证。
 */
export interface StoredLiquidity {
  readonly hash: HexHash | null;
  readonly chainId: number;
  readonly account: HexAddress;
  readonly call: LiquidityCall;
  readonly note: { readonly title: string; readonly detail?: string };
  readonly nonce: number | undefined;
  readonly recordedAt: number;
}

export const LIQUIDITY_TASK_CACHE_KEY = 'liquidityTask';

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_RE = /^\d+$/;
const FUNCTION_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_ARGS_DEPTH = 4;

/**
 * The ABIs every liquidity call is built from. Only the call *shape* is persisted
 * (address + function name + args), so the ABI is looked up here again instead of
 * being stored: a record can never smuggle an arbitrary contract interface.
 */
const CALL_ABIS: readonly Abi[] = [love20HubAbi, uniswapV2Router02Abi, uniswapV2PairAbi, love20TokenAbi];

export function createLiquidityScope(chainId: number, wallet: string): CacheScope {
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

function labelOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : undefined;
}

function abiFor(functionName: string): Abi | null {
  for (const abi of CALL_ABIS) {
    const hasFunction = abi.some(
      (entry) => entry.type === 'function' && entry.name === functionName,
    );
    if (hasFunction) return abi;
  }
  return null;
}

/**
 * ABI arguments are plain data except for `bigint`. Serializing them loss-lessly
 * (tagged bigints) is what lets a refresh rebuild the exact same call — the
 * amounts and the `to` address are the whole point of the record.
 */
function serializeDeep(value: unknown): unknown {
  if (typeof value === 'bigint') return { __bigint: value.toString() };
  if (Array.isArray(value)) return value.map((entry) => serializeDeep(entry));
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) result[key] = serializeDeep(entry);
    return result;
  }
  return value;
}

function deserializeDeep(value: unknown, depth = 0): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  if (depth > MAX_ARGS_DEPTH) return { ok: false };
  if (typeof value === 'string') return value.length <= 512 ? { ok: true, value } : { ok: false };
  if (typeof value === 'number') return Number.isFinite(value) ? { ok: true, value } : { ok: false };
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

function callOf(value: unknown): LiquidityCall | null {
  if (!isRecord(value)) return null;
  const address = addressOf(value.address);
  const functionName = typeof value.functionName === 'string' ? value.functionName : '';
  if (address === null || !FUNCTION_RE.test(functionName) || functionName.length > 64) return null;
  const abi = abiFor(functionName);
  if (abi === null) return null;
  if (!Array.isArray(value.args) || value.args.length > 16) return null;
  const args: unknown[] = [];
  for (const entry of value.args) {
    const parsed = deserializeDeep(entry);
    if (!parsed.ok) return null;
    args.push(parsed.value);
  }
  const valueField = value.value;
  let callValue: bigint | undefined;
  if (valueField !== undefined) {
    const parsed = deserializeDeep(valueField);
    if (!parsed.ok || typeof parsed.value !== 'bigint' || parsed.value < 0n) return null;
    callValue = parsed.value;
  }
  return {
    address,
    abi,
    functionName,
    args,
    ...(callValue !== undefined ? { value: callValue } : {}),
  };
}

function noteOf(value: unknown): { title: string; detail?: string } | null {
  if (!isRecord(value)) return null;
  const title = labelOf(value.title);
  if (title === undefined) return null;
  const detail = labelOf(value.detail);
  return { title, ...(detail !== undefined ? { detail } : {}) };
}

/**
 * Validating read: a malformed entry is absent, so a bad record can never rebuild
 * a call the page would sign. The embedded owner is returned as-is; the hook
 * compares it with the connected wallet before restoring or signing (R3).
 */
export function readStoredLiquidity(scope: CacheScope): StoredLiquidity | null {
  const raw: unknown = cache.get<unknown>(scope, LIQUIDITY_TASK_CACHE_KEY);
  if (!isRecord(raw)) return null;
  const chainId = chainIdOf(raw.chainId);
  const account = addressOf(raw.account);
  const call = callOf(raw.call);
  const note = noteOf(raw.note);
  const recordedAt = raw.recordedAt;
  if (chainId === undefined || account === null) return null;
  if (call === null || note === null) return null;
  if (typeof recordedAt !== 'number' || !Number.isFinite(recordedAt)) return null;
  const hash = raw.hash === undefined || raw.hash === null ? null : hashOf(raw.hash);
  if (raw.hash !== undefined && raw.hash !== null && hash === null) return null;
  return {
    hash,
    chainId,
    account,
    call,
    note,
    nonce: nonceOf(raw.nonce),
    recordedAt,
  };
}

/** Persist before the wallet opens (no hash yet) and again once the hash lands. */
export function writeStoredLiquidity(scope: CacheScope, stored: StoredLiquidity): void {
  cache.set(scope, LIQUIDITY_TASK_CACHE_KEY, {
    ...(stored.hash !== null ? { hash: stored.hash } : {}),
    chainId: stored.chainId,
    account: stored.account,
    call: {
      address: stored.call.address,
      functionName: stored.call.functionName,
      args: serializeDeep(stored.call.args),
      ...(stored.call.value !== undefined ? { value: serializeDeep(stored.call.value) } : {}),
    },
    note: {
      title: stored.note.title,
      ...(stored.note.detail !== undefined ? { detail: stored.note.detail } : {}),
    },
    ...(stored.nonce !== undefined ? { nonce: stored.nonce } : {}),
    recordedAt: stored.recordedAt,
  });
}

export function clearStoredLiquidity(scope: CacheScope): void {
  cache.remove(scope, LIQUIDITY_TASK_CACHE_KEY);
}
