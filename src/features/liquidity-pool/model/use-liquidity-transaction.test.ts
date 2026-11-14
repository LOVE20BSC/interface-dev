import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApproveRequest } from '@/features/liquidity-pool/model/use-liquidity-transaction';

/**
 * P1 回归（QA D1）：授权额度用尽后**再授权同一个 token+spender**，页面必须能感知
 * 「授权又确认了一次」。旧实现把重读挂在 `approvedKey`（token+spender）变化上，第二次
 * 授权 key 不变 → allowance 永远不重读 → 主按钮永久禁用，只能刷新。
 *
 * 这里把链读（useTxWatch）与写钱包（useWriteContract）都挡在模块边界，只验证真实
 * hook 的授权状态机：每确认一次授权，`approveRevision` 就 +1（调用方据此无条件重读）。
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

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: ACCOUNT }),
  useWriteContract: () => ({
    writeContractAsync: async () => mock.nextHash(),
  }),
}));

vi.mock('@/shared/model/use-tx-watch', () => ({
  useNextNonce: () => async () => 1,
  useTxWatch: (options: { hash: `0x${string}` | null }) => {
    const receipt = options.hash !== null ? mock.receipts.get(options.hash) : undefined;
    return {
      status: receipt === undefined ? 'idle' : 'success',
      hash: options.hash,
      receipt: receipt ?? null,
      remainingMs: 0,
      remainingSeconds: 0,
      isStuck: false,
      isSettled: receipt !== undefined,
      refresh: () => {},
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

function confirmedReceipt(): { status: 'success' } {
  return { status: 'success' };
}

describe('useLiquidityTransaction · 再授权（QA D1/P1）', () => {
  it('每确认一次授权都会让 approveRevision 前进（同一个 token+spender 也不例外）', async () => {
    mock.reset();
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
