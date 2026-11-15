import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cache } from '@/shared/lib/cache';
import { copy } from '@/shared/config/copy-pages';
import type { ResubmitSnapshot } from '@/shared/lib/tx-resubmit';
import { useBatchTransaction } from '@/features/batch-transfer/model/use-batch-transaction';
import {
  createBatchScope,
  readStoredBatch,
  writeStoredBatch,
  type StoredBatch,
} from '@/features/batch-transfer/lib/batch-record';
import type { BatchRequest } from '@/features/batch-transfer/lib/batch-types';

/**
 * 批量转账恢复加固（R1/R2/R3/R4/R5）—— owner 2026-11-16 的 5 个 P1 里，批量转账
 * 独占两条：发送失败后「重新提交」重发上一笔（attempt 只在拿到 hash 后才更新），以及
 * 首次失败时按钮无响应（根本没有 attempt）。另外两条是离页丢失（无持久化）与跨账户。
 */

const SELF = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const OTHER = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const ROW_A = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955';
const ROW_B = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f';
const HASH = `0x${'ab'.repeat(32)}` as const;
const HASH_2 = `0x${'cd'.repeat(32)}` as const;

const SCOPE = createBatchScope(31337, SELF);

function requestOf(amountA: bigint, amountB: bigint): BatchRequest {
  return {
    mode: 'token',
    tokenAddress: TOKEN,
    tokenSymbol: 'TestLOVE20',
    tokenDecimals: 18,
    rows: [
      { address: ROW_A, amount: amountA },
      { address: ROW_B, amount: amountB },
    ],
    total: amountA + amountB,
    gasLimit: 234567,
    preBalances: [undefined, undefined],
    recipientHasCode: [undefined, undefined],
  };
}

const FIRST = requestOf(1000000000000000000n, 0n); // 100
const SECOND = requestOf(2000000000000000000n, 0n); // 200

const STORED: StoredBatch = {
  hash: HASH,
  chainId: 31337,
  account: SELF,
  kind: 'batch',
  request: FIRST,
  nonce: 9,
  recordedAt: 1_700_000_000_000,
};

const { writeMock, simulateMock, pendingNonceMock, snapshotMock, refreshSpy, watchState, approvedSpy, confirmedSpy } =
  vi.hoisted(() => ({
    writeMock: vi.fn(),
    simulateMock: vi.fn(),
    pendingNonceMock: vi.fn(),
    snapshotMock: vi.fn(),
    refreshSpy: vi.fn(),
    approvedSpy: vi.fn(),
    confirmedSpy: vi.fn(),
    watchState: {
      value: {
        status: 'idle',
        hash: null as string | null,
        receipt: null as unknown,
        submittedNonce: undefined as number | undefined,
        remainingMs: 0,
        remainingSeconds: 0,
        isStuck: false,
        isSettled: false,
        refresh: () => {},
      },
    },
  }));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: SELF }),
  useChainId: () => 31337,
  usePublicClient: () => ({ simulateContract: simulateMock }),
  useWriteContract: () => ({ writeContractAsync: writeMock }),
}));

vi.mock('@/shared/model/use-tx-watch', () => ({
  useTxWatch: () => watchState.value,
  usePendingNonce: () => pendingNonceMock,
  readResubmitSnapshot: () => snapshotMock(),
}));

const UNKNOWN_SNAPSHOT: ResubmitSnapshot = {
  receiptStatus: null,
  txNonce: null,
  latestNonce: undefined,
  pendingNonce: undefined,
};

function renderBatch() {
  return renderHook(() =>
    useBatchTransaction({ onApproved: approvedSpy, onBatchConfirmed: confirmedSpy }),
  );
}

function resetWatch(): void {
  watchState.value = {
    status: 'idle',
    hash: null,
    receipt: null,
    submittedNonce: undefined,
    remainingMs: 0,
    remainingSeconds: 0,
    isStuck: false,
    isSettled: false,
    refresh: refreshSpy,
  };
}

beforeEach(() => {
  cache.clearAll();
  writeMock.mockReset();
  simulateMock.mockReset();
  simulateMock.mockResolvedValue({});
  pendingNonceMock.mockReset();
  pendingNonceMock.mockResolvedValue(undefined);
  snapshotMock.mockReset();
  snapshotMock.mockResolvedValue(UNKNOWN_SNAPSHOT);
  refreshSpy.mockReset();
  approvedSpy.mockReset();
  confirmedSpy.mockReset();
  resetWatch();
});

describe('useBatchTransaction 不重放上一笔（R1）', () => {
  it('re-sends the request that just failed, not the previous successful batch', async () => {
    const { result, rerender } = renderBatch();

    // 上一笔 100 成功成交。
    writeMock.mockResolvedValue(HASH_2);
    await act(async () => {
      await result.current.submit(FIRST);
    });
    watchState.value = {
      ...watchState.value,
      status: 'confirmed',
      hash: HASH_2,
      receipt: { status: 'success', logs: [] },
      isSettled: true,
    };
    rerender();
    expect(confirmedSpy).toHaveBeenCalledWith(HASH_2, FIRST);
    await act(async () => {});
    expect(result.current.pendingKind).toBeNull();

    // 下一笔 200 发送失败。
    writeMock.mockClear();
    writeMock.mockRejectedValue(new Error('user rejected'));
    await act(async () => {
      await result.current.submit(SECOND);
    });
    expect(result.current.error).not.toBeNull();

    // 重试：必须是 200 这一笔的参数。
    writeMock.mockClear();
    writeMock.mockResolvedValue(HASH_2);
    await act(async () => {
      result.current.resubmit();
    });
    const call = writeMock.mock.calls[0]?.[0] as { args: readonly unknown[] } | undefined;
    expect(call).toBeDefined();
    expect(call?.args[2]).toEqual([2000000000000000000n, 0n]);
  });

  it('keeps a retryable attempt when the very first send fails (button not dead)', async () => {
    const { result } = renderBatch();
    writeMock.mockRejectedValue(new Error('user rejected'));

    await act(async () => {
      await result.current.submit(FIRST);
    });
    expect(result.current.error).not.toBeNull();

    writeMock.mockClear();
    writeMock.mockResolvedValue(HASH_2);
    await act(async () => {
      result.current.resubmit();
    });
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(result.current.pendingKind).toBe('batch');
  });
});

describe('useBatchTransaction 重试复核（R2）', () => {
  it('does not send when the original batch already confirmed during the re-check', async () => {
    const { result } = renderBatch();
    writeMock.mockResolvedValue(HASH_2);
    await act(async () => {
      await result.current.submit(FIRST);
    });
    snapshotMock.mockResolvedValue({
      receiptStatus: 'success',
      txNonce: 9,
      latestNonce: 9,
      pendingNonce: 9,
    });
    writeMock.mockClear();

    await act(async () => {
      result.current.resubmit();
    });

    expect(writeMock).not.toHaveBeenCalled();
    expect(confirmedSpy).toHaveBeenCalledWith(HASH_2, FIRST);
  });

  it('replaces a still-queued batch at its original nonce', async () => {
    const { result } = renderBatch();
    writeMock.mockResolvedValue(HASH_2);
    await act(async () => {
      await result.current.submit(FIRST);
    });
    snapshotMock.mockResolvedValue({
      receiptStatus: null,
      txNonce: 9,
      latestNonce: 8,
      pendingNonce: 12,
    });
    writeMock.mockClear();

    await act(async () => {
      result.current.resubmit();
    });
    expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({ nonce: 9 }));
  });

  it('stops when another transaction took the nonce (replaced)', async () => {
    const { result } = renderBatch();
    pendingNonceMock.mockResolvedValue(9);
    writeMock.mockResolvedValue(HASH_2);
    await act(async () => {
      await result.current.submit(FIRST);
    });
    snapshotMock.mockResolvedValue({
      receiptStatus: null,
      txNonce: null,
      latestNonce: 10,
      pendingNonce: 10,
    });
    writeMock.mockClear();

    await act(async () => {
      result.current.resubmit();
    });
    expect(writeMock).not.toHaveBeenCalled();
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('never signs blind when the re-check cannot read the chain', async () => {
    const { result } = renderBatch();
    writeMock.mockResolvedValue(HASH_2);
    await act(async () => {
      await result.current.submit(FIRST);
    });
    snapshotMock.mockResolvedValue({
      receiptStatus: undefined,
      txNonce: undefined,
      latestNonce: undefined,
      pendingNonce: undefined,
    });
    writeMock.mockClear();

    await act(async () => {
      result.current.resubmit();
    });
    expect(writeMock).not.toHaveBeenCalled();
    expect(result.current.error?.message).toBe(copy.txWatch.nonceUnavailable);
  });
});

describe('useBatchTransaction 首笔 nonce（R5）', () => {
  it('pins pending (latest+1) on the first send instead of the mined count', async () => {
    pendingNonceMock.mockResolvedValue(4); // 链上 latest=3，钱包里已有一笔 pending
    const { result } = renderBatch();
    writeMock.mockResolvedValue(HASH_2);

    await act(async () => {
      await result.current.submit(FIRST);
    });

    expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({ nonce: 4 }));
    expect(readStoredBatch(SCOPE)?.nonce).toBe(4);
  });
});

describe('useBatchTransaction 离页/刷新恢复（R4）', () => {
  it('restores the in-flight batch and blocks a second submission', async () => {
    writeStoredBatch(SCOPE, STORED);
    const { result } = renderBatch();

    expect(result.current.pendingKind).toBe('batch');
    expect(result.current.stage).toBe('pending');
    expect(readStoredBatch(SCOPE)?.hash).toBe(HASH);

    await act(async () => {
      await result.current.submit(SECOND);
    });
    expect(writeMock).not.toHaveBeenCalled();
    expect(readStoredBatch(SCOPE)?.hash).toBe(HASH);
  });

  it('restores an attempt that never got a hash as a retryable state', async () => {
    writeStoredBatch(SCOPE, { ...STORED, hash: null });
    const { result } = renderBatch();
    expect(result.current.pendingKind).toBeNull();

    writeMock.mockResolvedValue(HASH_2);
    await act(async () => {
      result.current.resubmit();
    });
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(result.current.pendingKind).toBe('batch');
  });

  it('clears the persisted task once the batch settles', async () => {
    writeStoredBatch(SCOPE, STORED);
    const { result, rerender } = renderBatch();
    watchState.value = {
      ...watchState.value,
      status: 'confirmed',
      hash: HASH,
      receipt: { status: 'success', logs: [] },
      isSettled: true,
    };
    rerender();
    await act(async () => {});
    expect(readStoredBatch(SCOPE)).toBeNull();
    expect(result.current.pendingKind).toBeNull();
  });
});

describe('useBatchTransaction 账户归属（R3）', () => {
  it('never restores another wallet’s in-flight batch', () => {
    writeStoredBatch(createBatchScope(31337, OTHER), { ...STORED, account: OTHER });
    const { result } = renderBatch();
    expect(result.current.pendingKind).toBeNull();
  });

  it('clears a record whose embedded owner is another wallet and says so neutrally', () => {
    writeStoredBatch(SCOPE, { ...STORED, account: OTHER });
    const { result } = renderBatch();
    expect(result.current.pendingKind).toBeNull();
    expect(result.current.error?.message).toBe(copy.txWatch.ownerChanged);
    expect(readStoredBatch(SCOPE)).toBeNull();
  });
});
