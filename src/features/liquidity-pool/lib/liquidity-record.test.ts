import { beforeEach, describe, expect, it } from 'vitest';
import { cache } from '@/shared/lib/cache';
import { uniswapV2Router02Abi } from '@/config/abis';
import {
  LIQUIDITY_TASK_CACHE_KEY,
  clearStoredLiquidity,
  createLiquidityScope,
  readStoredLiquidity,
  writeStoredLiquidity,
  type StoredLiquidity,
} from '@/features/liquidity-pool/lib/liquidity-record';

/**
 * 流动性待确认任务持久化（R4）+ 账户归属（R3）+ 原 nonce（R2）。
 *
 * 记录里只存「调用形状」（地址 + 函数名 + 参数），ABI 由函数名在已知 ABIs 里重新
 * 查出来，所以一条被篡改的记录也没有机会让页面签一个任意接口的调用。
 */

const WALLET = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const OTHER = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const ROUTER = '0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB';
const HASH = `0x${'ab'.repeat(32)}` as const;

const SCOPE = createLiquidityScope(31337, WALLET);

const STORED: StoredLiquidity = {
  hash: HASH,
  chainId: 31337,
  account: WALLET,
  call: {
    address: ROUTER,
    abi: uniswapV2Router02Abi,
    functionName: 'addLiquidityETH',
    args: [TOKEN, 1000000n, 900n, 800n, WALLET, 1_700_000_600n],
    value: 500000000000000000n,
  },
  note: { title: '加流动性完成', detail: '已加入 0.5 ETH' },
  nonce: 12,
  recordedAt: 1_700_000_000_000,
};

beforeEach(() => {
  cache.clearAll();
});

describe('liquidity-record 在途任务（R2/R3/R4）', () => {
  it('round-trips the exact call, including bigint args and msg.value', () => {
    writeStoredLiquidity(SCOPE, STORED);
    const stored = readStoredLiquidity(SCOPE);
    expect(stored).not.toBeNull();
    expect(stored?.hash).toBe(HASH);
    expect(stored?.call.functionName).toBe('addLiquidityETH');
    expect(stored?.call.address).toBe(ROUTER);
    expect(stored?.call.args).toEqual([TOKEN, 1000000n, 900n, 800n, WALLET, 1_700_000_600n]);
    expect(stored?.call.value).toBe(500000000000000000n);
    expect(stored?.nonce).toBe(12);
    expect(stored?.note).toEqual({ title: '加流动性完成', detail: '已加入 0.5 ETH' });
  });

  it('round-trips a struct-argument call (hub addLiquidityWithNative)', () => {
    writeStoredLiquidity(SCOPE, {
      ...STORED,
      call: {
        address: ROUTER,
        abi: uniswapV2Router02Abi,
        functionName: 'addLiquidityETH',
        args: [TOKEN, 5n, 1n, 2n, WALLET, 3n],
      },
    });
    const stored = readStoredLiquidity(SCOPE);
    expect(stored?.call.args[1]).toBe(5n);
    expect(stored?.call.value).toBeUndefined();
  });

  it('keeps an attempt that never got a hash (R1 after a refresh)', () => {
    writeStoredLiquidity(SCOPE, { ...STORED, hash: null, nonce: undefined });
    const stored = readStoredLiquidity(SCOPE);
    expect(stored?.hash).toBeNull();
    expect(stored?.nonce).toBeUndefined();
    expect(stored?.call.functionName).toBe('addLiquidityETH');
  });

  it('scopes the task by chain + wallet so A 的请求在 B 下读不到（R3/R4）', () => {
    writeStoredLiquidity(SCOPE, STORED);
    expect(readStoredLiquidity(createLiquidityScope(31337, OTHER))).toBeNull();
    expect(readStoredLiquidity(createLiquidityScope(56, WALLET))).toBeNull();
    expect(cache.key(SCOPE, LIQUIDITY_TASK_CACHE_KEY)).toContain(WALLET.toLowerCase());
  });

  it('rejects a record that would sign an unknown call or a broken amount', () => {
    writeStoredLiquidity(SCOPE, STORED);
    const raw = cache.get<Record<string, unknown>>(SCOPE, LIQUIDITY_TASK_CACHE_KEY);
    expect(raw).not.toBeNull();
    if (raw === null) return;
    const call = raw.call as Record<string, unknown>;
    for (const broken of [
      { ...raw, chainId: undefined },
      { ...raw, account: undefined },
      { ...raw, account: '0xnot-an-address' },
      { ...raw, hash: '0x1234' },
      { ...raw, call: { ...call, functionName: 'drainEverything' } },
      { ...raw, call: { ...call, address: '0xnot-an-address' } },
      { ...raw, call: { ...call, args: [{ __bigint: '-1' }] } },
      { ...raw, call: { ...call, args: 'not-an-array' } },
      { ...raw, note: { title: '' } },
    ]) {
      cache.set(SCOPE, LIQUIDITY_TASK_CACHE_KEY, broken);
      expect(readStoredLiquidity(SCOPE)).toBeNull();
    }
  });

  it('clears the task once the operation settles', () => {
    writeStoredLiquidity(SCOPE, STORED);
    clearStoredLiquidity(SCOPE);
    expect(readStoredLiquidity(SCOPE)).toBeNull();
  });
});
