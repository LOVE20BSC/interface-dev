import type { Abi } from 'viem';
import { love20TokenAbi, stakeAbi } from '@/config/abis';
import { ZERO_ADDRESS, type HexAddress } from '@/config/networks';
import { cache, type CacheScope } from '@/shared/lib/cache';
import type { StakeCall } from '../model/use-stake-transaction';

export type HexHash = `0x${string}`;

/**
 * 一条质押写操作的持久化记录（R4：离页/刷新不丢在途交易，R2/R7：刷新后的
 * 「重新提交」替换同一笔而不是再发一笔）。
 *
 * scope 用 contract-less 的 ZERO_ADDRESS（与流动性页同一约定）；记录内部另存
 * `{chainId, account}`，恢复或签名前必须与当前钱包/网络比对（R3，绝不代签）。
 *
 * 只持久化调用的**形状**（地址 + 函数名 + 参数），ABI 从白名单里重新查：一条
 * 被旧版本或手改过的记录不能塞进任意合约接口。
 */
export interface StoredStakeCall {
  readonly hash: HexHash | null;
  readonly chainId: number;
  readonly account: HexAddress;
  readonly call: StakeCall;
  readonly action: string;
  readonly nonce: number | undefined;
  readonly recordedAt: number;
}

export const STAKE_TASK_CACHE_KEY = 'govStakeTask';

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_RE = /^\d+$/;
const FUNCTION_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_ARGS_DEPTH = 4;

/**
 * 允许被重建的写调用白名单。
 *
/**
 * 记录只存「地址 + 函数名 + 参数」，重建时按函数名挑 ABI。用**函数名白名单**而不是
 * 扫整份 ABI：否则一条被手改过的记录可以把 `transfer` 伪装成待重提的质押请求，
 * 用户点「重新提交」就会签一笔转出。这里只列出页面真正会签的 6 个函数
 * （质押合约 5 个写方法 + 每笔授权前的 `approve`）。
 */
const STAKE_CALLS: Readonly<Record<string, Abi>> = Object.freeze({
  stakeLiquidity: stakeAbi,
  stakeBoost: stakeAbi,
  increasePromisedWaitingPhases: stakeAbi,
  unstake: stakeAbi,
  withdraw: stakeAbi,
  approve: love20TokenAbi,
});

const ALLOWED_FUNCTIONS = new Set(Object.keys(STAKE_CALLS));

/** WETH9 与社区代币的 approve 签名相同，重建时统一用 ERC20 ABI。 */
function abiFor(functionName: string): Abi | null {
  if (!ALLOWED_FUNCTIONS.has(functionName)) return null;
  return STAKE_CALLS[functionName] ?? love20TokenAbi;
}

export function createStakeScope(chainId: number, wallet: string): CacheScope {
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

function deserializeDeep(
  value: unknown,
  depth = 0,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  if (depth > MAX_ARGS_DEPTH) return { ok: false };
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

function callOf(value: unknown): StakeCall | null {
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
  return { address, abi, functionName, args };
}

export function readStoredStakeCall(scope: CacheScope): StoredStakeCall | null {
  const raw: unknown = cache.get<unknown>(scope, STAKE_TASK_CACHE_KEY);
  if (!isRecord(raw)) return null;
  const chainId = chainIdOf(raw.chainId);
  const account = addressOf(raw.account);
  const call = callOf(raw.call);
  const action = typeof raw.action === 'string' && raw.action.length <= 64 ? raw.action : undefined;
  const recordedAt = raw.recordedAt;
  if (chainId === undefined || account === null || call === null || action === undefined)
    return null;
  if (typeof recordedAt !== 'number' || !Number.isFinite(recordedAt)) return null;
  const hash = raw.hash === undefined || raw.hash === null ? null : hashOf(raw.hash);
  if (raw.hash !== undefined && raw.hash !== null && hash === null) return null;
  return { hash, chainId, account, call, action, nonce: nonceOf(raw.nonce), recordedAt };
}

export function writeStoredStakeCall(scope: CacheScope, stored: StoredStakeCall): void {
  cache.set(scope, STAKE_TASK_CACHE_KEY, {
    ...(stored.hash !== null ? { hash: stored.hash } : {}),
    chainId: stored.chainId,
    account: stored.account,
    call: {
      address: stored.call.address,
      functionName: stored.call.functionName,
      args: serializeDeep(stored.call.args),
    },
    action: stored.action,
    ...(stored.nonce !== undefined ? { nonce: stored.nonce } : {}),
    recordedAt: stored.recordedAt,
  });
}

export function clearStoredStakeCall(scope: CacheScope): void {
  cache.remove(scope, STAKE_TASK_CACHE_KEY);
}
