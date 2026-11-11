import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useChainId, useTransactionReceipt, useWriteContract } from 'wagmi';
import { love20TokenAbi, uniswapV2Router02Abi, weth9Abi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
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
  readonly approve: (amount: bigint) => void;
  readonly execute: (execution: SwapExecution) => Promise<void>;
  readonly clearReceipt: () => void;
  readonly clearError: () => void;
}

type PendingTx =
  | {
      readonly kind: 'approve';
      readonly hash: HexHash;
      readonly amount: bigint;
      readonly tokenAddress: HexAddress;
    }
  | { readonly kind: 'swap'; readonly hash: HexHash; readonly record: SwapRecord };

function pairReadsFromRecord(record: SwapRecord): SwapPairRead[] {
  return record.pairAddresses.flatMap((address, index) => {
    const token0 = record.pairToken0[index];
    const token1 = record.pairToken1[index];
    if (token0 === undefined || token1 === undefined) return [];
    return [{ address, token0, token1, reserve0: 0n, reserve1: 0n } as SwapPairRead];
  });
}

/**
 * ERC20 input: exact-amount approve first, then the swap. The mint ladder's
 * grammar is reused: wallet → 确认中 → mined. The hash (and all receipt context)
 * is persisted before waiting so a refresh resumes the pending transaction.
 */
export function useSwapTransaction(options: SwapTransactionInput): SwapTransactionState {
  const { router, wrappedAddress, from, to, route, nativeSymbol, onConfirmed } = options;
  const { address: account } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();

  const [pending, setPending] = useState<PendingTx | null>(null);
  const [receipt, setReceipt] = useState<SwapRecord | null>(null);
  const [walletAction, setWalletAction] = useState<SwapTxAction | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [approvedAmount, setApprovedAmount] = useState<bigint | null>(null);
  const [error, setError] = useState<SwapTxError | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const submittingRef = useRef(false);

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
    if (stored !== null) {
      if (stored.confirmed) setReceipt(stored);
      else setPending({ kind: 'swap', hash: stored.hash, record: stored });
    }
    setIsHydrating(false);
  }, [scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const receiptQuery = useTransactionReceipt({
    ...(pending !== null ? { hash: pending.hash } : {}),
    query: { enabled: pending !== null },
  });
  const onChainReceipt = receiptQuery.data;

  /* eslint-disable react-hooks/set-state-in-effect -- a mined receipt is an external chain fact */
  useEffect(() => {
    if (pending === null || onChainReceipt === undefined) return;

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
    if (scope !== null) writeSwapRecord(scope, nextRecord);
    setReceipt(nextRecord);
    setPending(null);
    setError(null);
    onConfirmedRef.current?.();
  }, [account, from?.address, onChainReceipt, pending, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // A hash that no longer resolves must not leave the page in 确认中 forever.
  /* eslint-disable react-hooks/set-state-in-effect -- one-shot receipt query result */
  useEffect(() => {
    if (pending === null || !receiptQuery.isError) return;
    if (pending.kind === 'swap' && scope !== null) clearSwapRecord(scope);
    setPending(null);
    setError({
      action: pending.kind,
      message: copy.swap.errors.pendingUnknown,
      retryLabel: undefined,
    });
    onConfirmedRef.current?.();
  }, [pending, receiptQuery.isError, scope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // A receipt from another pair must not disable the current form.
  const activeReceipt =
    receipt !== null &&
    from !== undefined &&
    to !== undefined &&
    swapRecordMatchesPair(receipt, from, to)
      ? receipt
      : null;

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
    const tokenAddress = from.address;
    setError(null);
    setIsApproved(false);
    setWalletAction('approve');
    submittingRef.current = true;
    void (async () => {
      try {
        const hash = await writeContractAsync({
          address: tokenAddress,
          abi: love20TokenAbi,
          functionName: 'approve',
          args: [router, amount],
        });
        setPending({ kind: 'approve', hash, amount, tokenAddress });
      } catch (cause) {
        const message = describeSwapError(cause, { nativeSymbol, fromSymbol: from.symbol });
        setError({ action: 'approve', message, retryLabel: swapRetryLabel(message) });
      } finally {
        setWalletAction(null);
        submittingRef.current = false;
      }
    })();
  };

  const execute = async (execution: SwapExecution): Promise<void> => {
    if (submittingRef.current || pending !== null || activeReceipt !== null) return;
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
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    try {
      let hash: HexHash;
      if (route.kind === 'wrap') {
        if (wrappedAddress === undefined) throw new Error('wrapped native unavailable');
        hash = await writeContractAsync({
          address: wrappedAddress,
          abi: weth9Abi,
          functionName: 'deposit',
          value: execution.amountIn,
        });
      } else if (route.kind === 'unwrap') {
        if (wrappedAddress === undefined) throw new Error('wrapped native unavailable');
        hash = await writeContractAsync({
          address: wrappedAddress,
          abi: weth9Abi,
          functionName: 'withdraw',
          args: [execution.amountIn],
        });
      } else {
        const path = [...route.pathAddresses];
        if (from.kind === 'native') {
          hash = await writeContractAsync({
            address: router,
            abi: uniswapV2Router02Abi,
            functionName: 'swapExactETHForTokens',
            args: [execution.minOut, path, account, deadline],
            value: execution.amountIn,
          });
        } else if (to.kind === 'native') {
          hash = await writeContractAsync({
            address: router,
            abi: uniswapV2Router02Abi,
            functionName: 'swapExactTokensForETH',
            args: [execution.amountIn, execution.minOut, path, account, deadline],
          });
        } else {
          hash = await writeContractAsync({
            address: router,
            abi: uniswapV2Router02Abi,
            functionName: 'swapExactTokensForTokens',
            args: [execution.amountIn, execution.minOut, path, account, deadline],
          });
        }
      }

      const record: SwapRecord = {
        hash,
        kind: route.kind,
        fromKey: swapTokenKey(from),
        toKey: swapTokenKey(to),
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
      setError({ action: 'swap', message, retryLabel: swapRetryLabel(message) });
    } finally {
      setWalletAction(null);
      submittingRef.current = false;
    }
  };

  const clearReceipt = (): void => {
    setReceipt(null);
    setPending(null);
    setError(null);
    setIsApproved(false);
    setApprovedAmount(null);
    if (scope !== null) clearSwapRecord(scope);
  };

  const approveStage: SwapTxStage =
    walletAction === 'approve' ? 'wallet' : pending?.kind === 'approve' ? 'pending' : 'idle';
  const swapStage: SwapTxStage =
    walletAction === 'swap' ? 'wallet' : pending?.kind === 'swap' ? 'pending' : 'idle';

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
    approve,
    execute,
    clearReceipt,
    clearError: () => {
      setError(null);
    },
  };
}
