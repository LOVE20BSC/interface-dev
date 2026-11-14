import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useWriteContract } from 'wagmi';
import { love20TokenAbi, uniswapV2Router02Abi, weth9Abi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { useNextNonce, useTxWatch, type TxWatch } from '@/shared/model/use-tx-watch';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';
import { describeSwapError, swapRetryLabel } from '@/features/swap-token/lib/swap-errors';
import { parseSwapReceipt } from '@/features/swap-token/lib/swap-events';
import {
  clearSwapRecord,
  createSwapScope,
  readSwapRecord,
  swapRecordMatchesPair,
  writeSwapRecord,
  type HexHash,
  type SwapRecord,
} from '@/features/swap-token/lib/swap-receipt-record';
import type { SwapRoute, SwapToken } from '@/features/swap-token/lib/swap-types';
import { swapTokenKey } from '@/features/swap-token/lib/swap-types';
import type { SwapPairRead } from '@/features/swap-token/lib/swap-route';

export type SwapTxStage = 'idle' | 'wallet' | 'pending';

export type SwapTxAction = 'approve' | 'swap';

export interface SwapTxError {
  readonly action: SwapTxAction;
  readonly message: string;
  readonly retryLabel: string | undefined;
  /** Send-time recovery family: nonce mismatch / stale wallet block view. */
  readonly kind?: 'nonce' | 'staleBlock';
}

export interface SwapTransactionInput {
  readonly router: HexAddress | undefined;
  readonly wrappedAddress: HexAddress | undefined;
  readonly from: SwapToken | undefined;
  readonly to: SwapToken | undefined;
  readonly route: SwapRoute | null;
  readonly nativeSymbol: string;
  readonly onConfirmed?: () => void;
}

export interface SwapExecution {
  readonly amountIn: bigint;
  readonly minOut: bigint;
  readonly quoteOut: bigint | undefined;
}

export interface SwapTransactionState {
  readonly approveStage: SwapTxStage;
  readonly swapStage: SwapTxStage;
  readonly isApproved: boolean;
  readonly approvedAmount: bigint | null;
  readonly receipt: SwapRecord | null;
  readonly pendingHash: HexHash | null;
  readonly pendingKind: SwapTxAction | null;
  readonly error: SwapTxError | null;
  readonly isHydrating: boolean;
  /** Bounded wait for the submitted hash; `isStuck` frees the CTA + shows recovery. */
  readonly watch: TxWatch;
  /** Re-sends the pending step with an explicitly correct nonce (recovery card). */
  readonly resubmit: () => void;
  readonly approve: (amount: bigint) => void;
  readonly execute: (execution: SwapExecution) => Promise<void>;
  readonly clearReceipt: () => void;
  readonly clearError: () => void;
}

type ResendTarget =
  | { readonly kind: 'approve'; readonly amount: bigint; readonly tokenAddress: HexAddress }
  | { readonly kind: 'swap'; readonly execution: SwapExecution };

type PendingTx =
  | {
      readonly kind: 'approve';
      readonly hash: HexHash;
      readonly amount: bigint;
      readonly tokenAddress: HexAddress;
    }
  | { readonly kind: 'swap'; readonly hash: HexHash; readonly record: SwapRecord };

/** The router call a swap record represents, replayable for 「重新提交」. */
interface SwapRequest {
  readonly kind: SwapRecord['kind'];
  readonly fromKey: string;
  readonly toKey: string;
  readonly amountIn: bigint;
  readonly minOut: bigint;
  readonly path: readonly HexAddress[];
}

function pairReadsFromRecord(record: SwapRecord): SwapPairRead[] {
  return record.pairAddresses.flatMap((address, index) => {
    const token0 = record.pairToken0[index];
    const token1 = record.pairToken1[index];
    if (token0 === undefined || token1 === undefined) return [];
    return [{ address, token0, token1, reserve0: 0n, reserve1: 0n } as SwapPairRead];
  });
}

function requestFromRecord(record: SwapRecord): SwapRequest | null {
  if (record.amountIn === undefined || record.minOut === undefined) return null;
  const path = record.path.filter((entry): entry is HexAddress =>
    /^0x[0-9a-fA-F]{40}$/.test(entry),
  );
  return {
    kind: record.kind,
    fromKey: record.fromKey,
    toKey: record.toKey,
    amountIn: record.amountIn,
    minOut: record.minOut,
    path,
  };
}

/**
 * ERC20 input: exact-amount approve first, then the swap. The mint ladder's
 * grammar is reused: wallet → 确认中 → mined. The hash (and all receipt context)
 * is persisted before waiting so a refresh resumes the pending transaction.
 *
 * The receipt wait is the shared bounded watcher (`useTxWatch`), not a bare
 * receipt poll: a dropped/replaced/nonce-gapped transaction becomes an
 * actionable recovery card instead of an endless 确认中.
 */
export function useSwapTransaction(options: SwapTransactionInput): SwapTransactionState {
  const { router, wrappedAddress, from, to, route, nativeSymbol, onConfirmed } = options;
  const { address: account } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const readNextNonce = useNextNonce(account);

  const [pending, setPending] = useState<PendingTx | null>(null);
  const [receipt, setReceipt] = useState<SwapRecord | null>(null);
  const [walletAction, setWalletAction] = useState<SwapTxAction | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [approvedAmount, setApprovedAmount] = useState<bigint | null>(null);
  const [error, setError] = useState<SwapTxError | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const submittingRef = useRef(false);
  const lastAttemptRef = useRef<ResendTarget | null>(null);

  const fromKey = from !== undefined ? swapTokenKey(from) : '';
  // An approval belongs to one token; switching the input must not reuse it.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setIsApproved(false);
    setApprovedAmount(null);
  }, [from?.address, fromKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onConfirmedRef = useRef<(() => void) | undefined>(onConfirmed);
  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  });

  const scope = useMemo(
    () =>
      account !== undefined && router !== undefined
        ? createSwapScope(chainId, router, account)
        : null,
    [account, chainId, router],
  );

  /* eslint-disable react-hooks/set-state-in-effect -- hydration from the namespaced cache */
  useEffect(() => {
    setPending(null);
    setReceipt(null);
    setError(null);
    setWalletAction(null);
    setIsApproved(false);
    setApprovedAmount(null);
    submittingRef.current = false;
    setIsHydrating(true);
    if (scope === null) {
      setIsHydrating(false);
      return;
    }
    const stored = readSwapRecord(scope);
    // Only an unconfirmed (pending) hash is resumed. A confirmed receipt is a
    // one-time page state: after the user leaves/reloads the page it must not
    // pop up again (owner 2026-11-14), so it is never restored from the cache.
    if (stored !== null && !stored.confirmed) {
      setPending({ kind: 'swap', hash: stored.hash, record: stored });
    }
    setIsHydrating(false);
  }, [scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const watch = useTxWatch({
    hash: pending?.hash ?? null,
    wallet: account,
    walletAction: walletAction !== null,
    enabled: pending !== null,
  });
  const onChainReceipt = watch.receipt;

  /* eslint-disable react-hooks/set-state-in-effect -- a mined receipt is an external chain fact */
  useEffect(() => {
    if (pending === null || onChainReceipt === null) return;

    if (onChainReceipt.status === 'reverted') {
      if (pending.kind === 'swap' && scope !== null) clearSwapRecord(scope);
      setPending(null);
      setError({
        action: pending.kind,
        message: copy.swap.errors.reverted,
        retryLabel: undefined,
      });
      onConfirmedRef.current?.();
      return;
    }

    if (pending.kind === 'approve') {
      if (
        from?.address !== undefined &&
        from.address.toLowerCase() === pending.tokenAddress.toLowerCase()
      ) {
        setIsApproved(true);
        setApprovedAmount(pending.amount);
      }
      setPending(null);
      onConfirmedRef.current?.();
      return;
    }

    const record = pending.record;
    const parsed = parseSwapReceipt({
      kind: record.kind,
      path: record.path as HexAddress[],
      pairs: pairReadsFromRecord(record),
      logs: onChainReceipt.logs,
      account: account ?? '0x0000000000000000000000000000000000000000',
      amountIn: record.amountIn ?? 0n,
      minOut: record.minOut ?? 0n,
    });
    const nextRecord: SwapRecord = {
      ...record,
      actualOut: parsed.actualOut,
      paidIn: parsed.paidIn,
      belowMinOut: parsed.belowMinOut,
      confirmed: true,
      recordedAt: Date.now(),
    };
    // Drop the persisted record as soon as the receipt exists: the receipt is
    // shown once in this session, never replayed when the page is revisited.
    if (scope !== null) clearSwapRecord(scope);
    setReceipt(nextRecord);
    setPending(null);
    setError(null);
    onConfirmedRef.current?.();
  }, [account, from?.address, onChainReceipt, pending, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // A receipt from another pair must not disable the current form.
  const activeReceipt =
    receipt !== null &&
    from !== undefined &&
    to !== undefined &&
    swapRecordMatchesPair(receipt, from, to)
      ? receipt
      : null;

  const deadlineSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000) + 1200);

  /** One place for the three write shapes (wrap/unwrap/router), so resubmit reuses it. */
  const writeSwapRequest = async (request: SwapRequest, nonce?: number): Promise<HexHash> => {
    const nonceOption = nonce !== undefined ? { nonce } : {};
    if (request.kind === 'wrap') {
      if (wrappedAddress === undefined) throw new Error('wrapped native unavailable');
      return writeContractAsync({
        address: wrappedAddress,
        abi: weth9Abi,
        functionName: 'deposit',
        value: request.amountIn,
        ...nonceOption,
      });
    }
    if (request.kind === 'unwrap') {
      if (wrappedAddress === undefined) throw new Error('wrapped native unavailable');
      return writeContractAsync({
        address: wrappedAddress,
        abi: weth9Abi,
        functionName: 'withdraw',
        args: [request.amountIn],
        ...nonceOption,
      });
    }
    if (router === undefined || account === undefined) throw new Error('router unavailable');
    const path = [...request.path];
    const swapDeadline = deadlineSeconds();
    if (request.fromKey === 'native') {
      return writeContractAsync({
        address: router,
        abi: uniswapV2Router02Abi,
        functionName: 'swapExactETHForTokens',
        args: [request.minOut, path, account, swapDeadline],
        value: request.amountIn,
        ...nonceOption,
      });
    }
    if (request.toKey === 'native') {
      return writeContractAsync({
        address: router,
        abi: uniswapV2Router02Abi,
        functionName: 'swapExactTokensForETH',
        args: [request.amountIn, request.minOut, path, account, swapDeadline],
        ...nonceOption,
      });
    }
    return writeContractAsync({
      address: router,
      abi: uniswapV2Router02Abi,
      functionName: 'swapExactTokensForTokens',
      args: [request.amountIn, request.minOut, path, account, swapDeadline],
      ...nonceOption,
    });
  };

  const submitApprove = async (
    amount: bigint,
    tokenAddress: HexAddress,
    nonce?: number,
  ): Promise<void> => {
    if (submittingRef.current || router === undefined) return;
    setError(null);
    setIsApproved(false);
    setWalletAction('approve');
    submittingRef.current = true;
    try {
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi: love20TokenAbi,
        functionName: 'approve',
        args: [router, amount],
        ...(nonce !== undefined ? { nonce } : {}),
      });
      setPending({ kind: 'approve', hash, amount, tokenAddress });
    } catch (cause) {
      const message = describeSwapError(cause, { nativeSymbol, fromSymbol: from?.symbol ?? '' });
      const recovery = txSendRecoveryKind(cause);
      setError({
        action: 'approve',
        message,
        retryLabel: swapRetryLabel(message),
        ...(recovery !== undefined ? { kind: recovery } : {}),
      });
    } finally {
      setWalletAction(null);
      submittingRef.current = false;
    }
  };

  const approve = (amount: bigint): void => {
    if (submittingRef.current || pending !== null || activeReceipt !== null) return;
    if (
      from === undefined ||
      from.kind === 'native' ||
      from.address === undefined ||
      router === undefined ||
      amount <= 0n
    ) {
      return;
    }
    lastAttemptRef.current = { kind: 'approve', amount, tokenAddress: from.address };
    void submitApprove(amount, from.address);
  };

  const submitExecution = async (execution: SwapExecution, nonce?: number): Promise<void> => {
    if (submittingRef.current) return;
    if (
      router === undefined ||
      account === undefined ||
      from === undefined ||
      to === undefined ||
      route === null ||
      execution.amountIn <= 0n
    ) {
      return;
    }

    setError(null);
    setWalletAction('swap');
    submittingRef.current = true;
    const request: SwapRequest = {
      kind: route.kind,
      fromKey: swapTokenKey(from),
      toKey: swapTokenKey(to),
      amountIn: execution.amountIn,
      minOut: execution.minOut,
      path: route.kind === 'swap' ? [...route.pathAddresses] : [],
    };
    try {
      const hash = await writeSwapRequest(request, nonce);
      const record: SwapRecord = {
        hash,
        kind: route.kind,
        fromKey: request.fromKey,
        toKey: request.toKey,
        fromSymbol: from.symbol,
        toSymbol: to.symbol,
        fromDecimals: from.decimals,
        toDecimals: to.decimals,
        amountIn: execution.amountIn,
        minOut: execution.minOut,
        quoteOut: execution.quoteOut,
        actualOut: undefined,
        paidIn: undefined,
        path: route.kind === 'swap' ? [...route.pathAddresses] : [],
        pathSymbols: [...route.displayPath],
        pairAddresses: route.pairs.map((pair) => pair.address),
        pairToken0: route.pairs.map((pair) => pair.token0),
        pairToken1: route.pairs.map((pair) => pair.token1),
        belowMinOut: false,
        confirmed: false,
        recordedAt: Date.now(),
      };
      if (scope !== null) writeSwapRecord(scope, record);
      setPending({ kind: 'swap', hash, record });
    } catch (cause) {
      const message = describeSwapError(cause, { nativeSymbol, fromSymbol: from.symbol });
      const recovery = txSendRecoveryKind(cause);
      setError({
        action: 'swap',
        message,
        retryLabel: swapRetryLabel(message),
        ...(recovery !== undefined ? { kind: recovery } : {}),
      });
    } finally {
      setWalletAction(null);
      submittingRef.current = false;
    }
  };

  const execute = async (execution: SwapExecution): Promise<void> => {
    if (submittingRef.current || pending !== null || activeReceipt !== null) return;
    lastAttemptRef.current = { kind: 'swap', execution };
    await submitExecution(execution);
  };

  /**
   * Recovery action for a stuck hash or a rejected send: rebuild the same call
   * from the persisted record (or the last attempt) and re-send it with the
   * on-chain nonce, so a nonce gap heals itself.
   * record and re-send it with the on-chain nonce, so a nonce gap heals itself.
   */
  const resubmit = (): void => {
    void (async () => {
      const nonce = await readNextNonce();
      if (nonce === undefined) {
        const action: SwapTxAction = pending?.kind ?? lastAttemptRef.current?.kind ?? 'swap';
        setError({ action, message: copy.txWatch.nonceUnavailable, retryLabel: undefined });
        return;
      }
      if (pending !== null) {
        const target = pending;
        if (target.kind === 'approve') {
          await submitApprove(target.amount, target.tokenAddress, nonce);
          return;
        }
        const request = requestFromRecord(target.record);
        if (request === null) {
          setError({ action: 'swap', message: copy.swap.errors.failedNote, retryLabel: undefined });
          return;
        }
        setError(null);
        setWalletAction('swap');
        submittingRef.current = true;
        try {
          const hash = await writeSwapRequest(request, nonce);
          const record: SwapRecord = {
            ...target.record,
            hash,
            confirmed: false,
            recordedAt: Date.now(),
          };
          if (scope !== null) writeSwapRecord(scope, record);
          setPending({ kind: 'swap', hash, record });
        } catch (cause) {
          const message = describeSwapError(cause, {
            nativeSymbol,
            fromSymbol: target.record.fromSymbol,
          });
          const recovery = txSendRecoveryKind(cause);
          setError({
            action: 'swap',
            message,
            retryLabel: swapRetryLabel(message),
            ...(recovery !== undefined ? { kind: recovery } : {}),
          });
        } finally {
          setWalletAction(null);
          submittingRef.current = false;
        }
        return;
      }
      const last = lastAttemptRef.current;
      if (last === null) return;
      if (last.kind === 'approve') {
        await submitApprove(last.amount, last.tokenAddress, nonce);
        return;
      }
      await submitExecution(last.execution, nonce);
    })();
  };

  const clearReceipt = (): void => {
    setReceipt(null);
    setPending(null);
    setError(null);
    setIsApproved(false);
    setApprovedAmount(null);
    if (scope !== null) clearSwapRecord(scope);
  };

  // A stuck hash frees the CTA and the pair controls; the recovery card owns
  // the manual 「重新查询」/「重新提交」 actions until a new hash is submitted.
  const approveStage: SwapTxStage =
    walletAction === 'approve'
      ? 'wallet'
      : pending?.kind === 'approve' && !watch.isStuck
        ? 'pending'
        : 'idle';
  const swapStage: SwapTxStage =
    walletAction === 'swap'
      ? 'wallet'
      : pending?.kind === 'swap' && !watch.isStuck
        ? 'pending'
        : 'idle';

  return {
    approveStage,
    swapStage,
    isApproved,
    approvedAmount: isApproved ? approvedAmount : null,
    receipt: activeReceipt,
    pendingHash: pending?.hash ?? null,
    pendingKind: pending?.kind ?? null,
    error,
    isHydrating,
    watch,
    resubmit,
    approve,
    execute,
    clearReceipt,
    clearError: () => {
      setError(null);
    },
  };
}
