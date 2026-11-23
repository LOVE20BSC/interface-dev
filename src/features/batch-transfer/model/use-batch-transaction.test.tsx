import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cache } from '@/shared/lib/cache';
import { copy } from '@/shared/config/copy-pages';
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
 * 覆盖发送/刷新/owner；发送失败不再保留请求（T004）。
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

const {
  writeMock,
  simulateMock,
  pendingNonceMock,
  refreshSpy,
  watchState,
  approvedSpy,
  confirmedSpy,
} = vi.hoisted(() => ({
  writeMock: vi.fn(),
  simulateMock: vi.fn(),
  pendingNonceMock: vi.fn(),
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
}));

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
  refreshSpy.mockReset();
  approvedSpy.mockReset();
  confirmedSpy.mockReset();
  resetWatch();
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
