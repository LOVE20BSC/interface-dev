import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cache } from '@/shared/lib/cache';
import { copy } from '@/shared/config/copy-pages';
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

const { sendMock, writeMock, pendingNonceMock, refreshSpy, watchState } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  writeMock: vi.fn(),
  pendingNonceMock: vi.fn(),
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
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: SELF }),
  useChainId: () => 31337,
  usePublicClient: () => undefined,
  useSendTransaction: () => ({ sendTransactionAsync: sendMock }),
  useWriteContract: () => ({ writeContractAsync: writeMock }),
}));

vi.mock('@/shared/model/use-tx-watch', () => ({
  useTxWatch: () => watchState.value,
  // A new operation pins the pool-aware nonce (R5).
  usePendingNonce: () => pendingNonceMock,
}));

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
