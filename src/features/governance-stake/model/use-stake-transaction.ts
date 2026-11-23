import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useWriteContract } from 'wagmi';
import type { Abi } from 'viem';
import { NETWORK, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { toUserMessage } from '@/shared/lib/errors';
import { isSameTxOwner, type TxOwner } from '@/shared/lib/tx-owner';
import { usePendingNonce, useTxWatch, type TxWatch } from '@/shared/model/use-tx-watch';
import {
  clearStoredStakeCall,
  createStakeScope,
  readStoredStakeCall,
  writeStoredStakeCall,
} from '../lib/stake-record';
import {
  parseStakeReceipt,
  type StakeReceipt,
  type StakeReceiptAction,
} from '../lib/stake-receipt';

/**
 * 治理·质押的写链状态机：可选的「授权」+ 主交易两步，两步都走共享的有界等待
 * （`useTxWatch`），钱包里卡住的交易不会变成死路，页面给出恢复卡。
 *
 * 页面把准备好的调用（地址 + ABI + 参数）交给 `run`，hook 只负责签名、等待、
 * 失败翻译与回执；数量与治理权都在页面/领域层算好，这里不重算。
 *
 * 恢复语义（owner 2026-11-23 移除交易重发）：
 * - 只有拿到哈希之后才落记录；签名失败只报错，不保留请求、不重试；
 * - 钱包/网络切换后清记录 + 中性提示，绝不代签；
 * - 在途任务持久化在缓存里，刷新/切页后恢复并继续 watch 同一个哈希。
 */

export type StakeStage = 'idle' | 'wallet' | 'pending';

export interface StakeCall {
  readonly address: HexAddress;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly value?: bigint;
}

export interface StakeApproveRequest {
  readonly tokenAddress: HexAddress;
  readonly abi: Abi;
  readonly spender: HexAddress;
  readonly amount: bigint;
}

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

const RECEIPT_ACTIONS: readonly StakeReceiptAction[] = [
  'stakeLiquidity',
  'stakeBoost',
  'increasePhases',
  'unstake',
  'withdraw',
];

interface PendingApprove {
  readonly hash: `0x${string}`;
  readonly owner: TxOwner;
}

interface PendingMain {
  readonly hash: `0x${string}`;
  readonly owner: TxOwner;
  readonly call: StakeCall;
  readonly action: StakeReceiptAction;
  readonly nonce: number | undefined;
}

export function useStakeTransaction(onConfirmed: () => void): StakeTransactionState {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const readPendingNonce = usePendingNonce(account);

  const [pendingApprove, setPendingApprove] = useState<PendingApprove | null>(null);
  const [pendingMain, setPendingMain] = useState<PendingMain | null>(null);
  const [approveWalletAction, setApproveWalletAction] = useState(false);
  const [mainWalletAction, setMainWalletAction] = useState(false);
  const [approveRevision, setApproveRevision] = useState(0);
  const [approveTokenAddress, setApproveTokenAddress] = useState<HexAddress | undefined>();
  const [receipt, setReceipt] = useState<StakeReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const submittingRef = useRef(false);

  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  });

  const scope = useMemo(
    () => (account !== undefined ? createStakeScope(chainId, account) : null),
    [account, chainId],
  );

  // 刷新/切页后恢复在途主交易，继续 watch 同一个哈希，并挡住二次提交。
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
    const stored = readStoredStakeCall(scope);
    if (stored === null) {
      setIsHydrating(false);
      return;
    }
    const action = RECEIPT_ACTIONS.find((entry) => entry === stored.action);
    if (action === undefined) {
      clearStoredStakeCall(scope);
      setIsHydrating(false);
      return;
    }
    const owner: TxOwner = { chainId: stored.chainId, account: stored.account };
    // 别人的请求不能变成当前钱包可提交的状态，更不能被代签。
    if (!isSameTxOwner(owner, { chainId, account })) {
      clearStoredStakeCall(scope);
      setError(copy.gov.tx.ownerChanged);
      setIsHydrating(false);
      return;
    }
    if (stored.hash !== null) {
      setPendingMain({
        hash: stored.hash,
        owner,
        call: stored.call,
        action,
        nonce: stored.nonce,
      });
    } else {
      // 旧版本在发送前落下的无哈希记录：没有在途交易可恢复，直接丢掉。
      clearStoredStakeCall(scope);
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
      setApproveTokenAddress(undefined);
      setError(copy.gov.tx.revert);
      return;
    }
    setApproveRevision((current) => current + 1);
    setPendingApprove(null);
    setApproveTokenAddress(undefined);
    setError(null);
  }, [approveReceipt, pendingApprove]);

  useEffect(() => {
    if (pendingMain === null || mainReceipt === null) return;
    if (mainReceipt.status === 'reverted') {
      if (scope !== null) clearStoredStakeCall(scope);
      setPendingMain(null);
      setError(copy.gov.tx.revert);
      onConfirmedRef.current();
      return;
    }
    if (scope !== null) clearStoredStakeCall(scope);
    setReceipt({
      action: pendingMain.action,
      hash: pendingMain.hash,
      detail: parseStakeReceipt(pendingMain.action, mainReceipt),
      recordedAt: Date.now(),
    });
    setPendingMain(null);
    setError(null);
    onConfirmedRef.current();
  }, [mainReceipt, pendingMain, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const signCall = async (call: StakeCall, nonce: number | undefined): Promise<`0x${string}`> =>
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
    call: StakeCall,
    action: StakeReceiptAction,
    nonce: number | undefined,
  ): Promise<void> => {
    const hash = await signCall(call, nonce);
    // 只有拿到哈希之后才落记录：签名失败不保留任何可重发的请求。
    if (scope !== null) {
      writeStoredStakeCall(scope, {
        hash,
        chainId: owner.chainId,
        account: owner.account,
        call,
        action,
        nonce,
        recordedAt: Date.now(),
      });
    }
    setPendingMain({ hash, owner, call, action, nonce });
  };

  const approve = async (request: StakeApproveRequest): Promise<void> => {
    if (account === undefined || submittingRef.current) return;
    setError(null);
    setApproveTokenAddress(request.tokenAddress);
    setApproveWalletAction(true);
    submittingRef.current = true;
    try {
      const nonce = await readPendingNonce();
      const hash = await writeContractAsync({
        address: request.tokenAddress,
        abi: request.abi,
        functionName: 'approve',
        args: [request.spender, request.amount],
        ...(nonce !== undefined ? { nonce } : {}),
      });
      setPendingApprove({ hash, owner: { chainId, account } });
    } catch (cause) {
      setError(toUserMessage(cause));
      setApproveTokenAddress(undefined);
    } finally {
      setApproveWalletAction(false);
      submittingRef.current = false;
    }
  };

  const run = async (call: StakeCall, action: StakeReceiptAction): Promise<void> => {
    if (account === undefined || submittingRef.current || isHydrating) return;
    if (pendingMain !== null || receipt !== null) return;
    const owner: TxOwner = { chainId, account };
    setError(null);
    setMainWalletAction(true);
    submittingRef.current = true;
    try {
      const nonce = await readPendingNonce();
      await sendMain(owner, call, action, nonce);
    } catch (cause) {
      setError(toUserMessage(cause));
    } finally {
      setMainWalletAction(false);
      submittingRef.current = false;
    }
  };

  const mainStage: StakeStage = mainWalletAction
    ? 'wallet'
    : pendingMain !== null
      ? 'pending'
      : 'idle';
  const approveStage: StakeStage = approveWalletAction
    ? 'wallet'
    : pendingApprove !== null
      ? 'pending'
      : 'idle';

  return {
    stage: mainStage,
    approveStage,
    approveTokenAddress,
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

/** 错误上下文：钱包层错误只需要网络与代币符号，`toUserMessage` 已覆盖合约错误。 */
export const STAKE_ERROR_CONTEXT = {
  nativeSymbol: NETWORK.nativeCurrency.symbol,
};

export type { StakeCall as StakeWriteCall };
