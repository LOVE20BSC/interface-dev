import { ZERO_ADDRESS, type HexAddress } from '@/config/networks';
import type { CacheScope } from '@/shared/lib/cache';
import {
  addressOf,
  clearWriteRecord,
  isRecord,
  labelOf,
  readWriteRecord,
  writeWriteRecord,
  type WriteHash,
  type WriteRecordAdapter,
} from '@/shared/lib/write-record';
import type { TransferRecord } from './transfer-receipt';
import type { TransferToken, TransferTokenKind } from './transfer-types';

export type HexHash = WriteHash;

/**
 * One transfer, persisted the moment the wallet returns a hash.
 *
 * 代币转账 has no protocol contract of its own, so the cache scope is the
 * contract-less ZERO_ADDRESS one: chain + wallet is the whole namespace.
 *
 * `confirmed` is what a refresh turns into page state (D1/D4):
 * - `false` → the pending card is restored and the bounded watcher keeps
 *   watching the same hash, so the page cannot silently submit a second
 *   transfer (the QA double-transfer);
 * - `true` → only the success strip is restored (amount + hash + explorer);
 *   the receipt sheet never pops up again (owner 2026-11-14, same rule as
 *   mint/swap).
 *
 * `chainId` / `account` / `nonce` live in the generic envelope (R2/R3): the
 * scope already namespaces the entry, but a record that is read through the
 * wrong scope (or was written by an older build) must still be rejected instead
 * of signed by whichever wallet happens to be connected now — and a restored
 * after a refresh must know the original nonce so it replaces that transaction
 * rather than sending a second one.
 */
export interface StoredTransfer {
  readonly hash: HexHash;
  readonly chainId: number;
  readonly account: HexAddress;
  /** Replay context: token + amount + recipient rebuild the exact same call. */
  readonly token: TransferToken;
  readonly amount: bigint;
  readonly recipient: HexAddress;
  readonly recipientLabel: string | undefined;
  /** Nonce we asked for / observed; the retry replaces this one, not the next. */
  readonly nonce: number | undefined;
  readonly confirmed: boolean;
  readonly recordedAt: number;
}

/** Semantic key; the scope already namespaces chain/wallet. */
export const TRANSFER_TASK_CACHE_KEY = 'transferTask';

const DECIMAL_RE = /^\d+$/;
const KINDS: readonly TransferTokenKind[] = ['native', 'community', 'wrapped', 'lp', 'custom'];

export function createTransferScope(chainId: number, wallet: string): CacheScope {
  return { chainId, contractAddress: ZERO_ADDRESS, wallet };
}

/** The persisted task as the receipt/strip renders it (no wallet or request leak). */
export function storedTransferToRecord(stored: StoredTransfer): TransferRecord {
  return {
    hash: stored.hash,
    tokenSymbol: stored.token.symbol,
    tokenDecimals: stored.token.decimals,
    native: stored.token.kind === 'native',
    amount: stored.amount,
    recipient: stored.recipient,
    recipientLabel: stored.recipientLabel,
    recordedAt: stored.recordedAt,
  };
}

function decimalOf(value: unknown): bigint | undefined {
  if (typeof value !== 'string' || !DECIMAL_RE.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function tokenKindOf(value: unknown): TransferTokenKind | undefined {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value)
    ? (value as TransferTokenKind)
    : undefined;
}

function tokenOf(value: unknown): TransferToken | null {
  if (!isRecord(value)) return null;
  const kind = tokenKindOf(value.kind);
  const symbol = typeof value.symbol === 'string' ? value.symbol : '';
  const decimals = value.decimals;
  if (kind === undefined || symbol.length === 0 || symbol.length > 64) return null;
  if (
    typeof decimals !== 'number' ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36
  ) {
    return null;
  }
  if (kind === 'native') return { kind, address: undefined, symbol, decimals };
  const address = addressOf(value.address);
  if (address === null) return null;
  return { kind, address, symbol, decimals };
}

interface TransferPayload {
  readonly token: TransferToken;
  readonly amount: bigint;
  readonly recipient: HexAddress;
  readonly recipientLabel: string | undefined;
  readonly confirmed: boolean;
}

const adapter: WriteRecordAdapter<TransferPayload> = {
  key: TRANSFER_TASK_CACHE_KEY,
  encodePayload: (payload) => ({
    token: {
      kind: payload.token.kind,
      ...(payload.token.address !== undefined ? { address: payload.token.address } : {}),
      symbol: payload.token.symbol,
      decimals: payload.token.decimals,
    },
    amount: payload.amount.toString(),
    recipient: payload.recipient,
    ...(payload.recipientLabel !== undefined ? { recipientLabel: payload.recipientLabel } : {}),
    confirmed: payload.confirmed,
  }),
  decodePayload: (raw) => {
    if (!isRecord(raw)) return null;
    const token = tokenOf(raw.token);
    const amount = decimalOf(raw.amount);
    const recipient = addressOf(raw.recipient);
    if (token === null || amount === undefined || recipient === null) return null;
    return {
      token,
      amount,
      recipient,
      recipientLabel: labelOf(raw.recipientLabel, 128),
      confirmed: raw.confirmed === true,
    };
  },
};

/**
 * Validating read: a malformed / outdated entry is treated as absent (the cache
 * removes only truly unparseable JSON), so a bad record can never rebuild a fake
 * pending state that would block the page.
 *
 * The record carries its own `{chainId, account}` in the envelope and is returned
 * as-is here; the hook compares it with the connected wallet before
 * restoring/signing anything (R3) so the mismatch can surface as neutral copy
 * instead of a silent no-op. The cache scope already namespaces the entry, so the
 * wrong wallet cannot even read another wallet's record.
 */
export function readStoredTransfer(scope: CacheScope): StoredTransfer | null {
  const record = readWriteRecord(adapter, scope);
  if (record === null) return null;
  return {
    hash: record.hash,
    chainId: record.chainId,
    account: record.account,
    token: record.payload.token,
    amount: record.payload.amount,
    recipient: record.payload.recipient,
    recipientLabel: record.payload.recipientLabel,
    nonce: record.nonce,
    confirmed: record.payload.confirmed,
    recordedAt: record.recordedAt,
  };
}

/**
 * Persist immediately after the wallet returns a hash (or right after the
 * receipt is mined, flipping `confirmed`), so a refresh in either window still
 * reconstructs the same page state.
 */
export function writeStoredTransfer(scope: CacheScope, stored: StoredTransfer): void {
  writeWriteRecord(adapter, scope, {
    hash: stored.hash,
    chainId: stored.chainId,
    account: stored.account,
    nonce: stored.nonce,
    recordedAt: stored.recordedAt,
    payload: {
      token: stored.token,
      amount: stored.amount,
      recipient: stored.recipient,
      recipientLabel: stored.recipientLabel,
      confirmed: stored.confirmed,
    },
  });
}

export function clearStoredTransfer(scope: CacheScope): void {
  clearWriteRecord(adapter, scope);
}
