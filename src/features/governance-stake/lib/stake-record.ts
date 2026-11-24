import type { Abi } from 'viem';
import { love20TokenAbi, stakeAbi } from '@/config/abis';
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
import type { StakeCall } from '../model/use-stake-transaction';

export type HexHash = WriteHash;

/**
 * 一条质押写操作的持久化记录（R4：离页/刷新不丢在途交易，R2/R7：刷新后的
 * 刷新后只恢复有 hash 的在途记录，不再重发。
 *
 * scope 用 contract-less 的 ZERO_ADDRESS（与流动性页同一约定）；generic 信封内部
 * 另存 `{chainId, account}`，恢复或签名前必须与当前钱包/网络比对（R3，绝不代签）。
 *
 * 只持久化调用的**形状**（地址 + 函数名 + 参数），ABI 从白名单里重新查：一条
 * 被旧版本或手改过的记录不能塞进任意合约接口。
 */
export interface StoredStakeCall {
  readonly hash: HexHash;
  readonly chainId: number;
  readonly account: HexAddress;
  readonly call: StakeCall;
  readonly action: string;
  readonly nonce: number | undefined;
  readonly recordedAt: number;
}

export const STAKE_TASK_CACHE_KEY = 'govStakeTask';

const FUNCTION_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * 允许被重建的写调用白名单。
 *
/**
 * 记录只存「地址 + 函数名 + 参数」，重建时按函数名挑 ABI。用**函数名白名单**而不是
 * 扫整份 ABI：否则一条被手改过的记录可以把 `transfer` 伪装成待重提的质押请求，
 * 页面会签的 6 个函数。
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

interface StakePayload {
  readonly call: StakeCall;
  readonly action: string;
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

const adapter: WriteRecordAdapter<StakePayload> = {
  key: STAKE_TASK_CACHE_KEY,
  encodePayload: (payload) => ({
    call: {
      address: payload.call.address,
      functionName: payload.call.functionName,
      args: payload.call.args,
    },
    action: payload.action,
  }),
  decodePayload: (raw) => {
    if (!isRecord(raw)) return null;
    const call = callOf(raw.call);
    const action = labelOf(raw.action, 64);
    if (call === null || action === undefined) return null;
    return { call, action };
  },
};

export function readStoredStakeCall(scope: CacheScope): StoredStakeCall | null {
  const record = readWriteRecord(adapter, scope);
  if (record === null) return null;
  return {
    hash: record.hash,
    chainId: record.chainId,
    account: record.account,
    call: record.payload.call,
    action: record.payload.action,
    nonce: record.nonce,
    recordedAt: record.recordedAt,
  };
}

export function writeStoredStakeCall(scope: CacheScope, stored: StoredStakeCall): void {
  writeWriteRecord(adapter, scope, {
    hash: stored.hash,
    chainId: stored.chainId,
    account: stored.account,
    nonce: stored.nonce,
    recordedAt: stored.recordedAt,
    payload: { call: stored.call, action: stored.action },
  });
}

export function clearStoredStakeCall(scope: CacheScope): void {
  clearWriteRecord(adapter, scope);
}
