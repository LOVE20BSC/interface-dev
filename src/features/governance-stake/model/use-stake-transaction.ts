import { useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { NETWORK, type HexAddress } from '@/config/networks';
import { useWriteAttempt } from '@/shared/model/use-write-attempt';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import { createStakeScope } from '../lib/stake-record';
import type { StakeReceipt, StakeReceiptAction } from '../lib/stake-receipt';
import {
  useStakeAttemptAdapter,
  type StakeApproveRequest,
  type StakeCall,
} from './stake-attempt-adapter';

export type { StakeApproveRequest, StakeCall } from './stake-attempt-adapter';

/**
 * 治理·质押的写链状态机：可选的「授权」+ 主交易两步，两步都走共享的有界等待
 * （`useTxWatch`），钱包里卡住的交易不会变成死路，页面给出恢复卡。
 *
 * 页面把准备好的调用（地址 + ABI + 参数）交给 `run`，hook 只负责签名、等待、
 * 失败翻译与回执；数量与治理权都在页面/领域层算好，这里不重算。
 *
 * 写链生命周期（stage / 两槽 / 回执 / 错误 / 卡住提示 / 恢复）由
 * `useWriteAttempt` + `useStakeAttemptAdapter` 持有；这里只把纯核 view 投影成
 * 面板冻结的字段（`error` 仍是字符串，`run`/`approve` 仍是 void 语义）。
 *
 * 恢复语义（owner 2026-11-23 移除交易重发）：
 * - 只有拿到哈希之后才落记录；签名失败只报错，不保留请求、不重试；
 * - 钱包/网络切换后清记录 + 中性提示，绝不代签；
 * - 在途任务持久化在缓存里，刷新/切页后恢复并继续 watch 同一个哈希。
 */

export type StakeStage = 'idle' | 'wallet' | 'pending';

export interface StakeTransactionState {
  readonly stage: StakeStage;
  readonly approveStage: StakeStage;
  /** 正在授权哪一枚代币：多枚代币各有一行授权按钮时，只有这一行显示进行中。 */
  readonly approveTokenAddress: HexAddress | undefined;
  /** 每成功确认一次授权就 +1：调用方据此无条件重读授权额度。 */
  readonly approveRevision: number;
  readonly receipt: StakeReceipt | null;
  readonly error: string | null;
  readonly watch: TxWatch;
  readonly approveWatch: TxWatch;
  readonly approve: (request: StakeApproveRequest) => Promise<void>;
  readonly run: (call: StakeCall, action: StakeReceiptAction) => Promise<void>;
  readonly clearReceipt: () => void;
  readonly clearError: () => void;
}

type SettleStep = 'main' | 'approve';

interface PendingSettles {
  readonly main: Set<() => void>;
  readonly approve: Set<() => void>;
}

export function useStakeTransaction(onConfirmed: () => void): StakeTransactionState {
  const { address: account } = useAccount();
  const chainId = useChainId();

  const scope = useMemo(
    () => (account !== undefined ? createStakeScope(chainId, account) : null),
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

  const adapter = useStakeAttemptAdapter({ scope, onConfirmed, onSendSettled: settle });
  const attempt = useWriteAttempt(adapter);

  const run = (call: StakeCall, action: StakeReceiptAction): Promise<void> =>
    waitFor('main', () => attempt.run({ kind: 'call', call, action }));

  const approve = (request: StakeApproveRequest): Promise<void> =>
    waitFor('approve', () => attempt.approve(request.tokenAddress, { kind: 'approve', request }));

  const approveStage = attempt.approveStage;

  return {
    stage: attempt.stage,
    approveStage,
    // Keyed by token address while the approval is in flight. The core keeps the
    // last approved key as well, so gate on the stage: only the row that is
    // actually waiting may show 进行中 (pre-migration semantics).
    approveTokenAddress:
      approveStage === 'idle' ? undefined : (attempt.approveKey as HexAddress | undefined),
    approveRevision: attempt.approveRevision,
    receipt: attempt.receipt,
    error: attempt.error?.message ?? null,
    watch: attempt.watch,
    approveWatch: attempt.approveWatch,
    approve,
    run,
    clearReceipt: attempt.clearReceipt,
    clearError: attempt.clearError,
  };
}

/** 错误上下文：钱包层错误只需要网络与代币符号，`toUserMessage` 已覆盖合约错误。 */
export const STAKE_ERROR_CONTEXT = {
  nativeSymbol: NETWORK.nativeCurrency.symbol,
};

export type { StakeCall as StakeWriteCall };
