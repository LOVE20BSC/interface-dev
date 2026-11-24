import { parseEventLogs, type TransactionReceipt } from 'viem';
import { useWriteContract } from 'wagmi';
import { airdropDistributorAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import type { AirdropSnapshotEntry } from '@/domain/airdrop-snapshot';
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
import { describeAirdropClaimError } from '@/features/claim-airdrop/lib/airdrop-errors';
import {
  clearAirdropClaimRecord,
  readAirdropClaimRecord,
  writeAirdropClaimPending,
  type AirdropClaimReceipt,
  type HexHash,
} from '@/features/claim-airdrop/lib/airdrop-claim-record';

/** What one claim sends; also the write attempt's intent. */
export interface AirdropClaimIntent {
  readonly tokenAddress: HexAddress | undefined;
  readonly share: bigint | undefined;
  readonly proof: readonly HexAddress[] | undefined;
}

export interface AirdropClaimAttemptOptions {
  readonly scope: CacheScope | null;
  readonly chainId: number;
  readonly account: HexAddress | undefined;
  readonly airdropAddress: HexAddress | undefined;
  readonly tokenAddress: HexAddress | undefined;
  readonly tokenSymbol: string | undefined;
  readonly tokenDecimals: number | undefined;
  readonly totalShare: bigint | undefined;
  readonly entry: AirdropSnapshotEntry | null;
  /** A claimed receipt without a matching log: the page answers with neutral copy. */
  readonly onMissingReceiptLog: () => void;
  readonly onConfirmed: () => void;
}

/**
 * Adapter for one 空投铸造 under the shared write-attempt core.
 *
 * `persist: 'afterHash'` keeps the pre-refresh recovery: the hash is written as
 * soon as the wallet returns it, so a reload resumes the pending claim instead of
 * offering a second mint. A mined claim clears the record again — the confirmed
 * receipt is page state for the session that mined it (owner 2026-11-14), and S6
 * 已铸造 is rebuilt from the chain, never replayed from the cache.
 *
 * The claim call keeps its original arguments (`claim(token, share, proof)`), and
 * the receipt amount comes from the `AirdropClaimed` log — never from the
 * estimate that was displayed before submitting.
 */
export function useAirdropClaimAttemptAdapter(
  options: AirdropClaimAttemptOptions,
): WriteAttemptAdapter<AirdropClaimIntent, AirdropClaimReceipt, HexHash | null> {
  const { writeContractAsync } = useWriteContract();

  return {
    persist: 'afterHash',
    approve: 'none',
    ownerChanged: copy.txWatch.ownerChanged,
    reverted: copy.airdrop.errors.reverted,

    readRecord(): WriteAttempt<AirdropClaimIntent> | null {
      const { scope, account, chainId } = options;
      if (scope === null || account === undefined) return null;
      const stored = readAirdropClaimRecord(scope);
      if (stored === null) return null;
      // Only an unconfirmed hash is resumed. A stored receipt (amount present) is
      // never replayed: the session that mined it already showed it.
      if (stored.amount !== undefined) {
        clearAirdropClaimRecord(scope);
        return null;
      }
      return {
        intent: {
          tokenAddress: options.tokenAddress,
          share: options.entry?.share,
          proof: options.entry?.proof,
        },
        owner: { chainId, account },
        step: 'main',
        hash: stored.hash,
      };
    },

    writeRecord(attempt: WriteAttempt<AirdropClaimIntent>): HexHash | null {
      const { scope } = options;
      const hash = attempt.hash;
      if (hash === undefined || scope === null) return null;
      writeAirdropClaimPending(scope, hash);
      return hash;
    },

    clearRecord(): void {
      if (options.scope === null) return;
      clearAirdropClaimRecord(options.scope);
    },

    async send(_step: WriteStep, intent: AirdropClaimIntent, nonce?: number): Promise<WriteHash> {
      const { airdropAddress } = options;
      if (
        airdropAddress === undefined ||
        intent.tokenAddress === undefined ||
        intent.share === undefined ||
        intent.proof === undefined
      ) {
        // The page only starts a claim with a resolved airdrop, token and entry;
        // this guard keeps the adapter honest for a restored/partial intent.
        throw new Error('airdrop claim unavailable');
      }
      return writeContractAsync({
        address: airdropAddress,
        abi: airdropDistributorAbi,
        functionName: 'claim',
        args: [intent.tokenAddress, intent.share, intent.proof],
        ...(nonce !== undefined ? { nonce } : {}),
      });
    },

    parseReceipt(step: WriteStep, receipt: TransactionReceipt): AirdropClaimReceipt | null {
      if (step !== 'main') return null;
      // A malformed log must show a neutral result, never crash or show the estimate.
      const events = (() => {
        try {
          return parseEventLogs({
            abi: airdropDistributorAbi,
            logs: receipt.logs,
            eventName: 'AirdropClaimed',
          });
        } catch {
          return [];
        }
      })();
      const event = events.find((candidate) => {
        const args = candidate.args;
        const eventClaimer = args.claimer;
        const eventToken = args.tokenAddress;
        return (
          options.account !== undefined &&
          options.tokenAddress !== undefined &&
          typeof eventClaimer === 'string' &&
          typeof eventToken === 'string' &&
          eventClaimer.toLowerCase() === options.account.toLowerCase() &&
          eventToken.toLowerCase() === options.tokenAddress.toLowerCase()
        );
      });
      if (event === undefined) {
        options.onMissingReceiptLog();
        return null;
      }
      return {
        hash: receipt.transactionHash,
        amount: event.args.amount,
        share: event.args.share,
        totalShare: options.totalShare,
        remainingShare: event.args.remainingShare,
        tokenSymbol: options.tokenSymbol,
        tokenDecimals: options.tokenDecimals,
        recordedAt: Date.now(),
      };
    },

    translate(cause: unknown): WriteAttemptError {
      const recovery = txSendRecoveryKind(cause);
      return {
        message: describeAirdropClaimError(cause),
        ...(recovery !== undefined ? { kind: recovery } : {}),
      };
    },

    onConfirmed(): void {
      options.onConfirmed();
    },
  };
}
