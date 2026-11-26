import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import {
  initialWriteAttemptState,
  reduceWriteAttempt,
  type ApprovePolicy,
  type PersistPolicy,
  type WriteAttempt,
  type WriteAttemptError,
  type WriteAttemptEvent,
  type WriteAttemptState,
  type WriteHash,
  type WriteStage,
  type WriteStep,
  isWriteAttemptOwner,
} from '@/shared/lib/write-attempt';
import { toUserMessage } from '@/shared/lib/errors';
import { usePendingNonce, useTxWatch, type TxWatch } from '@/shared/model/use-tx-watch';
import type { TransactionReceipt } from 'viem';

/**
 * 写链 adapter 的公共部分：两种落盘形态都要提供的成员。
 *
 * C 候选（2026-11-26）收口后，`approve` 与 `translate` 变成可选：
 * 治理域六条写链全是 `approve:'none'` + `toUserMessage`，让每份 adapter 各写一遍
 * 只是把同一个默认值抄六次。
 */
interface WriteAttemptAdapterBase<Intent, Receipt> {
  /** 授权阶梯形态，默认 `'none'`。 */
  readonly approve?: ApprovePolicy;
  readonly reverted: string;
  send(step: WriteStep, intent: Intent, nonce?: number): Promise<WriteHash>;
  parseReceipt(step: WriteStep, receipt: TransactionReceipt): Receipt | null;
  /** 发送失败/回滚的归一，默认 `toUserMessage`。 */
  translate?(cause: unknown): WriteAttemptError;
  onConfirmed?(): void;
}

/**
 * `persist:'afterHash'`：写尝试要在哈希之后落盘，因此必须给出记录端口与
 * 「记录属于上一个钱包/链」时的提示文案。
 */
interface PersistedAttemptPorts<Intent, Stored> {
  readonly persist: 'afterHash';
  readonly ownerChanged: string;
  readRecord(): WriteAttempt<Intent> | null;
  writeRecord(attempt: WriteAttempt<Intent>): Stored;
  clearRecord(): void;
}

/**
 * `persist:'none'` 是一种**标准形态**，不是「忘了填」：治理域六条写链都不落盘，
 * core 直接跳过 hydration，记录端口与 `ownerChanged` 永远不会被读取。所以这里
 * 用 `never` 明确禁止填写——填了就是接口放错了地方（C 候选要消灭的正是这五份
 * 逐字相同的 no-op 三连 + `ownerChanged = reverted`）。
 */
interface EphemeralAttemptPorts {
  readonly persist: 'none';
  readonly ownerChanged?: never;
  readonly readRecord?: never;
  readonly writeRecord?: never;
  readonly clearRecord?: never;
}

export type WriteAttemptAdapter<Intent, Receipt, Stored> = WriteAttemptAdapterBase<
  Intent,
  Receipt
> &
  (PersistedAttemptPorts<Intent, Stored> | EphemeralAttemptPorts);

/** 补齐默认值后的 adapter：hook 内部只认这个形状。 */
interface ResolvedWriteAttemptAdapter<Intent, Receipt, Stored> {
  readonly persist: PersistPolicy;
  readonly approve: ApprovePolicy;
  readonly ownerChanged: string;
  readonly reverted: string;
  readRecord(): WriteAttempt<Intent> | null;
  writeRecord(attempt: WriteAttempt<Intent>): Stored;
  clearRecord(): void;
  send(step: WriteStep, intent: Intent, nonce?: number): Promise<WriteHash>;
  parseReceipt(step: WriteStep, receipt: TransactionReceipt): Receipt | null;
  translate(cause: unknown): WriteAttemptError;
  onConfirmed?(): void;
}

/**
 * 把 adapter 补齐默认值。导出是为了让「接口即测试面」成立：落盘/不落盘两档的
 * 默认行为（端口、文案、授权形态）可以表驱动断言，不需要造 wagmi 上下文。
 */
export function resolveWriteAttemptAdapter<Intent, Receipt, Stored>(
  adapter: WriteAttemptAdapter<Intent, Receipt, Stored>,
): ResolvedWriteAttemptAdapter<Intent, Receipt, Stored> {
  const translate =
    adapter.translate ??
    ((cause: unknown): WriteAttemptError => ({ message: toUserMessage(cause) }));
  if (adapter.persist === 'afterHash') {
    return {
      ...adapter,
      approve: adapter.approve ?? 'none',
      translate,
    };
  }
  return {
    persist: 'none',
    approve: adapter.approve ?? 'none',
    // 不落盘形态下这两个字段永远不会被读取，给中性值只是为了形状统一。
    ownerChanged: '',
    reverted: adapter.reverted,
    readRecord: () => null,
    writeRecord: () => undefined as Stored,
    clearRecord: () => undefined,
    send: adapter.send,
    parseReceipt: adapter.parseReceipt,
    translate,
    ...(adapter.onConfirmed !== undefined ? { onConfirmed: adapter.onConfirmed } : {}),
  };
}

export interface WriteAttemptView<Intent, Receipt> {
  readonly stage: WriteStage;
  readonly approveStage: WriteStage;
  readonly receipt: Receipt | null;
  readonly error: WriteAttemptError | null;
  readonly watch: TxWatch;
  readonly approveWatch: TxWatch;
  readonly isHydrating: boolean;
  readonly approveRevision: number;
  readonly approveKey: string | undefined;
  readonly lastApproval: { readonly key?: string; readonly intent: Intent } | null;
  readonly pendingHash: WriteHash | null;
  readonly approveHash: WriteHash | null;
  readonly run: (intent: Intent) => Promise<boolean>;
  readonly approve: (key: string, intent: Intent) => Promise<boolean>;
  readonly clearReceipt: () => void;
  readonly clearError: () => void;
}

interface ResultResolvers {
  main: ((ok: boolean) => void) | undefined;
  approve: ((ok: boolean) => void) | undefined;
}

export function useWriteAttempt<Intent, Receipt, Stored>(
  adapter: WriteAttemptAdapter<Intent, Receipt, Stored>,
): WriteAttemptView<Intent, Receipt> {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const readPendingNonce = usePendingNonce(account);
  const resolved = resolveWriteAttemptAdapter(adapter);
  const [state, setState] = useState<WriteAttemptState<Intent, Receipt>>(() =>
    initialWriteAttemptState(resolved.persist === 'afterHash'),
  );
  const stateRef = useRef(state);
  const resolvers = useRef<ResultResolvers>({ main: undefined, approve: undefined });
  const adapterRef = useRef(resolved);
  // Keep the latest adapter for async effects; ref write is intentional.
  // eslint-disable-next-line react-hooks/refs
  adapterRef.current = resolved;

  const apply = (event: WriteAttemptEvent<Intent, Receipt>): void => {
    const current = adapterRef.current;
    const { state: next, effects } = reduceWriteAttempt(stateRef.current, event, {
      persist: current.persist,
      approve: current.approve,
    });
    stateRef.current = next;
    setState(next);
    for (const effect of effects) {
      if (effect.type === 'persist') {
        current.writeRecord(effect.attempt);
        continue;
      }
      if (effect.type === 'clear') {
        current.clearRecord();
        continue;
      }
      if (effect.type === 'notifySettled' || effect.type === 'notifyApproved') {
        current.onConfirmed?.();
        continue;
      }
      if (effect.type === 'readNonce') {
        void readPendingNonce().then((nonce) =>
          apply({ type: 'nonceRead', step: effect.step, nonce }),
        );
        continue;
      }
      if (effect.type === 'sign') {
        const step = effect.step;
        void current
          .send(step, effect.intent, effect.nonce)
          .then((hash) =>
            apply({
              type: 'signed',
              step,
              hash,
              ...(effect.nonce !== undefined ? { nonce: effect.nonce } : {}),
              ...(effect.key !== undefined ? { key: effect.key } : {}),
            }),
          )
          .catch((cause) => apply({ type: 'sendFailed', step, error: current.translate(cause) }));
      }
    }
  };

  // Hydrate once per wallet/chain: only an afterHash record exists, and it must
  // belong to the current wallet (T004 R3). Governance has no record by design.
  useEffect(() => {
    if (adapterRef.current.persist === 'none') {
      apply({ type: 'hydrateDone', attempt: null });
      return;
    }
    const attempt = adapterRef.current.readRecord();
    if (attempt === null) {
      apply({ type: 'hydrateDone', attempt: null });
      return;
    }
    if (account === undefined || !isWriteAttemptOwner(attempt, { chainId, account })) {
      adapterRef.current.clearRecord();
      apply({
        type: 'hydrateDone',
        attempt: null,
        error: { message: adapterRef.current.ownerChanged },
      });
      return;
    }
    apply({ type: 'hydrateDone', attempt });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydration is per wallet/chain only
  }, [account, chainId]);

  const mainHash = state.main.attempt?.hash ?? null;
  const approveHash = state.approval.attempt?.hash ?? null;
  const watch = useTxWatch({
    hash: mainHash,
    wallet: account,
    enabled: state.main.phase === 'pending' && mainHash !== null,
  });
  const approveWatch = useTxWatch({
    hash: approveHash,
    wallet: account,
    enabled: state.approval.phase === 'pending' && approveHash !== null,
  });

  useEffect(() => {
    if (state.main.phase !== 'pending' || watch.receipt === null) return;
    if (watch.receipt.status === 'reverted') {
      apply({ type: 'mainRevert', error: { message: adapterRef.current.reverted } });
      return;
    }
    const parsed = adapterRef.current.parseReceipt('main', watch.receipt);
    if (parsed === null) {
      apply({ type: 'mainRevert', error: { message: adapterRef.current.reverted } });
      return;
    }
    apply({ type: 'mainReceipt', receipt: parsed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.main.phase, watch.receipt]);

  useEffect(() => {
    if (state.approval.phase !== 'pending' || approveWatch.receipt === null) return;
    if (approveWatch.receipt.status === 'reverted') {
      apply({ type: 'approveRevert', error: { message: adapterRef.current.reverted } });
      return;
    }
    apply({ type: 'approveReceipt' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.approval.phase, approveWatch.receipt]);

  const run = (intent: Intent): Promise<boolean> => {
    if (
      account === undefined ||
      stateRef.current.main.phase !== 'idle' ||
      stateRef.current.isHydrating
    ) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      resolvers.current.main = resolve;
      apply({ type: 'run', intent, owner: { chainId, account } });
    });
  };

  const approve = (key: string, intent: Intent): Promise<boolean> => {
    if (account === undefined || adapterRef.current.approve === 'none')
      return Promise.resolve(false);
    if (stateRef.current.approval.phase !== 'idle') return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      resolvers.current.approve = resolve;
      apply({ type: 'approve', key, intent, owner: { chainId, account } });
    });
  };

  // Resolve the caller promise when the signed/sendFailed transition lands.
  const prevPhaseRef = useRef({ main: state.main.phase, approval: state.approval.phase });
  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev.main === 'wallet' && state.main.phase !== 'wallet') {
      resolvers.current.main?.(state.main.phase === 'pending');
      resolvers.current.main = undefined;
    }
    if (prev.approval === 'wallet' && state.approval.phase !== 'wallet') {
      resolvers.current.approve?.(state.approval.phase === 'pending');
      resolvers.current.approve = undefined;
    }
    prevPhaseRef.current = { main: state.main.phase, approval: state.approval.phase };
  }, [state.main.phase, state.approval.phase]);

  return useMemo(
    () => ({
      stage: state.main.phase,
      approveStage: state.approval.phase,
      receipt: state.receipt,
      error: state.error,
      watch,
      approveWatch,
      isHydrating: state.isHydrating,
      approveRevision: state.approveRevision,
      approveKey: state.approval.attempt?.key ?? state.lastApproval?.key,
      lastApproval: state.lastApproval,
      pendingHash: mainHash,
      approveHash,
      run,
      approve,
      clearReceipt: () => apply({ type: 'clearReceipt' }),
      clearError: () => apply({ type: 'clearError' }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply is stable enough for this view
    [state, watch, approveWatch, mainHash, approveHash],
  );
}
