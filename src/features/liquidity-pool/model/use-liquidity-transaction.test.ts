import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cache } from '@/shared/lib/cache';
import { copy } from '@/shared/config/copy-pages';
import type {
  ApproveRequest,
  LiquidityCall,
} from '@/features/liquidity-pool/model/use-liquidity-transaction';
import {
  createLiquidityScope,
  readStoredLiquidity,
  writeStoredLiquidity,
} from '@/features/liquidity-pool/lib/liquidity-record';

/**
 * 流动性写链状态机：QA D1/P1（再授权）+ owner 2026-11-16 的交易恢复加固
 * （R1 发送前落 attempt / R2 重试绑定原哈希与原 nonce / R3 账户归属 /
 * R4 离页刷新恢复 / R5 首笔 pending nonce / R7 重试加锁与钱包等待态）。
 */

const mock = vi.hoisted(() => {
  const receipts = new Map<string, unknown>();
  let counter = 0;
  return {
    receipts,
    nextHash(): `0x${string}` {
      counter += 1;
      return `0x${counter.toString(16).padStart(64, '0')}`;
    },
    reset(): void {
      receipts.clear();
      counter = 0;
    },
  };
});

const ACCOUNT = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const OTHER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const SCOPE = createLiquidityScope(31337, ACCOUNT);

const { writeMock, pendingNonceMock, refreshSpy } = vi.hoisted(() => ({
  writeMock: vi.fn(),
  pendingNonceMock: vi.fn(),
  refreshSpy: vi.fn(),
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: ACCOUNT }),
  useChainId: () => 31337,
  usePublicClient: () => ({}),
  useWriteContract: () => ({ writeContractAsync: writeMock }),
}));

vi.mock('@/shared/model/use-tx-watch', () => ({
  usePendingNonce: () => pendingNonceMock,
  useTxWatch: (options: { hash: `0x${string}` | null; walletAction?: boolean }) => {
    const receipt = options.hash !== null ? mock.receipts.get(options.hash) : undefined;
    return {
      status:
        options.hash === null ? (options.walletAction === true ? 'wallet' : 'idle') : 'pending',
      hash: options.hash,
      receipt: receipt ?? null,
      submittedNonce: undefined,
      remainingMs: 0,
      remainingSeconds: 0,
      isStuck: false,
      isSettled: receipt !== undefined,
      refresh: refreshSpy,
    };
  },
}));

import { useLiquidityTransaction } from './use-liquidity-transaction';

const REQUEST: ApproveRequest = {
  tokenAddress: '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF',
  kind: 'erc20',
  spender: '0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB',
  amount: 100000n * 10n ** 18n,
};

const CALL: LiquidityCall = {
  address: '0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB',
  abi: [
    {
      type: 'function',
      name: 'removeLiquidityETH',
      stateMutability: 'nonpayable',
      inputs: [],
      outputs: [],
    },
  ],
  functionName: 'removeLiquidityETH',
  args: ['0x5FbDB2315678afecb367f032d93F642f64180aa3', 1000n, 1n, 2n, ACCOUNT, 1_700_000_600n],
};

const NOTE = { title: '撤出完成', detail: '已取回 0.5 ETH' };

function confirmedReceipt(): { status: 'success' } {
  return { status: 'success' };
}

beforeEach(() => {
  cache.clearAll();
  mock.reset();
  writeMock.mockReset();
  writeMock.mockImplementation(async () => mock.nextHash());
  pendingNonceMock.mockReset();
  pendingNonceMock.mockResolvedValue(undefined);
  refreshSpy.mockReset();
});

describe('useLiquidityTransaction · 再授权（QA D1/P1）', () => {
  it('每确认一次授权都会让 approveRevision 前进（同一个 token+spender 也不例外）', async () => {
    const { result, rerender } = renderHook(() => useLiquidityTransaction(() => {}));

    expect(result.current.approveRevision).toBe(0);

    // 第一笔授权确认。
    await act(async () => {
      await result.current.approve(REQUEST);
    });
    const firstHash = result.current.approveHash;
    expect(firstHash).not.toBeNull();
    act(() => {
      mock.receipts.set(firstHash ?? '', confirmedReceipt());
      rerender();
    });
    expect(result.current.approveRevision).toBe(1);
    expect(result.current.approveStage).toBe('idle');

    // 第二笔授权：token 与 spender 完全相同，旧实现在这里 key 不变、页面卡死。
    await act(async () => {
      await result.current.approve(REQUEST);
    });
    const secondHash = result.current.approveHash;
    expect(secondHash).not.toBeNull();
    expect(secondHash).not.toBe(firstHash);
    act(() => {
      mock.receipts.set(secondHash ?? '', confirmedReceipt());
      rerender();
    });
    expect(result.current.approveRevision).toBe(2);
    expect(result.current.approveStage).toBe('idle');
  });
});

describe('useLiquidityTransaction · 首笔 pending nonce（R5）', () => {
  it('pins latest+1 (pending) instead of the mined count', async () => {
    pendingNonceMock.mockResolvedValue(4); // latest=3, 钱包里已有一笔 pending
    const { result } = renderHook(() => useLiquidityTransaction(() => {}));

    await act(async () => {
      await result.current.run(CALL, NOTE);
    });

    expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({ nonce: 4 }));
    expect(readStoredLiquidity(SCOPE)?.nonce).toBe(4);
  });
});

describe('useLiquidityTransaction · 离页/刷新恢复（R4）', () => {
  it('restores the in-flight operation and blocks a second submission', async () => {
    writeStoredLiquidity(SCOPE, {
      hash: `0x${'ab'.repeat(32)}`,
      chainId: 31337,
      account: ACCOUNT,
      call: CALL,
      note: NOTE,
      nonce: 12,
      recordedAt: 1_700_000_000_000,
    });
    const { result } = renderHook(() => useLiquidityTransaction(() => {}));

    expect(result.current.stage).toBe('pending');
    expect(result.current.watch.hash).toBe(`0x${'ab'.repeat(32)}`);

    await act(async () => {
      await result.current.run(CALL, NOTE);
    });
    expect(writeMock).not.toHaveBeenCalled();
    expect(readStoredLiquidity(SCOPE)?.hash).toBe(`0x${'ab'.repeat(32)}`);
  });

  it('clears the persisted task once the operation settles', async () => {
    writeStoredLiquidity(SCOPE, {
      hash: `0x${'ab'.repeat(32)}`,
      chainId: 31337,
      account: ACCOUNT,
      call: CALL,
      note: NOTE,
      nonce: 12,
      recordedAt: 1_700_000_000_000,
    });
    const { result, rerender } = renderHook(() => useLiquidityTransaction(() => {}));
    act(() => {
      mock.receipts.set(`0x${'ab'.repeat(32)}`, confirmedReceipt());
      rerender();
    });
    expect(result.current.receipt?.hash).toBe(`0x${'ab'.repeat(32)}`);
    expect(readStoredLiquidity(SCOPE)).toBeNull();
  });
});

describe('useLiquidityTransaction · 账户归属（R3）', () => {
  const OTHER_SCOPE = createLiquidityScope(31337, OTHER);

  it('never restores another wallet’s in-flight operation', () => {
    writeStoredLiquidity(OTHER_SCOPE, {
      hash: `0x${'ab'.repeat(32)}`,
      chainId: 31337,
      account: OTHER,
      call: CALL,
      note: NOTE,
      nonce: 12,
      recordedAt: 1_700_000_000_000,
    });
    const { result } = renderHook(() => useLiquidityTransaction(() => {}));
    expect(result.current.watch.hash).toBeNull();
    expect(result.current.stage).toBe('idle');
  });

  it('clears a record whose embedded owner is another wallet and never signs it', () => {
    writeStoredLiquidity(SCOPE, {
      hash: `0x${'ab'.repeat(32)}`,
      chainId: 31337,
      account: OTHER,
      call: CALL,
      note: NOTE,
      nonce: 12,
      recordedAt: 1_700_000_000_000,
    });
    const { result } = renderHook(() => useLiquidityTransaction(() => {}));

    expect(result.current.watch.hash).toBeNull();
    expect(result.current.error?.message).toBe(copy.txWatch.ownerChanged);
    expect(readStoredLiquidity(SCOPE)).toBeNull();
    expect(writeMock).not.toHaveBeenCalled();
  });
});
