import { useRef } from 'react';
import type { Abi, TransactionReceipt } from 'viem';
import { useWriteContract } from 'wagmi';
import { love20TokenAbi, uniswapV2PairAbi } from '@/config/abis';
import { NETWORK, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import type { CacheScope } from '@/shared/lib/cache';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';
import type {
  WriteAttempt,
  WriteAttemptError,
  WriteHash,
  WriteStep,
} from '@/shared/lib/write-attempt';
import type { WriteAttemptAdapter } from '@/shared/model/use-write-attempt';
import { describeLiquidityError } from '../lib/liquidity-errors';
import {
  clearStoredLiquidity,
  readStoredLiquidity,
  writeStoredLiquidity,
  type StoredLiquidity,
} from '../lib/liquidity-record';

/** One prepared 加池/撤出 write, as the page hands it to `run`. */
export interface LiquidityCall {
  readonly address: HexAddress;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly value?: bigint;
}

/** The success sheet's title + amount line, built by the page at submit time. */
export interface LiquidityNote {
  readonly title: string;
  readonly detail?: string;
}

export interface LiquidityApproveRequest {
  readonly tokenAddress: HexAddress;
  /** `erc20` 是普通代币授权；`lp` 是给 Router 的流动性凭证授权。 */
  readonly kind: 'erc20' | 'lp';
  readonly spender: HexAddress;
  readonly amount: bigint;
}

/** The success strip: never re-derives the amounts, it reuses the note it was given. */
export interface LiquidityReceipt {
  readonly hash: `0x${string}`;
  readonly title: string;
  readonly detail: string | undefined;
  readonly recordedAt: number;
}

interface LiquidityMainIntent {
  readonly kind: 'call';
  readonly call: LiquidityCall;
  readonly note: LiquidityNote;
}

interface LiquidityApproveIntent {
  readonly kind: 'approve';
  readonly request: LiquidityApproveRequest;
}

/**
 * What the hook hands the core: one prepared liquidity call, or one token
 * allowance approval. The tag keeps the two write shapes apart.
 */
export type LiquidityIntent = LiquidityMainIntent | LiquidityApproveIntent;

/** Per-attempt memory the adapter callbacks share across renders. */
interface LiquidityAttemptMemory {
  /** The main call handed to the wallet; `parseReceipt` builds the strip from its note. */
  main: LiquidityMainIntent | null;
  /** Hash the wallet returned for that main call; approvals keep no hash here. */
  hash: WriteHash | undefined;
}

export interface LiquidityAttemptOptions {
  readonly scope: CacheScope | null;
  readonly onConfirmed: () => void;
  /**
   * Fired once a wallet write settles (hash returned, or the send rejected).
   * This is the moment the pre-migration hook's `run`/`approve` promise ended:
   * the page awaits the wallet step, never the receipt.
   */
  readonly onSendSettled?: (step: WriteStep) => void;
}

const ERROR_CONTEXT = {
  nativeSymbol: NETWORK.nativeCurrency.symbol,
  tokenSymbol: copy.liquidity.tokenLabel,
};

/**
 * Adapter for 加池 / 撤出 under the shared write-attempt core.
 *
 * 流动性 has an optional 「允许使用」 step in front of the Router/Hub call:
 * `approve: 'keyed'` keeps one approval slot keyed by the token address (ERC20 or
 * the LP token itself), so the panel knows which row is waiting and refreshes
 * `allowance` after every confirmed approval (`approveRevision`).
 *
 * `persist: 'afterHash'` keeps the recovery contract: only the main call is
 * written, and only once the wallet returns its hash, so a refresh resumes the
 * SAME pending transaction instead of submitting a second 加池/撤出. A record
 * restored for another wallet/chain is dropped by the core with the neutral
 * `ownerChanged` copy — the `to` argument of a liquidity call points at an
 * account, so signing another wallet's record would move real assets.
 *
 * The success strip is the note the page submitted (`{title, detail}`), not a
 * re-read of chain state; the page refreshes its numbers through `onConfirmed`.
 */
export function useLiquidityAttemptAdapter(
  options: LiquidityAttemptOptions,
): WriteAttemptAdapter<LiquidityIntent, LiquidityReceipt, StoredLiquidity | null> {
  const { writeContractAsync } = useWriteContract();
  // Never read during render; only `send` / `parseReceipt` / `translate` touch it.
  const memory = useRef<LiquidityAttemptMemory>({ main: null, hash: undefined });

  /** The one place a wallet write is produced; `send` adds the settle signal. */
  const writeWallet = async (
    step: WriteStep,
    intent: LiquidityIntent,
    nonceOption: { readonly nonce?: number },
  ): Promise<WriteHash> => {
    if (step === 'approve') {
      if (intent.kind !== 'approve') throw new Error('liquidity approval intent unavailable');
      const request = intent.request;
      // `erc20` = community/parent token, `lp` = the pair's own liquidity token.
      const abi = request.kind === 'lp' ? uniswapV2PairAbi : love20TokenAbi;
      return writeContractAsync({
        address: request.tokenAddress,
        abi,
        functionName: 'approve',
        args: [request.spender, request.amount],
        ...nonceOption,
      });
    }
    if (intent.kind !== 'call') throw new Error('liquidity call intent unavailable');
    const hash = await writeContractAsync({
      address: intent.call.address,
      abi: intent.call.abi,
      functionName: intent.call.functionName,
      args: intent.call.args,
      ...(intent.call.value !== undefined ? { value: intent.call.value } : {}),
      ...nonceOption,
    });
    memory.current.main = intent;
    memory.current.hash = hash;
    return hash;
  };

  return {
    persist: 'afterHash',
    approve: 'keyed',
    ownerChanged: copy.txWatch.ownerChanged,
    reverted: copy.liquidity.errors.reverted,

    readRecord(): WriteAttempt<LiquidityIntent> | null {
      const { scope } = options;
      // No connected wallet = no scope: keep the record for the wallet coming back.
      if (scope === null) return null;
      const stored = readStoredLiquidity(scope);
      if (stored === null) return null;
      return {
        intent: { kind: 'call', call: stored.call, note: stored.note },
        owner: { chainId: stored.chainId, account: stored.account },
        step: 'main',
        hash: stored.hash,
        ...(stored.nonce !== undefined ? { nonce: stored.nonce } : {}),
      };
    },

    writeRecord(attempt: WriteAttempt<LiquidityIntent>): StoredLiquidity | null {
      const { scope } = options;
      const hash = attempt.hash;
      if (hash === undefined || scope === null) return null;
      // Only the main call is a persisted task; approvals are core state only.
      if (attempt.intent.kind !== 'call') return null;
      const stored: StoredLiquidity = {
        hash,
        chainId: attempt.owner.chainId,
        account: attempt.owner.account,
        call: attempt.intent.call,
        note: attempt.intent.note,
        nonce: attempt.nonce,
        recordedAt: Date.now(),
      };
      writeStoredLiquidity(scope, stored);
      return stored;
    },

    clearRecord(): void {
      const { scope } = options;
      if (scope === null) return;
      clearStoredLiquidity(scope);
    },

    async send(step: WriteStep, intent: LiquidityIntent, nonce?: number): Promise<WriteHash> {
      const nonceOption = nonce !== undefined ? { nonce } : {};
      let hash: WriteHash;
      try {
        hash = await writeWallet(step, intent, nonceOption);
      } catch (cause) {
        // A rejected send is the end of this attempt for the page: report it
        // before the core records the error.
        options.onSendSettled?.(step);
        throw cause;
      }
      options.onSendSettled?.(step);
      return hash;
    },

    parseReceipt(step: WriteStep, receipt: TransactionReceipt): LiquidityReceipt | null {
      if (step !== 'main') return null;
      const stored = options.scope !== null ? readStoredLiquidity(options.scope) : null;
      const note = memory.current.main?.note ?? stored?.note;
      if (note === undefined) return null;
      const hash = memory.current.hash ?? stored?.hash ?? receipt.transactionHash;
      return {
        hash,
        title: note.title,
        detail: note.detail,
        recordedAt: Date.now(),
      };
    },

    translate(cause: unknown): WriteAttemptError {
      const message = describeLiquidityError(cause, ERROR_CONTEXT);
      // Send-time recovery families still reach the page (nonce gap / stale block).
      const recovery = txSendRecoveryKind(cause);
      return { message, ...(recovery !== undefined ? { kind: recovery } : {}) };
    },

    onConfirmed(): void {
      options.onConfirmed();
    },
  };
}
