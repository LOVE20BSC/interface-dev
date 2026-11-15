import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cache } from '@/shared/lib/cache';
import { copy } from '@/shared/config/copy-pages';
import type { ResubmitSnapshot } from '@/shared/lib/tx-resubmit';
import { useTransferTransaction } from '@/features/transfer-token/model/use-transfer-transaction';
import {
  createTransferScope,
  readStoredTransfer,
  writeStoredTransfer,
  type StoredTransfer,
} from '@/features/transfer-token/lib/transfer-record';

const SELF = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const OTHER = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const RECIPIENT = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955';
const HASH = `0x${'ab'.repeat(32)}` as const;
const HASH_2 = `0x${'cd'.repeat(32)}` as const;

const SCOPE = createTransferScope(31337, SELF);
const OTHER_SCOPE = createTransferScope(31337, OTHER);

const STORED: StoredTransfer = {
  hash: HASH,
  chainId: 31337,
  account: SELF,
  token: { kind: 'community', address: TOKEN, symbol: 'TestLOVE20', decimals: 18 },
  amount: 1000000000000000000n,
  recipient: RECIPIENT,
  recipientLabel: undefined,
  nonce: 7,
  confirmed: false,
  recordedAt: 1_700_000_000_000,
};

const REQUEST = {
  token: { kind: 'community', address: TOKEN, symbol: 'TestLOVE20', decimals: 18 },
  amount: 1000000000000000000n,
  recipient: RECIPIENT,
  recipientLabel: undefined,
} as const;

const NEXT_REQUEST = {
  ...REQUEST,
  amount: 2000000000000000000n,
  recipient: OTHER,
} as const;

interface WatchLike {
  status: string;
  hash: string | null;
  receipt: { status: 'success' | 'reverted'; logs: unknown[] } | null;
  submittedNonce: number | undefined;
  remainingMs: number;
  remainingSeconds: number;
  isStuck: boolean;
  isSettled: boolean;
  refresh: () => void;
}

const { sendMock, writeMock, pendingNonceMock, snapshotMock, refreshSpy, watchState } = vi.hoisted(
  () => ({
    sendMock: vi.fn(),
    writeMock: vi.fn(),
    pendingNonceMock: vi.fn(),
    snapshotMock: vi.fn(),
    refreshSpy: vi.fn(),
    watchState: {
      value: {
        status: 'idle',
        hash: null,
        receipt: null,
        submittedNonce: undefined,
        remainingMs: 0,
        remainingSeconds: 0,
        isStuck: false,
        isSettled: false,
        refresh: () => {},
      } as WatchLike,
    },
  }),
);

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: SELF }),
  useChainId: () => 31337,
  usePublicClient: () => undefined,
  useSendTransaction: () => ({ sendTransactionAsync: sendMock }),
  useWriteContract: () => ({ writeContractAsync: writeMock }),
}));

vi.mock('@/shared/model/use-tx-watch', () => ({
  useTxWatch: () => watchState.value,
  // A new operation pins the pool-aware nonce (R5); 重新提交 re-checks the chain
  // through `readResubmitSnapshot` instead of reading a bare nonce (R2).
  usePendingNonce: () => pendingNonceMock,
  readResubmitSnapshot: () => snapshotMock(),
}));

const UNKNOWN_SNAPSHOT: ResubmitSnapshot = {
  receiptStatus: null,
  txNonce: null,
  latestNonce: undefined,
  pendingNonce: undefined,
};

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

function minedSuccess(hash: `0x${string}`): WatchLike {
  return {
    ...watchState.value,
    status: 'confirmed',
    hash,
    receipt: { status: 'success', logs: [] },
    isSettled: true,
  };
}

beforeEach(() => {
  cache.clearAll();
  sendMock.mockReset();
  writeMock.mockReset();
  pendingNonceMock.mockReset();
  pendingNonceMock.mockResolvedValue(undefined);
  snapshotMock.mockReset();
  snapshotMock.mockResolvedValue(UNKNOWN_SNAPSHOT);
  refreshSpy.mockReset();
  resetWatch();
});

describe('useTransferTransaction 刷新恢复（D1/R4）', () => {
  it('starts empty when nothing was persisted', () => {
    const { result } = renderHook(() => useTransferTransaction(() => {}));
    expect(result.current.isHydrating).toBe(false);
    expect(result.current.pendingHash).toBeNull();
    expect(result.current.restoredRecord).toBeNull();
  });

  it('restores an unconfirmed hash as the pending transfer (pending card + watch)', () => {
    writeStoredTransfer(SCOPE, STORED);
    const { result } = renderHook(() => useTransferTransaction(() => {}));
    expect(result.current.isHydrating).toBe(false);
    expect(result.current.pendingHash).toBe(HASH);
    // The in-flight transfer owns the page: the CTA is blocked, not just silent.
    expect(result.current.stage).toBe('pending');
  });

  it('refuses a second submission while the restored transfer is in flight', async () => {
    writeStoredTransfer(SCOPE, STORED);
    const { result } = renderHook(() => useTransferTransaction(() => {}));

    await act(async () => {
      await result.current.submit(REQUEST);
    });

    expect(writeMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(result.current.pendingHash).toBe(HASH);
    // The persisted task is untouched: still the same single hash.
    expect(readStoredTransfer(SCOPE)?.hash).toBe(HASH);
  });

  it('restores a confirmed transfer as the success strip only (D4, no receipt replay)', () => {
    writeStoredTransfer(SCOPE, { ...STORED, confirmed: true });
    const { result } = renderHook(() => useTransferTransaction(() => {}));
    expect(result.current.pendingHash).toBeNull();
    expect(result.current.receipt).toBeNull();
    expect(result.current.restoredRecord?.hash).toBe(HASH);
    expect(result.current.restoredRecord?.tokenSymbol).toBe('TestLOVE20');
    expect(result.current.restoredRecord?.amount).toBe(1000000000000000000n);
  });
});

describe('useTransferTransaction 提交与持久化', () => {
  it('persists the pending task right after the wallet returns a hash', async () => {
    writeMock.mockResolvedValue(HASH_2);
    const { result } = renderHook(() => useTransferTransaction(() => {}));

    await act(async () => {
      await result.current.submit(REQUEST);
    });

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(result.current.pendingHash).toBe(HASH_2);
    const stored = readStoredTransfer(SCOPE);
    expect(stored?.hash).toBe(HASH_2);
    expect(stored?.confirmed).toBe(false);
    // R3: the record names the wallet/chain that signed it.
    expect(stored?.chainId).toBe(31337);
    expect(stored?.account).toBe(SELF);

    // A second click in the same in-flight window must never send again.
    await act(async () => {
      await result.current.submit(REQUEST);
    });
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it('pins the pool-aware pending nonce on the first send (R5)', async () => {
    pendingNonceMock.mockResolvedValue(4);
    writeMock.mockResolvedValue(HASH_2);
    const { result } = renderHook(() => useTransferTransaction(() => {}));

    await act(async () => {
      await result.current.submit(REQUEST);
    });

    // latest=3 / pending=4: the fresh transfer must take 4, not 3.
    expect(pendingNonceMock).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({ nonce: 4 }));
    expect(readStoredTransfer(SCOPE)?.nonce).toBe(4);
  });

  it('flips the stored task to confirmed when the receipt is mined, keeping the strip', async () => {
    writeMock.mockResolvedValue(HASH_2);
    const confirmed = vi.fn();
    const { result, rerender } = renderHook(() => useTransferTransaction(confirmed));

    await act(async () => {
      await result.current.submit(REQUEST);
    });

    watchState.value = minedSuccess(HASH_2);
    rerender();

    expect(result.current.pendingHash).toBeNull();
    expect(result.current.receipt?.hash).toBe(HASH_2);
    expect(result.current.receipt?.amount).toBe(1000000000000000000n);
    expect(confirmed).toHaveBeenCalled();
    expect(readStoredTransfer(SCOPE)?.confirmed).toBe(true);
  });

  it('drops the stored task when the transaction reverts on chain', async () => {
    writeMock.mockResolvedValue(HASH_2);
    const { result, rerender } = renderHook(() => useTransferTransaction(() => {}));

    await act(async () => {
      await result.current.submit(REQUEST);
    });
    expect(readStoredTransfer(SCOPE)).not.toBeNull();

    watchState.value = {
      ...watchState.value,
      status: 'reverted',
      hash: HASH_2,
      receipt: { status: 'reverted', logs: [] },
      isSettled: true,
    };
    rerender();

    expect(result.current.receipt).toBeNull();
    expect(result.current.error?.message).toBe('交易上链了，但没有成功。你的资产没有变化。');
    expect(readStoredTransfer(SCOPE)).toBeNull();
  });
});

describe('useTransferTransaction 重试（R1）', () => {
  it('re-sends the request that just failed, never the previous successful one', async () => {
    const { result, rerender } = renderHook(() => useTransferTransaction(() => {}));

    // 第一笔成功 → 成交 → 关掉回执（pending/receipt 都清掉，attempt 也必须前进）。
    writeMock.mockResolvedValue(HASH_2);
    await act(async () => {
      await result.current.submit(REQUEST);
    });
    watchState.value = minedSuccess(HASH_2);
    rerender();
    expect(result.current.receipt?.hash).toBe(HASH_2);
    act(() => result.current.clearReceipt());

    // 第二笔：钱包拒绝，没有 hash。
    writeMock.mockRejectedValue(new Error('user rejected'));
    await act(async () => {
      await result.current.submit(NEXT_REQUEST);
    });
    expect(result.current.error).not.toBeNull();
    writeMock.mockClear();

    // 「重试」必须重发第二笔（200 / OTHER），不能重发第一笔（100 / RECIPIENT）。
    await act(async () => {
      result.current.resubmit();
    });
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        functionName: 'transfer',
        args: [OTHER, 2000000000000000000n],
      }),
    );
  });

  it('keeps a retryable attempt when the very first send fails (no dead button)', async () => {
    writeMock.mockRejectedValue(new Error('user rejected'));
    const { result } = renderHook(() => useTransferTransaction(() => {}));

    await act(async () => {
      await result.current.submit(REQUEST);
    });
    writeMock.mockClear();
    writeMock.mockResolvedValue(HASH_2);

    await act(async () => {
      result.current.resubmit();
    });
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(result.current.pendingHash).toBe(HASH_2);
  });
});

describe('useTransferTransaction 重试绑定原哈希与原 nonce（R2）', () => {
  it('replaces a still-queued transfer at its ORIGINAL nonce, not the pool’s next one', async () => {
    writeMock.mockResolvedValue(HASH_2);
    const { result } = renderHook(() => useTransferTransaction(() => {}));

    await act(async () => {
      await result.current.submit(REQUEST);
    });
    // 原交易还在池里 nonce 7；池里前面还排着别的交易（pending 9）。
    snapshotMock.mockResolvedValue({
      receiptStatus: null,
      txNonce: 7,
      latestNonce: 6,
      pendingNonce: 9,
    });
    writeMock.mockClear();

    await act(async () => {
      result.current.resubmit();
    });

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenLastCalledWith(expect.objectContaining({ nonce: 7 }));
  });

  it('does not send when the original transfer confirmed while the re-check ran (only 1 send)', async () => {
    writeMock.mockResolvedValue(HASH_2);
    const { result } = renderHook(() => useTransferTransaction(() => {}));

    await act(async () => {
      await result.current.submit(REQUEST);
    });
    expect(writeMock).toHaveBeenCalledTimes(1);

    // 复核读到回执：原交易已成交，重试绝不能发第二笔。
    snapshotMock.mockResolvedValue({
      receiptStatus: 'success',
      txNonce: 7,
      latestNonce: 7,
      pendingNonce: 7,
    });
    writeMock.mockClear();
    await act(async () => {
      result.current.resubmit();
    });

    expect(writeMock).not.toHaveBeenCalled();
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('does not send when another transaction took the nonce (replaced)', async () => {
    // R5 pins the original nonce at submit time, which is what lets the re-check
    // recognise 「这笔 nonce 已经被别人吃掉」 instead of re-sending blind.
    pendingNonceMock.mockResolvedValue(7);
    writeMock.mockResolvedValue(HASH_2);
    const { result } = renderHook(() => useTransferTransaction(() => {}));

    await act(async () => {
      await result.current.submit(REQUEST);
    });
    snapshotMock.mockResolvedValue({
      receiptStatus: null,
      txNonce: null,
      latestNonce: 9,
      pendingNonce: 9,
    });
    writeMock.mockClear();

    await act(async () => {
      result.current.resubmit();
    });
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('never signs blind when the re-check reads fail', async () => {
    writeMock.mockResolvedValue(HASH_2);
    const { result } = renderHook(() => useTransferTransaction(() => {}));

    await act(async () => {
      await result.current.submit(REQUEST);
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

  it('re-sends a dropped transfer at the pool nonce (heal)', async () => {
    pendingNonceMock.mockResolvedValue(8);
    writeMock.mockResolvedValue(HASH_2);
    const { result } = renderHook(() => useTransferTransaction(() => {}));

    await act(async () => {
      await result.current.submit(REQUEST);
    });
    snapshotMock.mockResolvedValue({
      receiptStatus: null,
      txNonce: null,
      latestNonce: 8,
      pendingNonce: 8,
    });
    writeMock.mockClear();
    writeMock.mockResolvedValue(HASH_2);

    await act(async () => {
      result.current.resubmit();
    });
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenLastCalledWith(expect.objectContaining({ nonce: 8 }));
  });
});

describe('useTransferTransaction 账户归属（R3）', () => {
  it('never restores another wallet’s pending transfer as a submittable task', () => {
    writeStoredTransfer(OTHER_SCOPE, { ...STORED, account: OTHER });
    const { result } = renderHook(() => useTransferTransaction(() => {}));
    // 当前钱包是 SELF：B 的待确认请求既不出现也不可提交。
    expect(result.current.pendingHash).toBeNull();
    expect(result.current.isHydrating).toBe(false);
  });

  it('clears a record whose embedded owner is another wallet and says so neutrally', () => {
    // 同 scope 下但记录内写着旧账户（旧版本/被改写的记录）：不能代签。
    writeStoredTransfer(SCOPE, { ...STORED, account: OTHER });
    const { result } = renderHook(() => useTransferTransaction(() => {}));

    expect(result.current.pendingHash).toBeNull();
    expect(result.current.error?.message).toBe(copy.txWatch.ownerChanged);
    expect(readStoredTransfer(SCOPE)).toBeNull();
  });
});
