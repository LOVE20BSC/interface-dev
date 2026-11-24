import { describe, expect, it } from 'vitest';
import { stakeAbi } from '@/config/abis';
import { cache } from '@/shared/lib/cache';
import {
  clearStoredStakeCall,
  createStakeScope,
  readStoredStakeCall,
  STAKE_TASK_CACHE_KEY,
  writeStoredStakeCall,
} from './stake-record';

const CHAIN_ID = 31337;
const WALLET = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' as const;
const OTHER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as const;
const HASH = `0x${'1'.repeat(64)}` as const;
const STAKE = '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e' as const;
const TOKEN = '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF' as const;

/**
 * 持久化记录是「刷新后恢复有 hash 的在途交易」的唯一依据：读回来必须能重建**完全相同**的
 * 调用（含 bigint 金额），并且手改过的记录必须被拒绝，不能变成可签名的请求。
 *
 * T005：记录改用通用信封 `{hash,chainId,account,nonce?,recordedAt,payload}`，
 * payload 之下才是 feature 自己的调用形状。
 */
describe('stake-record', () => {
  it('round-trips a call including bigint args', () => {
    const scope = createStakeScope(CHAIN_ID, WALLET);
    writeStoredStakeCall(scope, {
      hash: HASH,
      chainId: CHAIN_ID,
      account: WALLET,
      call: {
        address: STAKE,
        abi: stakeAbi,
        functionName: 'stakeLiquidity',
        args: [TOKEN, 1_000n * 10n ** 18n, 5n * 10n ** 17n, 10n, 5n, 1_700_000_000n],
      },
      action: 'stakeLiquidity',
      nonce: 7,
      recordedAt: 1_700_000_000_000,
    });

    const stored = readStoredStakeCall(scope);
    expect(stored).not.toBeNull();
    expect(stored?.hash).toBe(HASH);
    expect(stored?.chainId).toBe(CHAIN_ID);
    expect(stored?.account).toBe(WALLET);
    expect(stored?.call.functionName).toBe('stakeLiquidity');
    expect(stored?.call.args).toEqual([
      TOKEN,
      1_000n * 10n ** 18n,
      5n * 10n ** 17n,
      10n,
      5n,
      1_700_000_000n,
    ]);
    expect(stored?.nonce).toBe(7);
    expect(stored?.action).toBe('stakeLiquidity');
    expect(stored?.recordedAt).toBe(1_700_000_000_000);
    clearStoredStakeCall(scope);
    expect(readStoredStakeCall(scope)).toBeNull();
  });

  it('stores the generic envelope with the feature payload nested under `payload`', () => {
    const scope = createStakeScope(CHAIN_ID, WALLET);
    writeStoredStakeCall(scope, {
      hash: HASH,
      chainId: CHAIN_ID,
      account: WALLET,
      call: { address: STAKE, abi: stakeAbi, functionName: 'unstake', args: [TOKEN, 5n] },
      action: 'unstake',
      nonce: 3,
      recordedAt: 1_700_000_000_000,
    });

    const raw = cache.get<Record<string, unknown>>(scope, STAKE_TASK_CACHE_KEY);
    expect(raw).not.toBeNull();
    expect(Object.keys(raw ?? {}).sort()).toEqual(
      ['account', 'chainId', 'hash', 'nonce', 'payload', 'recordedAt'].sort(),
    );
    expect(raw?.hash).toBe(HASH);
    expect(raw?.call).toBeUndefined();
    const payload = raw?.payload as Record<string, unknown>;
    expect((payload.call as Record<string, unknown>).functionName).toBe('unstake');
    expect(payload.action).toBe('unstake');
    expect((payload.call as Record<string, unknown>).args).toEqual([TOKEN, { __bigint: '5' }]);
  });

  it('rejects a record whose function is not in the ABI whitelist', () => {
    const scope = createStakeScope(CHAIN_ID, WALLET);
    cache.set(scope, STAKE_TASK_CACHE_KEY, {
      hash: HASH,
      chainId: CHAIN_ID,
      account: WALLET,
      recordedAt: 1,
      payload: {
        call: { address: STAKE, functionName: 'transfer', args: [WALLET, { __bigint: '1' }] },
        action: 'stakeLiquidity',
      },
    });
    expect(readStoredStakeCall(scope)).toBeNull();
    cache.remove(scope, STAKE_TASK_CACHE_KEY);
  });

  it('rejects a record with a broken bigint tag', () => {
    const scope = createStakeScope(CHAIN_ID, WALLET);
    cache.set(scope, STAKE_TASK_CACHE_KEY, {
      hash: HASH,
      chainId: CHAIN_ID,
      account: WALLET,
      recordedAt: 1,
      payload: {
        call: {
          address: STAKE,
          functionName: 'unstake',
          args: [TOKEN, { __bigint: 'not-a-number' }],
        },
        action: 'unstake',
      },
    });
    expect(readStoredStakeCall(scope)).toBeNull();
    cache.remove(scope, STAKE_TASK_CACHE_KEY);
  });

  it('rejects a record without a payload (pre-T005 flat record)', () => {
    const scope = createStakeScope(CHAIN_ID, WALLET);
    cache.set(scope, STAKE_TASK_CACHE_KEY, {
      hash: HASH,
      chainId: CHAIN_ID,
      account: WALLET,
      call: { address: STAKE, functionName: 'unstake', args: [TOKEN, { __bigint: '5' }] },
      action: 'unstake',
      recordedAt: 1_700_000_000_000,
    });
    expect(readStoredStakeCall(scope)).toBeNull();
    clearStoredStakeCall(scope);
  });

  it('rejects a legacy hash-less record (no retry state after T004)', () => {
    const scope = createStakeScope(CHAIN_ID, WALLET);
    cache.set(scope, STAKE_TASK_CACHE_KEY, {
      hash: null,
      chainId: CHAIN_ID,
      account: WALLET,
      recordedAt: 1_700_000_000_000,
      payload: {
        call: { address: STAKE, functionName: 'unstake', args: [TOKEN, { __bigint: '5' }] },
        action: 'unstake',
      },
    });
    expect(readStoredStakeCall(scope)).toBeNull();
    clearStoredStakeCall(scope);
  });

  it('scopes the task by chain + wallet (R3/R4)', () => {
    const scope = createStakeScope(CHAIN_ID, WALLET);
    writeStoredStakeCall(scope, {
      hash: HASH,
      chainId: CHAIN_ID,
      account: WALLET,
      call: { address: STAKE, abi: stakeAbi, functionName: 'unstake', args: [TOKEN, 5n] },
      action: 'unstake',
      nonce: undefined,
      recordedAt: 1_700_000_000_000,
    });
    expect(readStoredStakeCall(createStakeScope(CHAIN_ID, OTHER))).toBeNull();
    expect(readStoredStakeCall(createStakeScope(56, WALLET))).toBeNull();
    clearStoredStakeCall(scope);
  });
});
