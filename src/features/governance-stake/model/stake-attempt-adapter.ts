import { useRef } from 'react';
import type { Abi, TransactionReceipt } from 'viem';
import { useWriteContract } from 'wagmi';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import type { CacheScope } from '@/shared/lib/cache';
import { toUserMessage } from '@/shared/lib/errors';
import type {
  WriteAttempt,
  WriteAttemptError,
  WriteHash,
  WriteStep,
} from '@/shared/lib/write-attempt';
import type { WriteAttemptAdapter } from '@/shared/model/use-write-attempt';
import {
  clearStoredStakeCall,
  readStoredStakeCall,
  writeStoredStakeCall,
  type StoredStakeCall,
} from '../lib/stake-record';
import {
  parseStakeReceipt,
  type StakeReceipt,
  type StakeReceiptAction,
} from '../lib/stake-receipt';

/** One prepared Stake write, as the page hands it to `run`. */
export interface StakeCall {
  readonly address: HexAddress;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly value?: bigint;
}

/** One token approval the page hands to `approve`. */
export interface StakeApproveRequest {
  readonly tokenAddress: HexAddress;
  readonly abi: Abi;
  readonly spender: HexAddress;
  readonly amount: bigint;
}

interface StakeMainIntent {
  readonly kind: 'call';
  readonly call: StakeCall;
  readonly action: StakeReceiptAction;
}

interface StakeApproveIntent {
  readonly kind: 'approve';
  readonly request: StakeApproveRequest;
}

/**
 * What the hook hands the core: one prepared Stake call, or one token approval.
 * The tag keeps the two write shapes apart — the page can never sign an approval
 * through `run` (or a Stake call through `approve`).
 */
export type StakeIntent = StakeMainIntent | StakeApproveIntent;

const RECEIPT_ACTIONS: readonly StakeReceiptAction[] = [
  'stakeLiquidity',
  'stakeBoost',
  'increasePhases',
  'unstake',
  'withdraw',
];

/** The action recorded by a persisted call must be one this page actually sends. */
function actionOf(value: string): StakeReceiptAction | undefined {
  return RECEIPT_ACTIONS.find((entry) => entry === value);
}

/** Per-attempt memory the adapter callbacks share across renders. */
interface StakeAttemptMemory {
  /** The main call handed to the wallet; `parseReceipt` rebuilds the receipt from it. */
  main: StakeMainIntent | null;
  /** Hash the wallet returned for that main call; approvals keep no hash here. */
  hash: WriteHash | undefined;
}

export interface StakeAttemptOptions {
  readonly scope: CacheScope | null;
  readonly onConfirmed: () => void;
  /**
   * Fired once a wallet write settles (hash returned, or the send rejected).
   * This is the moment the pre-migration hook's `run`/`approve` promise ended:
   * the page awaits the wallet step, never the receipt.
   */
  readonly onSendSettled?: (step: WriteStep) => void;
}

/**
 * Adapter for 治理·质押 under the shared write-attempt core.
 *
 * 质押 has an optional 「授权」 step in front of the Stake call: `approve: 'keyed'`
 * keeps one approval slot keyed by the token address, so the panel can show the
 * in-flight row for the token being approved while the other token rows stay idle.
 *
 * `persist: 'afterHash'` keeps the pre-migration recovery semantics: the hash is
 * written the moment the wallet returns it, so a refresh resumes the SAME pending
 * transaction instead of offering a second stake; a record restored for another
 * wallet/chain is dropped by the core with the neutral `ownerChanged` copy, never
 * signed. Only the main call is persisted — an approval is not a task of its own,
 * and a signature failure leaves nothing to resubmit.
 *
 * The receipt is decoded from the submitted action (`parseStakeReceipt`): the
 * numbers the sheet shows are the ones the chain logged, never the page estimate.
 */
export function useStakeAttemptAdapter(
  options: StakeAttemptOptions,
): WriteAttemptAdapter<StakeIntent, StakeReceipt, StoredStakeCall | null> {
  const { writeContractAsync } = useWriteContract();
  // Never read during render; only `send` / `parseReceipt` touch it.
  const memory = useRef<StakeAttemptMemory>({ main: null, hash: undefined });

  /** The one place a wallet write is produced; `send` adds the settle signal. */
  const writeWallet = async (
    step: WriteStep,
    intent: StakeIntent,
    nonceOption: { readonly nonce?: number },
  ): Promise<WriteHash> => {
    if (step === 'approve') {
      if (intent.kind !== 'approve') throw new Error('stake approval intent unavailable');
      const request = intent.request;
      return writeContractAsync({
        address: request.tokenAddress,
        abi: request.abi,
        functionName: 'approve',
        args: [request.spender, request.amount],
        ...nonceOption,
      });
    }
    if (intent.kind !== 'call') throw new Error('stake call intent unavailable');
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
    ownerChanged: copy.gov.tx.ownerChanged,
    reverted: copy.gov.tx.revert,

    readRecord(): WriteAttempt<StakeIntent> | null {
      const { scope } = options;
      // No connected wallet = no scope: keep the record for the wallet coming back.
      if (scope === null) return null;
      const stored = readStoredStakeCall(scope);
      if (stored === null) return null;
      const action = actionOf(stored.action);
      if (action === undefined) {
        // A record whose action is not one of the Stake writes can never be
        // signed or turned into a receipt; it is not a restorable task.
        clearStoredStakeCall(scope);
        return null;
      }
      return {
        intent: { kind: 'call', call: stored.call, action },
        owner: { chainId: stored.chainId, account: stored.account },
        step: 'main',
        hash: stored.hash,
        ...(stored.nonce !== undefined ? { nonce: stored.nonce } : {}),
      };
    },

    writeRecord(attempt: WriteAttempt<StakeIntent>): StoredStakeCall | null {
      const { scope } = options;
      const hash = attempt.hash;
      if (hash === undefined || scope === null) return null;
      // Only the main call is a persisted task; approvals are core state only.
      if (attempt.intent.kind !== 'call') return null;
      const stored: StoredStakeCall = {
        hash,
        chainId: attempt.owner.chainId,
        account: attempt.owner.account,
        call: attempt.intent.call,
        action: attempt.intent.action,
        nonce: attempt.nonce,
        recordedAt: Date.now(),
      };
      writeStoredStakeCall(scope, stored);
      return stored;
    },

    clearRecord(): void {
      const { scope } = options;
      if (scope === null) return;
      clearStoredStakeCall(scope);
    },

    async send(step: WriteStep, intent: StakeIntent, nonce?: number): Promise<WriteHash> {
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

    parseReceipt(step: WriteStep, receipt: TransactionReceipt): StakeReceipt | null {
      if (step !== 'main') return null;
      const stored = options.scope !== null ? readStoredStakeCall(options.scope) : null;
      const action =
        memory.current.main?.action ?? (stored !== null ? actionOf(stored.action) : undefined);
      if (action === undefined) return null;
      const hash = memory.current.hash ?? stored?.hash ?? receipt.transactionHash;
      return {
        action,
        hash,
        detail: parseStakeReceipt(action, receipt),
        recordedAt: Date.now(),
      };
    },

    translate(cause: unknown): WriteAttemptError {
      // The page shows the sentence only; no selector, gas or nonce wording leaks.
      return { message: toUserMessage(cause) };
    },

    onConfirmed(): void {
      options.onConfirmed();
    },
  };
}
