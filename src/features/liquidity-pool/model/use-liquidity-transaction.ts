import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useWriteContract } from 'wagmi';
import type { Abi } from 'viem';
import { love20TokenAbi, uniswapV2PairAbi } from '@/config/abis';
import { NETWORK, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { usePendingNonce, useTxWatch, type TxWatch } from '@/shared/model/use-tx-watch';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';
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
 * 恢复卡。
 *
 * 页面把准备好的调用（地址 + ABI + 参数）交给 `run`，hook 只负责签名、等待、
 * 失败翻译与回执；业务数值（数量、最少数量）都在页面侧按理论线算好，hook 不
 * 重算，避免两处公式不一致。
 *
 * 恢复语义（owner 2026-11-23 移除交易重发）：
 * - 只有拿到哈希之后才落记录；签名失败只报错，不保留请求、不重试；
 * - `{chainId, account}` 与当前钱包不一致时清记录 + 中性提示，绝不代签
 *   （`to` 指向旧账户时尤其危险）；
 * - 待确认任务持久化在 `{chainId, wallet}` 作用域里，刷新/切页后恢复在途卡
 *   并继续 watch，在途期间禁止二次提交。
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
  readonly approve: (request: ApproveRequest) => Promise<void>;
  readonly run: (call: LiquidityCall, note: { title: string; detail?: string }) => Promise<void>;
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

export function useLiquidityTransaction(onConfirmed: () => void): LiquidityTransactionState {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const readPendingNonce = usePendingNonce(account);

  const [pendingApprove, setPendingApprove] = useState<PendingApprove | null>(null);
  const [pendingMain, setPendingMain] = useState<PendingMain | null>(null);
  const [approveWalletAction, setApproveWalletAction] = useState(false);
  const [mainWalletAction, setMainWalletAction] = useState(false);
  const [approveRevision, setApproveRevision] = useState(0);
  const [receipt, setReceipt] = useState<LiquidityReceipt | null>(null);
  const [error, setError] = useState<LiquidityTxError | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const submittingRef = useRef(false);

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
    submittingRef.current = false;
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
        // 旧版本在发送前落下的无哈希记录：没有在途交易可恢复，直接丢掉。
        clearStoredLiquidity(scope);
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
      setPendingMain(null);
      setError({ message: copy.liquidity.errors.reverted });
      onConfirmedRef.current();
      return;
    }
    if (scope !== null) clearStoredLiquidity(scope);
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

  const signCall = async (call: LiquidityCall, nonce: number | undefined): Promise<`0x${string}`> =>
    writeContractAsync({
      address: call.address,
      abi: call.abi,
      functionName: call.functionName,
      args: call.args,
      ...(call.value !== undefined ? { value: call.value } : {}),
      ...(nonce !== undefined ? { nonce } : {}),
    });

  const sendMain = async (
    owner: TxOwner,
    call: LiquidityCall,
    note: { title: string; detail?: string },
    nonce: number | undefined,
  ): Promise<void> => {
    const hash = await signCall(call, nonce);
    // 只有拿到哈希之后才落记录：签名失败不保留任何可重发的请求。
    if (scope !== null) {
      writeStoredLiquidity(scope, {
        hash,
        chainId: owner.chainId,
        account: owner.account,
        call,
        note,
        nonce,
        recordedAt: Date.now(),
      });
    }
    setPendingMain({ hash, owner, call, note, nonce });
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

  const run = async (
    call: LiquidityCall,
    note: { title: string; detail?: string },
  ): Promise<void> => {
    if (account === undefined || submittingRef.current || isHydrating) return;
    if (pendingMain !== null || receipt !== null) return;
    const owner: TxOwner = { chainId, account };
    setError(null);
    setMainWalletAction(true);
    submittingRef.current = true;
    try {
      const nonce = await readPendingNonce();
      await sendMain(owner, call, note, nonce);
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

  const mainStage: LiquidityStage = mainWalletAction
    ? 'wallet'
    : pendingMain !== null
      ? 'pending'
      : 'idle';
  const approveStage: LiquidityStage = approveWalletAction
    ? 'wallet'
    : pendingApprove !== null
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
