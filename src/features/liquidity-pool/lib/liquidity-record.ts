import {
  love20HubAbi,
  love20TokenAbi,
  uniswapV2PairAbi,
  uniswapV2Router02Abi,
} from '@/config/abis';
import { ZERO_ADDRESS, type HexAddress } from '@/config/networks';
import type { CacheScope } from '@/shared/lib/cache';
import {
  addressOf,
  clearWriteRecord,
  deserializeDeep,
  isRecord,
  labelOf,
  readWriteRecord,
  writeWriteRecord,
  type WriteHash,
  type WriteRecordAdapter,
} from '@/shared/lib/write-record';
import type { Abi } from 'viem';
import type { LiquidityCall } from '../model/use-liquidity-transaction';

export type HexHash = WriteHash;

/**
 * One 加池/撤出 attempt persisted so 离页或刷新 does not lose it (R4) and so a
 * A refresh restores the in-flight hash instead of sending a second transaction.
 * second liquidity operation (R2/R7).
 *
 * 流动性页没有「属于某一页」的合约：scope 用 contract-less 的 ZERO_ADDRESS，
 * `{chainId, wallet}` 就是全部命名空间。generic 信封内部另外写 `{chainId, account}`，
 * 这样一条被旧版本留下 / 读错 scope 的记录也不会被当前钱包代签（R3）——流动性
 * 的 `to` 参数指向旧账户时，代签等于花新账户的资产给旧账户发凭证。
 */
export interface StoredLiquidity {
  readonly hash: HexHash;
  readonly chainId: number;
  readonly account: HexAddress;
  readonly call: LiquidityCall;
  readonly note: { readonly title: string; readonly detail?: string };
  readonly nonce: number | undefined;
  readonly recordedAt: number;
}

export const LIQUIDITY_TASK_CACHE_KEY = 'liquidityTask';

const FUNCTION_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The ABIs every liquidity call is built from. Only the call *shape* is persisted
 * (address + function name + args), so the ABI is looked up here again instead of
 * being stored: a record can never smuggle an arbitrary contract interface.
 */
const CALL_ABIS: readonly Abi[] = [
  love20HubAbi,
  uniswapV2Router02Abi,
  uniswapV2PairAbi,
  love20TokenAbi,
];

export function createLiquidityScope(chainId: number, wallet: string): CacheScope {
  return { chainId, contractAddress: ZERO_ADDRESS, wallet };
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
 * ABI arguments are plain data except for `bigint`. The generic envelope
 * serializes them loss-lessly (tagged bigints), so a refresh rebuilds the exact
 * same call — the amounts and the `to` address are the whole point of the record.
 */
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

interface LiquidityPayload {
  readonly call: LiquidityCall;
  readonly note: { readonly title: string; readonly detail?: string };
}

const adapter: WriteRecordAdapter<LiquidityPayload> = {
  key: LIQUIDITY_TASK_CACHE_KEY,
  encodePayload: (payload) => ({
    call: {
      address: payload.call.address,
      functionName: payload.call.functionName,
      args: payload.call.args,
      ...(payload.call.value !== undefined ? { value: payload.call.value } : {}),
    },
    note: {
      title: payload.note.title,
      ...(payload.note.detail !== undefined ? { detail: payload.note.detail } : {}),
    },
  }),
  decodePayload: (raw) => {
    if (!isRecord(raw)) return null;
    const call = callOf(raw.call);
    const note = noteOf(raw.note);
    if (call === null || note === null) return null;
    return { call, note };
  },
};

/**
 * Validating read: a malformed entry is absent, so a bad record can never rebuild
 * a call the page would sign. The embedded owner is returned as-is; the hook
 * compares it with the connected wallet before restoring or signing (R3).
 */
export function readStoredLiquidity(scope: CacheScope): StoredLiquidity | null {
  const record = readWriteRecord(adapter, scope);
  if (record === null) return null;
  return {
    hash: record.hash,
    chainId: record.chainId,
    account: record.account,
    call: record.payload.call,
    note: record.payload.note,
    nonce: record.nonce,
    recordedAt: record.recordedAt,
  };
}

/** Persist once the wallet returns the hash so a refresh can resume the same call. */
export function writeStoredLiquidity(scope: CacheScope, stored: StoredLiquidity): void {
  writeWriteRecord(adapter, scope, {
    hash: stored.hash,
    chainId: stored.chainId,
    account: stored.account,
    nonce: stored.nonce,
    recordedAt: stored.recordedAt,
    payload: { call: stored.call, note: stored.note },
  });
}

export function clearStoredLiquidity(scope: CacheScope): void {
  clearWriteRecord(adapter, scope);
}
