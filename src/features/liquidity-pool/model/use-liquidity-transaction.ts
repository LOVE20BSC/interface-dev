import { useEffect, useRef, useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import type { Abi } from 'viem';
import { love20TokenAbi, uniswapV2PairAbi } from '@/config/abis';
import { NETWORK, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { useNextNonce, useTxWatch, type TxWatch } from '@/shared/model/use-tx-watch';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';
import { describeLiquidityError } from '@/features/liquidity-pool/lib/liquidity-errors';

/**
 * 加池 / 撤出的写链状态机：可选的「允许使用」+ 主交易两步，两步都走共享的
 * 有界等待（`useTxWatch`），所以钱包里卡住的交易不会变成死路，页面会给出
 * 恢复卡与「重新提交」。
 *
 * 页面把准备好的调用（地址 + ABI + 参数）交给 `run`，hook 只负责签名、等待、
 * 失败翻译与回执；业务数值（数量、最少数量）都在页面侧按理论线算好，hook 不
 * 重算，避免两处公式不一致。
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
  readonly approvedKey: string | null;
  readonly receipt: LiquidityReceipt | null;
  readonly error: LiquidityTxError | null;
  readonly watch: TxWatch;
  readonly approveWatch: TxWatch;
  readonly approve: (request: ApproveRequest) => Promise<void>;
  readonly run: (call: LiquidityCall, note: { title: string; detail?: string }) => Promise<void>;
  readonly resubmit: () => void;
  readonly clearReceipt: () => void;
  readonly clearError: () => void;
}

export function approveKey(request: Pick<ApproveRequest, 'tokenAddress' | 'spender'>): string {
  return `${request.tokenAddress.toLowerCase()}:${request.spender.toLowerCase()}`;
}

type PendingApprove = {
  readonly hash: `0x${string}`;
  readonly request: ApproveRequest;
};

type PendingMain = {
  readonly hash: `0x${string}`;
  readonly call: LiquidityCall;
  readonly note: { title: string; detail?: string };
};

export function useLiquidityTransaction(onConfirmed: () => void): LiquidityTransactionState {
  const { address: account } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const readNextNonce = useNextNonce(account);

  const [pendingApprove, setPendingApprove] = useState<PendingApprove | null>(null);
  const [pendingMain, setPendingMain] = useState<PendingMain | null>(null);
  const [approveWalletAction, setApproveWalletAction] = useState(false);
  const [mainWalletAction, setMainWalletAction] = useState(false);
  const [approvedKeyValue, setApprovedKeyValue] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<LiquidityReceipt | null>(null);
  const [error, setError] = useState<LiquidityTxError | null>(null);
  const submittingRef = useRef(false);
  const lastAttemptRef = useRef<PendingMain | null>(null);

  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  });

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
    setApprovedKeyValue(approveKey(pendingApprove.request));
    setPendingApprove(null);
    setError(null);
  }, [approveReceipt, pendingApprove]);

  useEffect(() => {
    if (pendingMain === null || mainReceipt === null) return;
    if (mainReceipt.status === 'reverted') {
      setPendingMain(null);
      setError({ message: copy.liquidity.errors.reverted });
      onConfirmedRef.current();
      return;
    }
    setReceipt({
      hash: pendingMain.hash,
      title: pendingMain.note.title,
      detail: pendingMain.note.detail,
      recordedAt: Date.now(),
    });
    setPendingMain(null);
    setError(null);
    onConfirmedRef.current();
  }, [mainReceipt, pendingMain]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const approve = async (request: ApproveRequest): Promise<void> => {
    if (account === undefined || submittingRef.current) return;
    setError(null);
    setApproveWalletAction(true);
    try {
      const abi = request.kind === 'lp' ? uniswapV2PairAbi : love20TokenAbi;
      const hash = await writeContractAsync({
        address: request.tokenAddress,
        abi,
        functionName: 'approve',
        args: [request.spender, request.amount],
      });
      setPendingApprove({ hash, request });
    } catch (cause) {
      setError({ message: describeLiquidityError(cause, ERROR_CONTEXT) });
    } finally {
      setApproveWalletAction(false);
    }
  };

  const run = async (call: LiquidityCall, note: { title: string; detail?: string }): Promise<void> => {
    if (account === undefined || submittingRef.current) return;
    if (pendingMain !== null || receipt !== null) return;
    setError(null);
    setMainWalletAction(true);
    submittingRef.current = true;
    try {
      const hash = await writeContractAsync({
        address: call.address,
        abi: call.abi,
        functionName: call.functionName,
        args: call.args,
        ...(call.value !== undefined ? { value: call.value } : {}),
      });
      const attempt: PendingMain = { hash, call, note };
      lastAttemptRef.current = attempt;
      setPendingMain(attempt);
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

  const resubmit = (): void => {
    void (async () => {
      const attempt = pendingMain ?? lastAttemptRef.current;
      if (attempt === null || attempt === undefined) return;
      const nonce = await readNextNonce();
      if (nonce === undefined) {
        setError({ message: copy.txWatch.nonceUnavailable });
        return;
      }
      setError(null);
      try {
        const hash = await writeContractAsync({
          address: attempt.call.address,
          abi: attempt.call.abi,
          functionName: attempt.call.functionName,
          args: attempt.call.args,
          ...(attempt.call.value !== undefined ? { value: attempt.call.value } : {}),
          nonce,
        });
        const next: PendingMain = { ...attempt, hash };
        lastAttemptRef.current = next;
        setPendingMain(next);
      } catch (cause) {
        setError({ message: describeLiquidityError(cause, ERROR_CONTEXT) });
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
    approvedKey: approvedKeyValue,
    receipt,
    error,
    watch,
    approveWatch,
    approve,
    run,
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
