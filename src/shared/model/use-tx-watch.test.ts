import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';

/**
 * The wagmi client is the only browser/chain dependency of the watcher, so it is
 * mocked at the module boundary. Everything below (deadline, nonce gap,
 * replacement lookup, stop-on-terminal, unmount) exercises the real hook + the
 * real pure state machine.
 */
const wagmiMock = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock('wagmi', () => ({ usePublicClient: () => wagmiMock.client }));

import {
  readResubmitSnapshot,
  useNextNonce,
  usePendingNonce,
  useTxWatch,
  type TxReadClient,
} from './use-tx-watch';

const WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const HASH = `0x${'ab'.repeat(32)}` as const;
const REPLACEMENT = `0x${'cd'.repeat(32)}` as const;
const DEADLINE_MS = 1_000;
const POLL_MS = 250;

function notFound(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

interface FakeClient {
  readonly client: PublicClient;
  readonly calls: {
    readonly receipt: ReturnType<typeof vi.fn>;
    readonly tx: ReturnType<typeof vi.fn>;
    readonly nonce: ReturnType<typeof vi.fn>;
    readonly blockNumber: ReturnType<typeof vi.fn>;
    readonly block: ReturnType<typeof vi.fn>;
  };
}

interface FakeClientOverrides {
  readonly receipt?: () => Promise<unknown>;
  readonly tx?: () => Promise<unknown>;
  readonly nonce?: (args?: { blockTag?: string }) => Promise<number>;
  readonly blockNumber?: () => Promise<bigint>;
  readonly block?: () => Promise<unknown>;
}

function makeClient(overrides: FakeClientOverrides = {}): FakeClient {
  const receipt = vi.fn(
    overrides.receipt ?? (() => Promise.reject(notFound('TransactionReceiptNotFoundError'))),
  );
  const tx = vi.fn(overrides.tx ?? (() => Promise.reject(notFound('TransactionNotFoundError'))));
  const nonce = vi.fn(overrides.nonce ?? (() => Promise.resolve(3)));
  const blockNumber = vi.fn(overrides.blockNumber ?? (() => Promise.resolve(10n)));
  const block = vi.fn(overrides.block ?? (() => Promise.resolve({ transactions: [] })));
  const client = {
    getTransactionReceipt: receipt,
    getTransaction: tx,
    getTransactionCount: nonce,
    getBlockNumber: blockNumber,
    getBlock: block,
  } as unknown as PublicClient;
  return { client, calls: { receipt, tx, nonce, blockNumber, block } };
}

async function flush(ms = 1): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderWatch(client: FakeClient) {
  wagmiMock.client = client.client;
  return renderHook(() =>
    useTxWatch({
      hash: HASH,
      wallet: WALLET,
      deadlineMs: DEADLINE_MS,
      pollIntervalMs: POLL_MS,
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  wagmiMock.client = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTxWatch', () => {
  it('does not poll when there is no hash', async () => {
    const fake = makeClient();
    wagmiMock.client = fake.client;
    renderHook(() =>
      useTxWatch({ hash: null, wallet: WALLET, deadlineMs: DEADLINE_MS, pollIntervalMs: POLL_MS }),
    );
    await flush(5_000);
    expect(fake.calls.receipt).not.toHaveBeenCalled();
    expect(fake.calls.tx).not.toHaveBeenCalled();
  });

  it('stays pending while the receipt is unmined and the deadline has not passed', async () => {
    const fake = makeClient({ tx: () => Promise.resolve({ nonce: 3, from: WALLET }) });
    const { result } = renderWatch(fake);
    await flush();
    expect(result.current.status).toBe('pending');
    expect(result.current.remainingSeconds).toBeGreaterThan(0);
  });

  it('turns pending into slow when the deadline passes but the transaction is still in the pool', async () => {
    const fake = makeClient({ tx: () => Promise.resolve({ nonce: 3, from: WALLET }) });
    const { result } = renderWatch(fake);
    await flush();
    expect(result.current.status).toBe('pending');

    await flush(DEADLINE_MS + 1);
    expect(result.current.status).toBe('slow');
    expect(result.current.isStuck).toBe(true);
    expect(result.current.receipt).toBeNull();
  });

  it('turns pending into dropped when the deadline passes and the hash is unknown to the node', async () => {
    const fake = makeClient();
    const { result } = renderWatch(fake);
    await flush();
    expect(result.current.status).toBe('pending');

    await flush(DEADLINE_MS + 1);
    expect(result.current.status).toBe('dropped');
    expect(result.current.isStuck).toBe(true);
  });

  it('detects a nonce gap after it survives the grace window', async () => {
    const fake = makeClient({
      tx: () => Promise.resolve({ nonce: 68, from: WALLET }),
      nonce: () => Promise.resolve(3),
    });
    const { result } = renderWatch(fake);
    await flush();
    // One disagreeing read is noise, not a recovery card.
    expect(result.current.status).toBe('pending');
    await flush(11_000);
    expect(result.current.status).toBe('nonceGap');
    expect(result.current.isStuck).toBe(true);
  });

  it('does not call a transaction waiting behind another pending transaction a nonce gap', async () => {
    const fake = makeClient({
      tx: () => Promise.resolve({ nonce: 5, from: WALLET }),
      nonce: (args) => Promise.resolve(args?.blockTag === 'pending' ? 6 : 4),
    });
    const { result } = renderWatch(fake);
    await flush();
    await flush(11_000);
    // The pool can still reach nonce 5, so this must never become 「卡在钱包里」
    // (a passed deadline may still surface the plain slow card).
    expect(result.current.status).not.toBe('nonceGap');
    expect(result.current.status).toBe('slow');
  });

  it('reports a reverted receipt and stops polling', async () => {
    const fake = makeClient({
      receipt: () => Promise.resolve({ status: 'reverted', transactionHash: HASH, logs: [] }),
      tx: () => Promise.reject(notFound('TransactionNotFoundError')),
    });
    const { result } = renderWatch(fake);
    await flush();
    expect(result.current.status).toBe('reverted');
    expect(result.current.isSettled).toBe(true);

    const callsAfterSettle = fake.calls.receipt.mock.calls.length;
    await flush(5_000);
    expect(fake.calls.receipt.mock.calls.length).toBe(callsAfterSettle);
  });

  it('reports a confirmed receipt to the caller', async () => {
    const receipt = { status: 'success', transactionHash: HASH, logs: [] };
    const fake = makeClient({ receipt: () => Promise.resolve(receipt) });
    const { result } = renderWatch(fake);
    await flush();
    expect(result.current.status).toBe('confirmed');
    expect(result.current.receipt).toBe(receipt);
  });

  it('stops polling once a nonce gap is terminal', async () => {
    const fake = makeClient({
      tx: () => Promise.resolve({ nonce: 68, from: WALLET }),
      nonce: () => Promise.resolve(3),
    });
    const { result } = renderWatch(fake);
    await flush();
    await flush(11_000);
    expect(result.current.status).toBe('nonceGap');
    const callsAfterSettle = fake.calls.tx.mock.calls.length;
    await flush(5_000);
    expect(fake.calls.tx.mock.calls.length).toBe(callsAfterSettle);
  });

  it('detects a replacement mined with the same wallet+nonce', async () => {
    const fake = makeClient({
      tx: () => Promise.resolve({ nonce: 3, from: WALLET }),
      nonce: () => Promise.resolve(4),
      block: () =>
        Promise.resolve({
          transactions: [
            {
              hash: `0x${'00'.repeat(31)}11`,
              nonce: 3,
              from: '0x0000000000000000000000000000000000000001',
            },
            { hash: REPLACEMENT, nonce: 3, from: WALLET },
          ],
        }),
    });
    const { result } = renderWatch(fake);
    await flush();
    expect(result.current.status).toBe('replaced');
    expect(result.current.isStuck).toBe(true);

    const callsAfterSettle = fake.calls.tx.mock.calls.length;
    await flush(5_000);
    expect(fake.calls.tx.mock.calls.length).toBe(callsAfterSettle);
  });

  it('stops polling on unmount', async () => {
    const fake = makeClient({ tx: () => Promise.resolve({ nonce: 3, from: WALLET }) });
    const { unmount } = renderWatch(fake);
    await flush();
    const callsBeforeUnmount = fake.calls.tx.mock.calls.length;
    expect(callsBeforeUnmount).toBeGreaterThan(0);

    unmount();
    await flush(10_000);
    expect(fake.calls.tx.mock.calls.length).toBe(callsBeforeUnmount);
  });

  it('exposes the nonce the watched hash was observed with (R2 replacement target)', async () => {
    const fake = makeClient({ tx: () => Promise.resolve({ nonce: 3, from: WALLET }) });
    const { result } = renderWatch(fake);
    await flush();
    expect(result.current.submittedNonce).toBe(3);
  });
});

describe('useTxWatch · replaced 判定（P2）', () => {
  it('never reports a mined transaction as its own replacement', async () => {
    // The receipt read is behind (not-found) while the block already lists the
    // very hash we watch: the scan must skip it and keep the page pending, not
    // freeze it on 「这笔交易已经被替换或取消」 (owner P2).
    const fake = makeClient({
      tx: () => Promise.resolve({ nonce: 3, from: WALLET }),
      nonce: (args) => Promise.resolve(args?.blockTag === 'pending' ? 4 : 4),
      block: () =>
        Promise.resolve({
          transactions: [{ hash: HASH, nonce: 3, from: WALLET }],
        }),
    });
    const { result } = renderWatch(fake);
    await flush();
    expect(result.current.status).toBe('pending');

    // ...and a passed deadline must not turn it into `replaced` either.
    await flush(DEADLINE_MS + 1);
    expect(result.current.status).toBe('slow');
    expect(result.current.status).not.toBe('replaced');
  });

  it('keeps pending when the receipt read fails but the transaction is already mined', async () => {
    let receiptFails = true;
    const receipt = { status: 'success' as const, transactionHash: HASH, logs: [] };
    const fake = makeClient({
      receipt: () =>
        receiptFails ? Promise.reject(new Error('rpc hiccup')) : Promise.resolve(receipt),
      tx: () => Promise.resolve({ nonce: 3, from: WALLET }),
      nonce: (args) => Promise.resolve(args?.blockTag === 'pending' ? 3 : 4),
      block: () =>
        Promise.resolve({
          transactions: [{ hash: HASH, nonce: 3, from: WALLET }],
        }),
    });
    const { result } = renderWatch(fake);
    await flush();
    // A failed read proves nothing: the watcher must not scan for a replacement.
    expect(result.current.status).toBe('pending');
    expect(fake.calls.block).not.toHaveBeenCalled();

    // Next poll reads the receipt: the transaction is simply confirmed.
    receiptFails = false;
    await flush(POLL_MS);
    expect(result.current.status).toBe('confirmed');
    expect(result.current.receipt).toBe(receipt);
  });
});

describe('nonce 读取函数（R5）', () => {
  it('reads the pool-aware pending nonce for a NEW operation (latest+1 when one is queued)', async () => {
    const fake = makeClient({
      nonce: (args) => Promise.resolve(args?.blockTag === 'pending' ? 4 : 3),
    });
    wagmiMock.client = fake.client;
    const { result } = renderHook(() => usePendingNonce(WALLET));
    await flush();
    const nonce = await act(async () => result.current());
    // latest=3 but pending=4: a new operation must take 4, never 3.
    expect(nonce).toBe(4);
    expect(fake.calls.nonce).toHaveBeenCalledWith({ address: WALLET, blockTag: 'pending' });
  });

  it('keeps the legacy heal reader on `latest` so the swap recovery behaviour is unchanged', async () => {
    const fake = makeClient({
      nonce: (args) => Promise.resolve(args?.blockTag === 'pending' ? 4 : 3),
    });
    wagmiMock.client = fake.client;
    const { result } = renderHook(() => useNextNonce(WALLET));
    await flush();
    const nonce = await act(async () => result.current());
    expect(nonce).toBe(3);
    expect(fake.calls.nonce).toHaveBeenCalledWith({ address: WALLET, blockTag: 'latest' });
  });
});

describe('readResubmitSnapshot（R2 重试前复核）', () => {
  const clientOf = (overrides: {
    receipt?: () => Promise<unknown>;
    tx?: () => Promise<unknown>;
    nonce?: (args?: { blockTag?: string }) => Promise<number>;
  }): TxReadClient => makeClient(overrides).client as unknown as TxReadClient;

  it('keeps a failed read distinguishable from "not mined"', async () => {
    const failed = await readResubmitSnapshot(
      clientOf({
        receipt: () => Promise.reject(new Error('rpc down')),
        tx: () => Promise.reject(new Error('rpc down')),
      }),
      WALLET,
      HASH,
    );
    expect(failed.receiptStatus).toBeUndefined();
    expect(failed.txNonce).toBeUndefined();

    const missing = await readResubmitSnapshot(clientOf({}), WALLET, HASH);
    expect(missing.receiptStatus).toBeNull();
    expect(missing.txNonce).toBeNull();

    const mined = await readResubmitSnapshot(
      clientOf({
        receipt: () => Promise.resolve({ status: 'reverted' }),
        tx: () => Promise.resolve({ nonce: 5 }),
        nonce: () => Promise.resolve(6),
      }),
      WALLET,
      HASH,
    );
    expect(mined).toEqual({
      receiptStatus: 'reverted',
      txNonce: 5,
      latestNonce: 6,
      pendingNonce: 6,
    });
  });

  it('returns unreadable unknowns when there is no client or wallet', async () => {
    expect(await readResubmitSnapshot(undefined, WALLET, HASH)).toEqual({
      receiptStatus: undefined,
      txNonce: undefined,
      latestNonce: undefined,
      pendingNonce: undefined,
    });
  });
});
