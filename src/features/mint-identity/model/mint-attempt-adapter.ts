import { useRef } from 'react';
import { parseEventLogs, type TransactionReceipt } from 'viem';
import { useWriteContract } from 'wagmi';
import { love20TokenAbi, memberNftAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cache, type CacheScope } from '@/shared/lib/cache';
import type { WriteAttempt, WriteAttemptError, WriteStep } from '@/shared/lib/write-attempt';
import { txSendRecoveryKind } from '@/shared/lib/tx-send-errors';
import type { WriteAttemptAdapter } from '@/shared/model/use-write-attempt';
import { describeMintError } from '@/features/mint-identity/lib/mint-errors';

export interface MintedIdentity {
  readonly memberId: bigint;
  /** On-chain memberName (MemberMinted.name); the chain stores the raw input verbatim. */
  readonly name: string;
  /** MemberMinted.cost — exactly what the contract pulled and burned. */
  readonly cost: bigint;
  readonly hash: HexHash;
}

export type HexHash = `0x${string}`;
export type MintPendingKind = 'approve' | 'mint';

export type MintIntent =
  | { readonly action: 'approve'; readonly amount: bigint }
  | { readonly action: 'mint'; readonly name: string };

const MINT_TASK_KEY = 'mintTask';

interface StoredMintTask {
  readonly hash?: unknown;
}

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function readStoredHash(scope: CacheScope): HexHash | null {
  const raw = cache.get<StoredMintTask>(scope, MINT_TASK_KEY);
  if (raw === null || typeof raw.hash !== 'string' || !HASH_RE.test(raw.hash)) return null;
  return raw.hash as HexHash;
}

/** Per-attempt memory the adapter callbacks share across renders. */
interface MintAttemptMemory {
  /** Step of the last send/hydrated attempt; picks the error `action` + callbacks. */
  step: MintPendingKind;
  /** Set by the `reverted` getter so `onConfirmed` never fires on a failed mint. */
  reverted: boolean;
}

export interface MintAttemptOptions {
  readonly scope: CacheScope | null;
  readonly chainId: number;
  readonly account: HexAddress | undefined;
  readonly memberNftAddress: HexAddress | undefined;
  readonly paymentTokenAddress: HexAddress | undefined;
  readonly paymentTokenSymbol: string | undefined;
  /** A mined mint without a MemberMinted log is not a revert: neutral copy instead. */
  readonly onMissingReceiptLog: () => void;
  readonly onConfirmed: () => void;
}

/**
 * Adapter for the 空投铸造 approve → mint ladder under the shared write-attempt core.
 *
 * `persist: 'afterHash'` keeps the pre-refresh recovery, but only the mint hash is
 * persisted — it is the one transaction whose result is a user-visible page state.
 * An approval is recovered from `allowance()` instead (a refresh simply leaves
 * stage 1 visible only while allowance is short), so the stored shape stays
 * `{ hash }` (UX spec §4.2). A mined mint clears the hash again: the receipt is a
 * one-time page state (owner 2026-11-14) and is never replayed.
 *
 * The receipt comes from the `MemberMinted` log — never from the quote that was
 * displayed before submitting. A malformed/missing log is reported through
 * `onMissingReceiptLog`, and the page answers with the neutral 读不到身份编号 card.
 */
export function useMintAttemptAdapter(options: MintAttemptOptions): WriteAttemptAdapter<
  MintIntent,
  MintedIdentity,
  HexHash | null
> & {
  /** Which step the current error belongs to (the pending slot is already idle). */
  lastAction(): MintPendingKind;
} {
  const { writeContractAsync } = useWriteContract();
  // Never read during render; `send` / `parseReceipt` / `translate` / `onConfirmed`
  // are the only readers and writers.
  const memory = useRef<MintAttemptMemory>({ step: 'mint', reverted: false });

  return {
    persist: 'afterHash',
    approve: 'single',
    ownerChanged: copy.txWatch.ownerChanged,
    get reverted(): string {
      memory.current.reverted = true;
      return copy.mintIdentity.errors.reverted;
    },

    lastAction(): MintPendingKind {
      return memory.current.step;
    },

    readRecord(): WriteAttempt<MintIntent> | null {
      const { scope, chainId, account } = options;
      if (scope === null || account === undefined) return null;
      const hash = readStoredHash(scope);
      if (hash === null) return null;
      memory.current = { step: 'mint', reverted: false };
      return {
        // Only the hash is persisted; the receipt (id/name/cost) always comes from
        // the MemberMinted log, so the restored intent needs no name.
        intent: { action: 'mint', name: '' },
        owner: { chainId, account },
        step: 'main',
        hash,
      };
    },

    writeRecord(attempt: WriteAttempt<MintIntent>): HexHash | null {
      const { scope } = options;
      const hash = attempt.hash;
      if (scope === null || hash === undefined) return null;
      // 只有拿到哈希之后才落记录：签名失败不保留任何可重发的请求。
      cache.set(scope, MINT_TASK_KEY, { hash });
      return hash;
    },

    clearRecord(): void {
      const { scope } = options;
      if (scope !== null) cache.remove(scope, MINT_TASK_KEY);
    },

    async send(step: WriteStep, intent: MintIntent, nonce?: number): Promise<HexHash> {
      memory.current = {
        step: step === 'approve' ? 'approve' : 'mint',
        reverted: false,
      };
      const nonceOption = nonce !== undefined ? { nonce } : {};
      if (intent.action === 'approve') {
        const { paymentTokenAddress, memberNftAddress } = options;
        if (paymentTokenAddress === undefined || memberNftAddress === undefined) {
          throw new Error('mint configuration unavailable');
        }
        return writeContractAsync({
          address: paymentTokenAddress,
          abi: love20TokenAbi,
          functionName: 'approve',
          args: [memberNftAddress, intent.amount],
          ...nonceOption,
        });
      }
      const { memberNftAddress } = options;
      if (memberNftAddress === undefined) throw new Error('member NFT unavailable');
      return writeContractAsync({
        address: memberNftAddress,
        abi: memberNftAbi,
        functionName: 'mint',
        args: [intent.name],
        ...nonceOption,
      });
    },

    parseReceipt(step: WriteStep, receipt: TransactionReceipt): MintedIdentity | null {
      if (step !== 'main') return null;
      // A malformed log must show the neutral "读不到身份编号" card, never crash.
      const events = (() => {
        try {
          return parseEventLogs({
            abi: memberNftAbi,
            logs: receipt.logs,
            eventName: 'MemberMinted',
          });
        } catch {
          return [];
        }
      })();
      const event = events[0];
      if (event === undefined) {
        options.onMissingReceiptLog();
        return null;
      }
      return {
        memberId: event.args.memberId,
        name: event.args.name,
        cost: event.args.cost,
        hash: receipt.transactionHash,
      };
    },

    translate(cause: unknown): WriteAttemptError {
      const recovery = txSendRecoveryKind(cause);
      return {
        message: describeMintError(cause, { paymentSymbol: options.paymentTokenSymbol }),
        ...(recovery !== undefined ? { kind: recovery } : {}),
      };
    },

    onConfirmed(): void {
      if (memory.current.reverted) {
        memory.current.reverted = false;
        return;
      }
      options.onConfirmed();
    },
  };
}
