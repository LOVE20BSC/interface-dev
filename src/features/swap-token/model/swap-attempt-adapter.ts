import { useRef } from 'react';
import type { TransactionReceipt } from 'viem';
import { useWriteContract } from 'wagmi';
import { love20TokenAbi, uniswapV2Router02Abi, weth9Abi } from '@/config/abis';
import { ZERO_ADDRESS, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import type { CacheScope } from '@/shared/lib/cache';
import type {
  WriteAttempt,
  WriteAttemptError,
  WriteHash,
  WriteStep,
} from '@/shared/lib/write-attempt';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';
import type { WriteAttemptAdapter } from '@/shared/model/use-write-attempt';
import { describeSwapError } from '@/features/swap-token/lib/swap-errors';
import { parseSwapReceipt } from '@/features/swap-token/lib/swap-events';
import {
  clearSwapRecord,
  readSwapRecord,
  writeSwapRecord,
  type SwapRecord,
  type SwapRecordKind,
} from '@/features/swap-token/lib/swap-receipt-record';
import { swapTokenKey, type SwapRoute, type SwapToken } from '@/features/swap-token/lib/swap-types';
import type { SwapPairRead } from '@/features/swap-token/lib/swap-route';

export type SwapTxAction = 'approve' | 'swap';

/** A first `approve(router, amount)` of the input token. */
export interface SwapApproveIntent {
  readonly action: 'approve';
  readonly tokenAddress: HexAddress;
  readonly amount: bigint;
}

/**
 * Everything the swap record needs, captured at submit time — the persisted hash
 * must resume the same pair/route context even if the page changes afterwards.
 */
export interface SwapMainIntent {
  readonly action: 'swap';
  readonly kind: SwapRecordKind;
  readonly fromKey: string;
  readonly toKey: string;
  readonly fromSymbol: string;
  readonly toSymbol: string;
  readonly fromDecimals: number | undefined;
  readonly toDecimals: number | undefined;
  readonly amountIn: bigint;
  readonly minOut: bigint;
  readonly quoteOut: bigint | undefined;
  readonly path: readonly HexAddress[];
  readonly pathSymbols: readonly string[];
  readonly pairAddresses: readonly HexAddress[];
  readonly pairToken0: readonly HexAddress[];
  readonly pairToken1: readonly HexAddress[];
}

export type SwapIntent = SwapApproveIntent | SwapMainIntent;

/** Build the main intent from the resolved route/execution (original record shape). */
export function swapMainIntent(
  route: SwapRoute,
  from: SwapToken,
  to: SwapToken,
  amounts: {
    readonly amountIn: bigint;
    readonly minOut: bigint;
    readonly quoteOut: bigint | undefined;
  },
): SwapMainIntent {
  return {
    action: 'swap',
    kind: route.kind,
    fromKey: swapTokenKey(from),
    toKey: swapTokenKey(to),
    fromSymbol: from.symbol,
    toSymbol: to.symbol,
    fromDecimals: from.decimals,
    toDecimals: to.decimals,
    amountIn: amounts.amountIn,
    minOut: amounts.minOut,
    quoteOut: amounts.quoteOut,
    path: route.kind === 'swap' ? [...route.pathAddresses] : [],
    pathSymbols: [...route.displayPath],
    pairAddresses: route.pairs.map((pair) => pair.address),
    pairToken0: route.pairs.map((pair) => pair.token0),
    pairToken1: route.pairs.map((pair) => pair.token1),
  };
}

/** Per-attempt memory the adapter callbacks share across renders. */
interface SwapAttemptMemory {
  /** Last submitted/hydrated intent; `parseReceipt` / `translate` read it back. */
  intent: SwapIntent | null;
  step: WriteStep;
  /** Hash the wallet returned; a hydrated attempt already has one. */
  hash: WriteHash | undefined;
  /** Input symbol for the send-failure copy, captured at submit time. */
  fromSymbol: string;
}

export interface SwapAttemptOptions {
  readonly scope: CacheScope | null;
  readonly chainId: number;
  readonly account: HexAddress | undefined;
  readonly router: HexAddress | undefined;
  readonly wrappedAddress: HexAddress | undefined;
  readonly nativeSymbol: string;
  readonly fromSymbol: string;
  readonly onConfirmed?: () => void;
  /** A hash came back from the wallet. */
  readonly onHash?: (step: WriteStep) => void;
  /** The send failed; nothing will be persisted for this attempt. */
  readonly onSendFailed?: (step: WriteStep) => void;
  /** The main hash has been persisted (a refresh can resume it). */
  readonly onRecordWritten?: () => void;
}

function intentOfRecord(record: SwapRecord): SwapMainIntent {
  return {
    action: 'swap',
    kind: record.kind,
    fromKey: record.fromKey,
    toKey: record.toKey,
    fromSymbol: record.fromSymbol,
    toSymbol: record.toSymbol,
    fromDecimals: record.fromDecimals,
    toDecimals: record.toDecimals,
    amountIn: record.amountIn ?? 0n,
    minOut: record.minOut ?? 0n,
    quoteOut: record.quoteOut,
    path: record.path as HexAddress[],
    pathSymbols: record.pathSymbols,
    pairAddresses: record.pairAddresses as HexAddress[],
    pairToken0: record.pairToken0 as HexAddress[],
    pairToken1: record.pairToken1 as HexAddress[],
  };
}

function pairReadsOf(record: SwapMainIntent): SwapPairRead[] {
  return record.pairAddresses.flatMap((address, index) => {
    const token0 = record.pairToken0[index];
    const token1 = record.pairToken1[index];
    if (token0 === undefined || token1 === undefined) return [];
    return [{ address, token0, token1, reserve0: 0n, reserve1: 0n } as SwapPairRead];
  });
}

function deadlineSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 1200);
}

/**
 * Adapter for one 兑换 attempt under the shared write-attempt core.
 *
 * `persist: 'afterHash'` keeps the pre-refresh recovery: the hash (and the whole
 * receipt context) is written the moment the wallet returns it, so a refresh in
 * the pending window resumes 确认中 instead of offering a second swap. A mined
 * record is cleared again — the receipt is a one-time page state (owner 2026-11-14)
 * and never pops up after the page is revisited.
 *
 * `approve: 'single'` drives the ERC20 ladder: one exact-amount approval of the
 * input token, then the swap. An approval is never persisted; a refresh recovers
 * it from `allowance()`, the same as before.
 *
 * Three write shapes stay here, exactly as the pre-migration `send` had them:
 * `wrap` (WETH deposit), `unwrap` (WETH withdraw) and the router swap.
 */
export function useSwapAttemptAdapter(options: SwapAttemptOptions): WriteAttemptAdapter<
  SwapIntent,
  SwapRecord,
  SwapRecord | null
> & {
  /** Which step the current error belongs to (the pending slot is already idle). */
  lastAction(): SwapTxAction;
} {
  const { writeContractAsync } = useWriteContract();
  // Never read during render; `send` / `parseReceipt` / `translate` / `onConfirmed`
  // are the only readers and writers.
  const memory = useRef<SwapAttemptMemory>({
    intent: null,
    step: 'main',
    hash: undefined,
    fromSymbol: options.fromSymbol,
  });

  const sendApprove = async (intent: SwapApproveIntent, nonce?: number): Promise<WriteHash> => {
    const router = options.router;
    if (router === undefined) throw new Error('router unavailable');
    return writeContractAsync({
      address: intent.tokenAddress,
      abi: love20TokenAbi,
      functionName: 'approve',
      args: [router, intent.amount],
      ...(nonce !== undefined ? { nonce } : {}),
    });
  };

  const writeSwapRequest = async (intent: SwapMainIntent, nonce?: number): Promise<WriteHash> => {
    const nonceOption = nonce !== undefined ? { nonce } : {};
    if (intent.kind === 'wrap') {
      if (options.wrappedAddress === undefined) throw new Error('wrapped native unavailable');
      return writeContractAsync({
        address: options.wrappedAddress,
        abi: weth9Abi,
        functionName: 'deposit',
        value: intent.amountIn,
        ...nonceOption,
      });
    }
    if (intent.kind === 'unwrap') {
      if (options.wrappedAddress === undefined) throw new Error('wrapped native unavailable');
      return writeContractAsync({
        address: options.wrappedAddress,
        abi: weth9Abi,
        functionName: 'withdraw',
        args: [intent.amountIn],
        ...nonceOption,
      });
    }
    const router = options.router;
    const account = options.account;
    if (router === undefined || account === undefined) throw new Error('router unavailable');
    const path = [...intent.path];
    const swapDeadline = deadlineSeconds();
    if (intent.fromKey === 'native') {
      return writeContractAsync({
        address: router,
        abi: uniswapV2Router02Abi,
        functionName: 'swapExactETHForTokens',
        args: [intent.minOut, path, account, swapDeadline],
        value: intent.amountIn,
        ...nonceOption,
      });
    }
    if (intent.toKey === 'native') {
      return writeContractAsync({
        address: router,
        abi: uniswapV2Router02Abi,
        functionName: 'swapExactTokensForETH',
        args: [intent.amountIn, intent.minOut, path, account, swapDeadline],
        ...nonceOption,
      });
    }
    return writeContractAsync({
      address: router,
      abi: uniswapV2Router02Abi,
      functionName: 'swapExactTokensForTokens',
      args: [intent.amountIn, intent.minOut, path, account, swapDeadline],
      ...nonceOption,
    });
  };

  return {
    persist: 'afterHash',
    approve: 'single',
    ownerChanged: copy.txWatch.ownerChanged,
    reverted: copy.swap.errors.reverted,

    lastAction(): SwapTxAction {
      return memory.current.step === 'approve' ? 'approve' : 'swap';
    },

    readRecord(): WriteAttempt<SwapIntent> | null {
      const { scope, chainId, account } = options;
      if (scope === null || account === undefined) return null;
      const stored = readSwapRecord(scope);
      if (stored === null) return null;
      // Only an unconfirmed (pending) hash is resumed. A confirmed receipt is a
      // one-time page state and must never be replayed from the cache.
      if (stored.confirmed) {
        clearSwapRecord(scope);
        return null;
      }
      const intent = intentOfRecord(stored);
      memory.current = {
        intent,
        step: 'main',
        hash: stored.hash,
        fromSymbol: stored.fromSymbol,
      };
      return {
        intent,
        owner: { chainId, account },
        step: 'main',
        hash: stored.hash,
      };
    },

    writeRecord(attempt: WriteAttempt<SwapIntent>): SwapRecord | null {
      const { scope } = options;
      const hash = attempt.hash;
      const intent = attempt.intent;
      if (scope === null || hash === undefined || intent.action !== 'swap') return null;
      const record: SwapRecord = {
        hash,
        kind: intent.kind,
        fromKey: intent.fromKey,
        toKey: intent.toKey,
        fromSymbol: intent.fromSymbol,
        toSymbol: intent.toSymbol,
        fromDecimals: intent.fromDecimals,
        toDecimals: intent.toDecimals,
        amountIn: intent.amountIn,
        minOut: intent.minOut,
        quoteOut: intent.quoteOut,
        actualOut: undefined,
        paidIn: undefined,
        path: [...intent.path],
        pathSymbols: [...intent.pathSymbols],
        pairAddresses: [...intent.pairAddresses],
        pairToken0: [...intent.pairToken0],
        pairToken1: [...intent.pairToken1],
        belowMinOut: false,
        confirmed: false,
        recordedAt: Date.now(),
      };
      writeSwapRecord(scope, record);
      options.onRecordWritten?.();
      return record;
    },

    clearRecord(): void {
      const { scope } = options;
      if (scope !== null) clearSwapRecord(scope);
    },

    async send(step: WriteStep, intent: SwapIntent, nonce?: number): Promise<WriteHash> {
      memory.current = {
        intent,
        step,
        hash: undefined,
        fromSymbol: intent.action === 'swap' ? intent.fromSymbol : options.fromSymbol,
      };
      const hash =
        intent.action === 'approve'
          ? await sendApprove(intent, nonce)
          : await writeSwapRequest(intent, nonce);
      memory.current.hash = hash;
      options.onHash?.(step);
      return hash;
    },

    parseReceipt(step: WriteStep, receipt: TransactionReceipt): SwapRecord | null {
      if (step !== 'main') return null;
      const intent = memory.current.intent;
      if (intent === null || intent.action !== 'swap') return null;
      const parsed = parseSwapReceipt({
        kind: intent.kind,
        path: intent.path,
        pairs: pairReadsOf(intent),
        logs: receipt.logs,
        account: options.account ?? ZERO_ADDRESS,
        amountIn: intent.amountIn,
        minOut: intent.minOut,
      });
      return {
        hash: memory.current.hash ?? receipt.transactionHash,
        kind: intent.kind,
        fromKey: intent.fromKey,
        toKey: intent.toKey,
        fromSymbol: intent.fromSymbol,
        toSymbol: intent.toSymbol,
        fromDecimals: intent.fromDecimals,
        toDecimals: intent.toDecimals,
        amountIn: intent.amountIn,
        minOut: intent.minOut,
        quoteOut: intent.quoteOut,
        actualOut: parsed.actualOut,
        paidIn: parsed.paidIn,
        path: [...intent.path],
        pathSymbols: [...intent.pathSymbols],
        pairAddresses: [...intent.pairAddresses],
        pairToken0: [...intent.pairToken0],
        pairToken1: [...intent.pairToken1],
        belowMinOut: parsed.belowMinOut,
        confirmed: true,
        recordedAt: Date.now(),
      };
    },

    translate(cause: unknown): WriteAttemptError {
      options.onSendFailed?.(memory.current.step);
      const message = describeSwapError(cause, {
        nativeSymbol: options.nativeSymbol,
        fromSymbol: memory.current.fromSymbol,
      });
      const recovery = txSendRecoveryKind(cause);
      return { message, ...(recovery !== undefined ? { kind: recovery } : {}) };
    },

    onConfirmed(): void {
      options.onConfirmed?.();
    },
  };
}
