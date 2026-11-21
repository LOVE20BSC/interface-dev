import { useEffect, useRef, useState } from 'react';
import type { Abi } from 'viem';
import { useAccount, useChainId, useWriteContract } from 'wagmi';
import type { HexAddress } from '@/config/networks';
import { isSameTxOwner, type TxOwner } from '@/shared/lib/tx-owner';
import { usePendingNonce, useTxWatch, type TxWatch } from '@/shared/model/use-tx-watch';

/**
 * 治理域（core）通用的**单笔**写链状态机：签名 → 有界等待（`useTxWatch`）→ 回执/失败。
 *
 * 为什么不复用 `useStakeTransaction`：那是「授权 + 主交易」两步状态机，带质押专属的
 * 回执解析与授权阶梯；治理域的投票 / 推举 / 铸造都是**一笔交易、无授权**，套上去会把
 * 质押语义带进治理域。底层（`useTxWatch` / `usePendingNonce` / 错误翻译）仍然复用。
 *
 * 状态是**派生**的，不在 effect 里 setState（否则 React 19 的 lint 规则会拦，也会造成
 * 级联渲染）：`stage` 由「有没有在途哈希」和「回执到没到」直接算出来。
 *
 * 语义与质押域一致（owner 2026-11-16 R1–R7 的可见行为）：
 * - 发交易前先读 `pending` nonce 并显式传入，避免钱包缓存旧 nonce 让交易卡死；
 * - 「重新提交」先确认钱包/网络没换（换了就中性提示、绝不代签），有哈希就用**同一笔的
 *   nonce** 替换，没有哈希就是普通重试。
 *
 * 已知缺口（如实记录，别当成已实现）：在途请求**没有**落缓存，刷新页面不会自动恢复并
 * 后台继续 watch；恢复靠 `useTxWatch` 的「慢/掉队/被替换/nonce 缺口」卡与「重新提交」。
 */

export interface ContractCall {
  readonly address: HexAddress;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args: readonly unknown[];
}

export type ContractWriteStage = 'idle' | 'wallet' | 'pending';

export interface ContractWriteMessages {
  /** 等待钱包签名时的提示。 */
  readonly wallet: string;
  /** 交易上链但合约拒绝时的提示。 */
  readonly reverted: string;
  /** 重新提交时发现钱包/网络已切换。 */
  readonly ownerChanged: string;
}

export interface ContractWrite {
  readonly stage: ContractWriteStage;
  readonly error: string | null;
  readonly hash: `0x${string}` | null;
  readonly watch: TxWatch;
  readonly run: (call: ContractCall) => Promise<void>;
  readonly resubmit: () => void;
  readonly clearError: () => void;
  /** 回执被页面消费（关掉面板）后调用：清哈希、清错误，允许下一笔。 */
  readonly reset: () => void;
}

interface Attempt extends TxOwner {
  readonly call: ContractCall;
  readonly hash: `0x${string}` | undefined;
  readonly nonce: number | undefined;
}

export function useContractWrite(
  messages: ContractWriteMessages,
  translate: (cause: unknown) => string,
  onConfirmed?: () => void,
): ContractWrite {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const readPendingNonce = usePendingNonce(account);

  const [walletOpen, setWalletOpen] = useState(false);
  const [explicitError, setExplicitError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    readonly hash: `0x${string}`;
    readonly owner: TxOwner;
  } | null>(null);
  const submittingRef = useRef(false);
  const lastAttemptRef = useRef<Attempt | null>(null);

  const watch = useTxWatch({ hash: pending?.hash ?? null, wallet: account });
  const settledReceipt = watch.receipt;
  const settled = settledReceipt !== null;
  const reverted = settledReceipt?.status === 'reverted';

  const stage: ContractWriteStage =
    pending === null ? (walletOpen ? 'wallet' : 'idle') : settled ? 'idle' : 'pending';
  const error = explicitError ?? (settled && reverted ? messages.reverted : null);

  // 回执到达后让页面刷新读模型；这里只同步外部（React Query），不写 state。
  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  });
  useEffect(() => {
    if (settled) onConfirmedRef.current?.();
  }, [settled, settledReceipt]);

  const run = async (call: ContractCall): Promise<void> => {
    if (account === undefined || submittingRef.current) return;
    const attempt: Attempt = { chainId, account, call, hash: undefined, nonce: undefined };
    lastAttemptRef.current = attempt;
    setExplicitError(null);
    setWalletOpen(true);
    submittingRef.current = true;
    try {
      const nonce = await readPendingNonce();
      const hash = await writeContractAsync({
        address: call.address,
        abi: call.abi,
        functionName: call.functionName,
        args: call.args,
        ...(nonce !== undefined ? { nonce } : {}),
      });
      lastAttemptRef.current = { ...attempt, hash, nonce: nonce ?? undefined };
      setPending({ hash, owner: { chainId, account } });
    } catch (cause) {
      setExplicitError(translate(cause));
    } finally {
      setWalletOpen(false);
      submittingRef.current = false;
    }
  };

  const resubmit = (): void => {
    void (async () => {
      if (submittingRef.current) return;
      const attempt = lastAttemptRef.current;
      if (attempt === null) return;
      if (account === undefined || !isSameTxOwner(attempt, { chainId, account })) {
        lastAttemptRef.current = null;
        setPending(null);
        setExplicitError(messages.ownerChanged);
        return;
      }
      setExplicitError(null);
      setWalletOpen(true);
      submittingRef.current = true;
      try {
        // 已知哈希时用它自己的 nonce 替换；还没有哈希就是同一笔请求的普通重试。
        const nonce = attempt.nonce ?? (await readPendingNonce());
        const hash = await writeContractAsync({
          address: attempt.call.address,
          abi: attempt.call.abi,
          functionName: attempt.call.functionName,
          args: attempt.call.args,
          ...(nonce !== undefined ? { nonce } : {}),
        });
        lastAttemptRef.current = { ...attempt, hash, nonce: nonce ?? undefined };
        setPending({ hash, owner: { chainId, account } });
      } catch (cause) {
        setExplicitError(translate(cause));
      } finally {
        setWalletOpen(false);
        submittingRef.current = false;
      }
    })();
  };

  const clearError = (): void => setExplicitError(null);
  const reset = (): void => {
    setExplicitError(null);
    setPending(null);
    setWalletOpen(false);
    lastAttemptRef.current = null;
  };

  return { stage, error, hash: pending?.hash ?? null, watch, run, resubmit, clearError, reset };
}
