import type { CacheScope } from '@/shared/lib/cache';
import {
  clearWriteRecord,
  isRecord,
  labelOf,
  readWriteRecord,
  writeWriteRecord,
  type WriteHash,
  type WriteRecordAdapter,
} from '@/shared/lib/write-record';

export type HexHash = WriteHash;

/**
 * One claim receipt, as rendered by the page.
 *
 * `amount` is the value parsed from AirdropClaimed.amount, never the estimate
 * that was displayed before submitting. A local record without an amount is
 * still useful: it lets a refresh resume the pending transaction instead of
 * showing a fresh CTA.
 */
export interface AirdropClaimReceipt {
  readonly hash: HexHash;
  readonly amount: bigint | undefined;
  readonly share: bigint | undefined;
  /** Snapshot total at claim time, so percentages survive a refresh without a re-read. */
  readonly totalShare: bigint | undefined;
  readonly remainingShare: bigint | undefined;
  readonly tokenSymbol: string | undefined;
  readonly tokenDecimals: number | undefined;
  /** Local confirmation time (ms since epoch); not a chain timestamp. */
  readonly recordedAt: number | undefined;
}

/** Semantic cache key; the scope already namespaces chain/contract/wallet. */
export const AIRDROP_CLAIM_CACHE_KEY = 'airdropClaim';

const DECIMAL_RE = /^\d+$/;

function decimalOf(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || !DECIMAL_RE.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function decimalsOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 36
    ? value
    : undefined;
}

export function createAirdropClaimScope(
  chainId: number,
  contractAddress: string,
  wallet: string,
): CacheScope {
  return { chainId, contractAddress, wallet };
}

/** Everything but the envelope's hash and recordedAt. */
interface AirdropClaimPayload {
  readonly amount: bigint | undefined;
  readonly share: bigint | undefined;
  readonly totalShare: bigint | undefined;
  readonly remainingShare: bigint | undefined;
  readonly tokenSymbol: string | undefined;
  readonly tokenDecimals: number | undefined;
}

const EMPTY_PAYLOAD: AirdropClaimPayload = {
  amount: undefined,
  share: undefined,
  totalShare: undefined,
  remainingShare: undefined,
  tokenSymbol: undefined,
  tokenDecimals: undefined,
};

function decimalString(value: bigint | undefined): string | undefined {
  return value === undefined ? undefined : value.toString();
}

const adapter: WriteRecordAdapter<AirdropClaimPayload> = {
  key: AIRDROP_CLAIM_CACHE_KEY,
  encodePayload: (payload) => ({
    amount: decimalString(payload.amount),
    share: decimalString(payload.share),
    totalShare: decimalString(payload.totalShare),
    remainingShare: decimalString(payload.remainingShare),
    tokenSymbol: payload.tokenSymbol,
    tokenDecimals: payload.tokenDecimals,
  }),
  decodePayload: (raw) => {
    if (!isRecord(raw)) return null;
    return {
      amount: decimalOf(raw.amount),
      share: decimalOf(raw.share),
      totalShare: decimalOf(raw.totalShare),
      remainingShare: decimalOf(raw.remainingShare),
      tokenSymbol: labelOf(raw.tokenSymbol, 64),
      tokenDecimals: decimalsOf(raw.tokenDecimals),
    };
  },
};

function writeReceipt(
  scope: CacheScope,
  hash: HexHash,
  payload: AirdropClaimPayload,
  recordedAt: number | undefined,
): void {
  writeWriteRecord(adapter, scope, {
    hash,
    chainId: scope.chainId,
    account: scope.wallet as `0x${string}`,
    nonce: undefined,
    recordedAt: recordedAt ?? Date.now(),
    payload,
  });
}

/**
 * Reads the local claim record. A missing/invalid hash or envelope invalidates the
 * record (the page falls back to the on-chain isClaimed read); a missing amount
 * keeps the hash so a pending transaction can be recovered.
 */
export function readAirdropClaimRecord(scope: CacheScope): AirdropClaimReceipt | null {
  const record = readWriteRecord(adapter, scope);
  if (record === null) return null;
  return {
    hash: record.hash,
    ...record.payload,
    recordedAt: record.recordedAt,
  };
}

/** Persists the hash as soon as the wallet returns it, before it is mined. */
export function writeAirdropClaimPending(scope: CacheScope, hash: HexHash): void {
  writeReceipt(scope, hash, EMPTY_PAYLOAD, undefined);
}

/** Persists the confirmed receipt so a refresh keeps showing 已铸造 + the amount. */
export function writeAirdropClaimReceipt(scope: CacheScope, receipt: AirdropClaimReceipt): void {
  writeReceipt(
    scope,
    receipt.hash,
    {
      amount: receipt.amount,
      share: receipt.share,
      totalShare: receipt.totalShare,
      remainingShare: receipt.remainingShare,
      tokenSymbol: receipt.tokenSymbol,
      tokenDecimals: receipt.tokenDecimals,
    },
    receipt.recordedAt,
  );
}

export function clearAirdropClaimRecord(scope: CacheScope): void {
  clearWriteRecord(adapter, scope);
}
