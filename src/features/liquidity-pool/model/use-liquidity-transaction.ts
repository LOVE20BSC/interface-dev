import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi';
import type { Abi } from 'viem';
import { love20TokenAbi, uniswapV2PairAbi } from '@/config/abis';
import { NETWORK, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import {
  readResubmitSnapshot,
  usePendingNonce,
  useTxWatch,
  type TxWatch,
} from '@/shared/model/use-tx-watch';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';
import { decideResubmit } from '@/shared/lib/tx-resubmit';
import { isSameTxOwner, type TxOwner } from '@/shared/lib/tx-owner';
import { describeLiquidityError } from '@/features/liquidity-pool/lib/liquidity-errors';
import {
  clearStoredLiquidity,
  createLiquidityScope,
  readStoredLiquidity,
  writeStoredLiquidity,
} from '@/features/liquidity-pool/lib/liquidity-record';

/**
 * 加池 / 撤出的写链状态机：可选的「允许使用」+ 主交易两步，两步都走共享的
 * 有界等待（`useTxWatch`），所以钱包里卡住的交易不会变成死路，页面会给出
 * 恢复卡与「重新提交」。
 *
 * 页面把准备好的调用（地址 + ABI + 参数）交给 `run`，hook 只负责签名、等待、
 * 失败翻译与回执；业务数值（数量、最少数量）都在页面侧按理论线算好，hook 不
 * 重算，避免两处公式不一致。
 *
 * 恢复加固（owner 2026-11-16）：
 * - R1：调用钱包**之前**就把 attempt（调用 + 文案 + `{chainId, account}`）落下来，
 *   发送失败也保留，所以「重试」永远重发本次失败的请求；
 * - R2：`重新提交` 先读回执/交易/nonce 再决定，原交易已成交就不发，仍排队就
 *   **用原 nonce** 替换；
 * - R3：`{chainId, account}` 与当前钱包不一致时清记录 + 中性提示，绝不代签
 *   （`to` 指向旧账户时尤其危险）；
 * - R4：待确认任务持久化在 `{chainId, wallet}` 作用域里，刷新/切页后恢复在途卡
 *   并继续 watch，在途期间禁止二次提交；
 * - R7：`重新提交` 前置加锁 + 钱包等待态，`finally` 释放，按钮点击期间禁点。
 */

export type LiquidityStage = 'idle' | 'wallet' | 'pending';

export interface LiquidityCall {
  readonly address: HexAddress;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly value?: bigint;
}

export interface LiquidityReceipt {
  readonly hash: `0x${string}`;
  readonly title: string;
  readonly detail: string | undefined;
  readonly recordedAt: number;
}

export interface LiquidityTxError {
  readonly message: string;
  readonly kind?: 'nonce' | 'staleBlock';
}

export interface ApproveRequest {
  readonly tokenAddress: HexAddress;
  /** `erc20` 是普通代币授权；`lp` 是给 Router 的流动性凭证授权。 */
  readonly kind: 'erc20' | 'lp';
  readonly spender: HexAddress;
  readonly amount: bigint;
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
  /** A 重新提交 is running: the recovery button must not be clickable again. */
  readonly isResubmitting: boolean;
  readonly approve: (request: ApproveRequest) => Promise<void>;
  readonly run: (call: LiquidityCall, note: { title: string; detail?: string }) => Promise<void>;
  readonly resubmit: () => void;
  readonly clearReceipt: () => void;
  readonly clearError: () => void;
}

interface PendingApprove {
  readonly hash: `0x${string}`;
  readonly owner: TxOwner;
  readonly request: ApproveRequest;
  readonly nonce: number | undefined;
}

interface PendingMain {
  readonly hash: `0x${string}`;
  readonly owner: TxOwner;
  readonly call: LiquidityCall;
  readonly note: { title: string; detail?: string };
  readonly nonce: number | undefined;
}

/** One attempt, remembered before the wallet opens (R1). */
interface MainAttempt extends TxOwner {
  readonly call: LiquidityCall;
  readonly note: { title: string; detail?: string };
  readonly hash: `0x${string}` | undefined;
  readonly nonce: number | undefined;
}

export function useLiquidityTransaction(onConfirmed: () => void): LiquidityTransactionState {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const readPendingNonce = usePendingNonce(account);

  const [pendingApprove, setPendingApprove] = useState<PendingApprove | null>(null);
  const [pendingMain, setPendingMain] = useState<PendingMain | null>(null);
  const [approveWalletAction, setApproveWalletAction] = useState(false);
  const [mainWalletAction, setMainWalletAction] = useState(false);
  const [approveRevision, setApproveRevision] = useState(0);
  const [receipt, setReceipt] = useState<LiquidityReceipt | null>(null);
  const [error, setError] = useState<LiquidityTxError | null>(null);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const submittingRef = useRef(false);
  const lastAttemptRef = useRef<MainAttempt | null>(null);

  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  });

  const scope = useMemo(
    () => (account !== undefined ? createLiquidityScope(chainId, account) : null),
    [account, chainId],
  );

  // R4: 刷新/切页后恢复在途主交易，继续 watch 同一个哈希，并挡住二次提交。
  /* eslint-disable react-hooks/set-state-in-effect -- hydration from the namespaced cache */
  useEffect(() => {
    setPendingApprove(null);
    setPendingMain(null);
    setReceipt(null);
    setError(null);
    setApproveWalletAction(false);
    setMainWalletAction(false);
    setIsResubmitting(false);
    submittingRef.current = false;
    lastAttemptRef.current = null;
    setIsHydrating(true);
    if (scope === null || account === undefined) {
      setIsHydrating(false);
      return;
    }
    const stored = readStoredLiquidity(scope);
    if (stored !== null) {
      const owner: TxOwner = { chainId: stored.chainId, account: stored.account };
      // R3: 别人的请求不能变成当前钱包可提交的状态，更不能被代签。
      if (!isSameTxOwner(owner, { chainId, account })) {
        clearStoredLiquidity(scope);
        setError({ message: copy.txWatch.ownerChanged });
        setIsHydrating(false);
        return;
      }
      if (stored.hash !== null) {
        setPendingMain({
          hash: stored.hash,
          owner,
          call: stored.call,
          note: stored.note,
          nonce: stored.nonce,
        });
      } else {
        lastAttemptRef.current = {
          ...owner,
          call: stored.call,
          note: stored.note,
          hash: undefined,
          nonce: stored.nonce,
        };
      }
    }
    setIsHydrating(false);
  }, [account, chainId, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const approveWatch = useTxWatch({
    hash: pendingApprove?.hash ?? null,
    wallet: account,
    walletAction: approveWalletAction,
    enabled: pendingApprove !== null,
  });
  const watch = useTxWatch({
    hash: pendingMain?.hash ?? null,
    wallet: account,
    walletAction: mainWalletAction,
    enabled: pendingMain !== null,
  });

  const approveReceipt = approveWatch.receipt;
  const mainReceipt = watch.receipt;

  /* eslint-disable react-hooks/set-state-in-effect -- a mined receipt is an external chain fact */
  useEffect(() => {
    if (pendingApprove === null || approveReceipt === null) return;
    if (approveReceipt.status === 'reverted') {
      setPendingApprove(null);
      setError({ message: copy.liquidity.errors.reverted });
      return;
    }
    setApproveRevision((current) => current + 1);
    setPendingApprove(null);
    setError(null);
  }, [approveReceipt, pendingApprove]);

  useEffect(() => {
    if (pendingMain === null || mainReceipt === null) return;
    if (mainReceipt.status === 'reverted') {
      if (scope !== null) clearStoredLiquidity(scope);
      lastAttemptRef.current = null;
      setPendingMain(null);
      setError({ message: copy.liquidity.errors.reverted });
      onConfirmedRef.current();
      return;
    }
    if (scope !== null) clearStoredLiquidity(scope);
    lastAttemptRef.current = null;
    setReceipt({
      hash: pendingMain.hash,
      title: pendingMain.note.title,
      detail: pendingMain.note.detail,
      recordedAt: Date.now(),
    });
    setPendingMain(null);
    setError(null);
    onConfirmedRef.current();
  }, [mainReceipt, pendingMain, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const signCall = async (
    call: LiquidityCall,
    nonce: number | undefined,
  ): Promise<`0x${string}`> =>
    writeContractAsync({
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
      ...(call.value !== undefined ? { value: call.value } : {}),
      ...(nonce !== undefined ? { nonce } : {}),
    });

  const persistAttempt = (attempt: MainAttempt): void => {
    lastAttemptRef.current = attempt;
    if (scope !== null) {
      writeStoredLiquidity(scope, {
        hash: attempt.hash ?? null,
        chainId: attempt.chainId,
        account: attempt.account,
        call: attempt.call,
        note: attempt.note,
        nonce: attempt.nonce,
        recordedAt: Date.now(),
      });
    }
  };

  /** Sign one attempt, adopt its hash and persist it before waiting. */
  const signAttempt = async (attempt: MainAttempt, nonce: number | undefined): Promise<void> => {
    const hash = await signCall(attempt.call, nonce);
    const settledNonce = nonce ?? attempt.nonce;
    persistAttempt({ ...attempt, hash, nonce: settledNonce });
    setPendingMain({
      hash,
      owner: { chainId: attempt.chainId, account: attempt.account },
      call: attempt.call,
      note: attempt.note,
      nonce: settledNonce,
    });
  };

  const approve = async (request: ApproveRequest): Promise<void> => {
    if (account === undefined || submittingRef.current) return;
    const owner: TxOwner = { chainId, account };
    setError(null);
    setApproveWalletAction(true);
    submittingRef.current = true;
    try {
      const abi = request.kind === 'lp' ? uniswapV2PairAbi : love20TokenAbi;
      const nonce = await readPendingNonce();
      const hash = await writeContractAsync({
        address: request.tokenAddress,
        abi,
        functionName: 'approve',
        args: [request.spender, request.amount],
        ...(nonce !== undefined ? { nonce } : {}),
      });
      setPendingApprove({ hash, owner, request, nonce });
    } catch (cause) {
      setError({ message: describeLiquidityError(cause, ERROR_CONTEXT) });
    } finally {
      setApproveWalletAction(false);
      submittingRef.current = false;
    }
  };

  const run = async (call: LiquidityCall, note: { title: string; detail?: string }): Promise<void> => {
    if (account === undefined || submittingRef.current || isHydrating) return;
    if (pendingMain !== null || receipt !== null) return;
    const attempt: MainAttempt = {
      chainId,
      account,
      call,
      note,
      hash: undefined,
      nonce: undefined,
    };
    // R1: 钱包打开之前就落下 attempt（含 owner），失败/取消也能重发这一笔。
    persistAttempt(attempt);
    setError(null);
    setMainWalletAction(true);
    submittingRef.current = true;
    try {
      const nonce = await readPendingNonce();
      await signAttempt(attempt, nonce);
    } catch (cause) {
      const recovery = txSendRecoveryKind(cause);
      setError({
        message: describeLiquidityError(cause, ERROR_CONTEXT),
        ...(recovery !== undefined ? { kind: recovery } : {}),
      });
    } finally {
      setMainWalletAction(false);
      submittingRef.current = false;
    }
  };

  const currentAttempt = (): MainAttempt | null => {
    if (pendingMain !== null) {
      return {
        ...pendingMain.owner,
        call: pendingMain.call,
        note: pendingMain.note,
        hash: pendingMain.hash,
        nonce: pendingMain.nonce,
      };
    }
    return lastAttemptRef.current;
  };

  const resubmit = (): void => {
    void (async () => {
      // R7: 前置加锁，恢复按钮点击期间不会重复签名。
      if (submittingRef.current) return;
      const attempt = currentAttempt();
      if (attempt === null) return;
      // R3: 绝不代签别的钱包/别的链上的请求。
      if (account === undefined || !isSameTxOwner(attempt, { chainId, account })) {
        lastAttemptRef.current = null;
        setPendingMain(null);
        if (scope !== null) clearStoredLiquidity(scope);
        setError({ message: copy.txWatch.ownerChanged });
        return;
      }
      // 还没有哈希：钱包拒签/取消，这就是同一笔请求的普通重试（R1）。
      if (attempt.hash === undefined) {
        setError(null);
        setMainWalletAction(true);
        setIsResubmitting(true);
        submittingRef.current = true;
        try {
          const nonce = await readPendingNonce();
          await signAttempt(attempt, nonce);
        } catch (cause) {
          setError({ message: describeLiquidityError(cause, ERROR_CONTEXT) });
        } finally {
          setMainWalletAction(false);
          setIsResubmitting(false);
          submittingRef.current = false;
        }
        return;
      }

      const hash = attempt.hash;
      setError(null);
      // R7: 钱包等待态 + 发送锁，finally 一定释放。
      setIsResubmitting(true);
      setMainWalletAction(true);
      submittingRef.current = true;
      try {
        // R2: 读 nonce 期间原交易可能已经确认，所以先复核再决定发不发。
        const snapshot = await readResubmitSnapshot(publicClient, account, hash);
        const decision = decideResubmit(snapshot, attempt.nonce ?? watch.submittedNonce);
        if (decision.action === 'settled') {
          if (decision.status === 'reverted') {
            if (scope !== null) clearStoredLiquidity(scope);
            lastAttemptRef.current = null;
            setPendingMain(null);
            setError({ message: copy.liquidity.errors.reverted });
            onConfirmedRef.current();
            return;
          }
          // 已成交：交给正常回执路径，绝不再发第二笔。
          if (scope !== null) clearStoredLiquidity(scope);
          lastAttemptRef.current = null;
          setReceipt({
            hash,
            title: attempt.note.title,
            detail: attempt.note.detail,
            recordedAt: Date.now(),
          });
          setPendingMain(null);
          onConfirmedRef.current();
          return;
        }
        if (decision.action === 'replaced') {
          watch.refresh();
          return;
        }
        if (decision.action === 'unavailable') {
          setError({ message: copy.txWatch.nonceUnavailable });
          return;
        }
        await signAttempt(
          { ...attempt, nonce: decision.nonce },
          decision.nonce,
        );
      } catch (cause) {
        setError({ message: describeLiquidityError(cause, ERROR_CONTEXT) });
      } finally {
        setMainWalletAction(false);
        setIsResubmitting(false);
        submittingRef.current = false;
      }
    })();
  };

  const mainStage: LiquidityStage = mainWalletAction
    ? 'wallet'
    : pendingMain !== null && !watch.isStuck
      ? 'pending'
      : 'idle';
  const approveStage: LiquidityStage = approveWalletAction
    ? 'wallet'
    : pendingApprove !== null && !approveWatch.isStuck
      ? 'pending'
      : 'idle';

  return {
    stage: mainStage,
    approveStage,
    approveHash: pendingApprove?.hash ?? null,
    approveRevision,
    receipt,
    error,
    watch,
    approveWatch,
    approve,
    run,
    isResubmitting,
    resubmit,
    clearReceipt: () => {
      setReceipt(null);
      setPendingMain(null);
      setError(null);
    },
    clearError: () => {
      setError(null);
    },
  };
}

const ERROR_CONTEXT = {
  nativeSymbol: NETWORK.nativeCurrency.symbol,
  tokenSymbol: copy.liquidity.tokenLabel,
};
