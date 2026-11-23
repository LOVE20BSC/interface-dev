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
const HASH = `0x${'1'.repeat(64)}` as const;
const STAKE = '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e' as const;
const TOKEN = '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF' as const;

/**
 * 持久化记录是「刷新后恢复有 hash 的在途交易」的唯一依据：读回来必须能重建**完全相同**的
 * 调用（含 bigint 金额），并且手改过的记录必须被拒绝，不能变成可签名的请求。
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
    clearStoredStakeCall(scope);
    expect(readStoredStakeCall(scope)).toBeNull();
  });

  it('rejects a record whose function is not in the ABI whitelist', () => {
    const scope = createStakeScope(CHAIN_ID, WALLET);
    cache.set(scope, STAKE_TASK_CACHE_KEY, {
      hash: HASH,
      chainId: CHAIN_ID,
      account: WALLET,
      call: { address: STAKE, functionName: 'transfer', args: [WALLET, { __bigint: '1' }] },
      action: 'stakeLiquidity',
      recordedAt: 1,
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
      call: {
        address: STAKE,
        functionName: 'unstake',
        args: [TOKEN, { __bigint: 'not-a-number' }],
      },
      action: 'unstake',
      recordedAt: 1,
    });
    expect(readStoredStakeCall(scope)).toBeNull();
    cache.remove(scope, STAKE_TASK_CACHE_KEY);
  });

  it('rejects a legacy hash-less record (no retry state after T004)', () => {
    const scope = createStakeScope(CHAIN_ID, WALLET);
    cache.set(scope, STAKE_TASK_CACHE_KEY, {
      hash: null,
      chainId: CHAIN_ID,
      account: WALLET,
      call: { address: STAKE, functionName: 'unstake', args: [TOKEN, { __bigint: '5' }] },
      action: 'unstake',
      recordedAt: 1_700_000_000_000,
    });
    expect(readStoredStakeCall(scope)).toBeNull();
    clearStoredStakeCall(scope);
  });
});
