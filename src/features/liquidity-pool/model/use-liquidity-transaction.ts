import { useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { useWriteAttempt } from '@/shared/model/use-write-attempt';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import { createLiquidityScope } from '../lib/liquidity-record';
import {
  useLiquidityAttemptAdapter,
  type LiquidityApproveRequest as ApproveRequest,
  type LiquidityCall,
  type LiquidityReceipt,
} from './liquidity-attempt-adapter';

export type {
  LiquidityApproveRequest as ApproveRequest,
  LiquidityCall,
  LiquidityReceipt,
} from './liquidity-attempt-adapter';

/**
 * 加池 / 撤出的写链状态机：可选的「允许使用」+ 主交易两步，两步都走共享的
 * 有界等待（`useTxWatch`），所以钱包里卡住的交易不会变成死路，页面会给出
 * 恢复卡。
 *
 * 页面把准备好的调用（地址 + ABI + 参数）交给 `run`，hook 只负责签名、等待、
 * 失败翻译与回执；业务数值（数量、最少数量）都在页面侧按理论线算好，hook 不
 * 重算，避免两处公式不一致。
 *
 * 写链生命周期（stage / 两槽 / 回执 / 错误 / 卡住提示 / 恢复）由
 * `useWriteAttempt` + `useLiquidityAttemptAdapter` 持有；这里只把纯核 view 投影成
 * 面板冻结的字段（`error` 保留 `{message, kind?}`，`run`/`approve` 仍是 void 语义）。
 *
 * 恢复语义（owner 2026-11-23 移除交易重发）：
 * - 只有拿到哈希之后才落记录；签名失败只报错，不保留请求、不重试；
 * - `{chainId, account}` 与当前钱包不一致时清记录 + 中性提示，绝不代签
 *   （`to` 指向旧账户时尤其危险）；
 * - 待确认任务持久化在 `{chainId, wallet}` 作用域里，刷新/切页后恢复在途卡
 *   并继续 watch，在途期间禁止二次提交。
 */

export type LiquidityStage = 'idle' | 'wallet' | 'pending';

export interface LiquidityTxError {
  readonly message: string;
  readonly kind?: 'nonce' | 'staleBlock';
}

export interface LiquidityTransactionState {
  readonly stage: LiquidityStage;
  readonly approveStage: LiquidityStage;
  readonly approveHash: `0x${string}` | null;
  /**
   * 每成功确认一次授权就 +1。调用方据此**无条件重读 allowance**：
   * 同一个 token+spender 的第二次授权不会再改变任何 key，只听 key 变化会让页面
   * 停在「授权…」、主按钮永久禁用（QA D1/P1）。
   */
  readonly approveRevision: number;
  readonly receipt: LiquidityReceipt | null;
  readonly error: LiquidityTxError | null;
  readonly watch: TxWatch;
  readonly approveWatch: TxWatch;
  readonly approve: (request: ApproveRequest) => Promise<void>;
  readonly run: (call: LiquidityCall, note: { title: string; detail?: string }) => Promise<void>;
  readonly clearReceipt: () => void;
  readonly clearError: () => void;
}

type SettleStep = 'main' | 'approve';

interface PendingSettles {
  readonly main: Set<() => void>;
  readonly approve: Set<() => void>;
}

export function useLiquidityTransaction(onConfirmed: () => void): LiquidityTransactionState {
  const { address: account } = useAccount();
  const chainId = useChainId();

  const scope = useMemo(
    () => (account !== undefined ? createLiquidityScope(chainId, account) : null),
    [account, chainId],
  );

  const [pendingSettles] = useState<PendingSettles>(() => ({
    main: new Set(),
    approve: new Set(),
  }));

  // `run`/`approve` keep their pre-migration contract: the promise settles when
  // the wallet step ends (hash returned, or the send failed), which is what the
  // panels await. The core's own promise settles from a committed effect, so the
  // projection keeps a per-step settle signal at the adapter boundary; a refused
  // start (busy slot / still hydrating) settles immediately — nothing was sent.
  const settle = (step: SettleStep): void => {
    const waiting = pendingSettles[step];
    const resolvers = [...waiting];
    waiting.clear();
    for (const resolve of resolvers) resolve();
  };

  const waitFor = (step: SettleStep, start: () => Promise<boolean>): Promise<void> =>
    new Promise<void>((resolve) => {
      pendingSettles[step].add(resolve);
      void start().then((started) => {
        if (started) return;
        pendingSettles[step].delete(resolve);
        resolve();
      });
    });

  const adapter = useLiquidityAttemptAdapter({ scope, onConfirmed, onSendSettled: settle });
  const attempt = useWriteAttempt(adapter);

  const run = (call: LiquidityCall, note: { title: string; detail?: string }): Promise<void> =>
    waitFor('main', () => attempt.run({ kind: 'call', call, note }));

  const approve = (request: ApproveRequest): Promise<void> =>
    waitFor('approve', () => attempt.approve(request.tokenAddress, { kind: 'approve', request }));

  return {
    stage: attempt.stage,
    approveStage: attempt.approveStage,
    approveHash: attempt.approveHash,
    approveRevision: attempt.approveRevision,
    receipt: attempt.receipt,
    error: attempt.error,
    watch: attempt.watch,
    approveWatch: attempt.approveWatch,
    approve,
    run,
    clearReceipt: attempt.clearReceipt,
    clearError: attempt.clearError,
  };
}
