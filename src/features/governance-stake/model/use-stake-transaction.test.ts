import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cache } from '@/shared/lib/cache';
import { copy } from '@/shared/config/copy-pages';
import {
  createStakeScope,
  readStoredStakeCall,
  STAKE_TASK_CACHE_KEY,
  writeStoredStakeCall,
  type StoredStakeCall,
} from '@/features/governance-stake/lib/stake-record';
import {
  useStakeTransaction,
  type StakeCall,
} from '@/features/governance-stake/model/use-stake-transaction';

/**
 * 治理·质押写链：T004 后只保留「一笔在途」语义。
 * R5 新操作 pending nonce；失败不保留请求；R3 owner；R7 同一时刻一笔；
 * R4 只恢复有 hash 的记录，hash=null 旧记录直接丢弃。
 */

const ACCOUNT = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' as const;
const OTHER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as const;
const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as const;
const HASH = `0x${'ab'.repeat(32)}` as const;
const SCOPE = createStakeScope(31337, ACCOUNT);

const { writeMock, pendingNonceMock } = vi.hoisted(() => ({
  writeMock: vi.fn(),
  pendingNonceMock: vi.fn(),
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: ACCOUNT }),
  useChainId: () => 31337,
  usePublicClient: () => ({}),
  useWriteContract: () => ({ writeContractAsync: writeMock }),
}));

vi.mock('@/shared/model/use-tx-watch', () => ({
  usePendingNonce: () => pendingNonceMock,
  useTxWatch: (options: { hash: `0x${string}` | null; walletAction?: boolean }) => ({
    status: options.hash === null ? (options.walletAction === true ? 'wallet' : 'idle') : 'pending',
    hash: options.hash,
    receipt: null,
    submittedNonce: undefined,
    remainingMs: 0,
    remainingSeconds: 0,
    isStuck: false,
    isSettled: false,
    refresh: vi.fn(),
  }),
}));

const ABI = [
  {
    type: 'function' as const,
    name: 'stakeLiquidity' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [],
    outputs: [],
  },
];

const CALL: StakeCall = {
  address: '0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB',
  abi: ABI,
  functionName: 'stakeLiquidity',
  args: [TOKEN, 1000n, 2000n, 1n, 42n, 1_700_000_600n],
};

function storedAttempt(hash: `0x${string}`, account: `0x${string}` = ACCOUNT): StoredStakeCall {
  return {
    hash,
    chainId: 31337,
    account,
    call: CALL,
    action: 'stakeLiquidity',
    nonce: 12,
    recordedAt: 1_700_000_000_000,
  };
}

beforeEach(() => {
  cache.clearAll();
  writeMock.mockReset();
  writeMock.mockResolvedValue(HASH);
  pendingNonceMock.mockReset();
  pendingNonceMock.mockResolvedValue(undefined);
});

describe('useStakeTransaction · 新操作 pending nonce（R5）', () => {
  it('读 pending nonce 并显式传入、落进记录', async () => {
    pendingNonceMock.mockResolvedValue(4);
    const { result } = renderHook(() => useStakeTransaction(() => {}));

    await act(async () => {
      await result.current.run(CALL, 'stakeLiquidity');
    });

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({ nonce: 4 }));
    expect(readStoredStakeCall(SCOPE)?.nonce).toBe(4);
  });
});

describe('useStakeTransaction · 失败不保留请求（R1/T004）', () => {
  it('签名失败只报错，不落记录、不产生下一次重发', async () => {
    writeMock.mockRejectedValue(new Error('user rejected'));
    const { result } = renderHook(() => useStakeTransaction(() => {}));

    await act(async () => {
      await result.current.run(CALL, 'stakeLiquidity');
    });

    expect(result.current.error).not.toBeNull();
    expect(readStoredStakeCall(SCOPE)).toBeNull();
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});

describe('useStakeTransaction · 账户归属（R3）', () => {
  it('记录 owner 与当前钱包不符：清记录、不发送、中性提示', () => {
    writeStoredStakeCall(SCOPE, storedAttempt(HASH, OTHER));
    const { result } = renderHook(() => useStakeTransaction(() => {}));

    expect(result.current.watch.hash).toBeNull();
    expect(result.current.error).toBe(copy.gov.tx.ownerChanged);
    expect(readStoredStakeCall(SCOPE)).toBeNull();
    expect(writeMock).not.toHaveBeenCalled();
  });
});

describe('useStakeTransaction · 同一时刻一笔（R7/T004）', () => {
  it('同一个 tick 双击只签一次', async () => {
    pendingNonceMock.mockResolvedValue(12);
    const { result } = renderHook(() => useStakeTransaction(() => {}));

    await act(async () => {
      const first = result.current.run(CALL, 'stakeLiquidity');
      const second = result.current.run(CALL, 'stakeLiquidity');
      await Promise.all([first, second]);
    });

    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});

describe('useStakeTransaction · 刷新恢复（R4/T004）', () => {
  it('只恢复有 hash 的记录；hash=null 旧记录被丢弃', () => {
    cache.set(SCOPE, STAKE_TASK_CACHE_KEY, {
      hash: null,
      chainId: 31337,
      account: ACCOUNT,
      call: { address: CALL.address, functionName: CALL.functionName, args: [] },
      action: 'stakeLiquidity',
      recordedAt: 1_700_000_000_000,
    });
    const { result } = renderHook(() => useStakeTransaction(() => {}));

    expect(result.current.stage).toBe('idle');
    expect(result.current.watch.hash).toBeNull();
    expect(readStoredStakeCall(SCOPE)).toBeNull();
  });
});
