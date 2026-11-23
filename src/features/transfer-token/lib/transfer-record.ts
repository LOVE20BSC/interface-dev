import { ZERO_ADDRESS, type HexAddress } from '@/config/networks';
import { cache, type CacheScope } from '@/shared/lib/cache';
import type { TransferRecord } from './transfer-receipt';
import type { TransferToken, TransferTokenKind } from './transfer-types';

export type HexHash = `0x${string}`;

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
 * `chainId` / `account` / `nonce` are stored *inside* the record as well (R2/R3):
 * the scope already namespaces the entry, but a record that is read through the
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

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hashOf(value: unknown): HexHash | null {
  return typeof value === 'string' && HASH_RE.test(value) ? (value as HexHash) : null;
}

function addressOf(value: unknown): HexAddress | null {
  return typeof value === 'string' && ADDRESS_RE.test(value) ? (value as HexAddress) : null;
}

function chainIdOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function nonceOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
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

function labelOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined;
}

function timestampOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Validating read: a malformed / outdated entry is treated as absent (the cache
 * removes only truly unparseable JSON), so a bad record can never rebuild a fake
 * pending state that would block the page.
 *
 * The record carries its own `{chainId, account}` and is returned as-is here; the
 * hook compares it with the connected wallet before restoring/signing anything
 * (R3) so the mismatch can surface as neutral copy instead of a silent no-op.
 * The cache scope already namespaces the entry, so the wrong wallet cannot even
 * read another wallet's record.
 */
export function readStoredTransfer(scope: CacheScope): StoredTransfer | null {
  const raw: unknown = cache.get<unknown>(scope, TRANSFER_TASK_CACHE_KEY);
  if (!isRecord(raw)) return null;
  const hash = hashOf(raw.hash);
  const token = tokenOf(raw.token);
  const amount = decimalOf(raw.amount);
  const recipient = addressOf(raw.recipient);
  const recordedAt = timestampOf(raw.recordedAt);
  const storedChainId = chainIdOf(raw.chainId);
  const storedAccount = addressOf(raw.account);
  if (hash === null || token === null || amount === undefined || recipient === null) return null;
  if (storedChainId === undefined || storedAccount === null) return null;
  return {
    hash,
    chainId: storedChainId,
    account: storedAccount,
    token,
    amount,
    recipient,
    recipientLabel: labelOf(raw.recipientLabel),
    nonce: nonceOf(raw.nonce),
    confirmed: raw.confirmed === true,
    recordedAt: recordedAt ?? Date.now(),
  };
}

/**
 * Persist immediately after the wallet returns a hash (or right after the
 * receipt is mined, flipping `confirmed`), so a refresh in either window still
 * reconstructs the same page state.
 */
export function writeStoredTransfer(scope: CacheScope, stored: StoredTransfer): void {
  cache.set(scope, TRANSFER_TASK_CACHE_KEY, {
    hash: stored.hash,
    chainId: stored.chainId,
    account: stored.account,
    token: {
      kind: stored.token.kind,
      ...(stored.token.address !== undefined ? { address: stored.token.address } : {}),
      symbol: stored.token.symbol,
      decimals: stored.token.decimals,
    },
    amount: stored.amount.toString(),
    recipient: stored.recipient,
    ...(stored.recipientLabel !== undefined ? { recipientLabel: stored.recipientLabel } : {}),
    ...(stored.nonce !== undefined ? { nonce: stored.nonce } : {}),
    confirmed: stored.confirmed,
    recordedAt: stored.recordedAt,
  });
}

export function clearStoredTransfer(scope: CacheScope): void {
  cache.remove(scope, TRANSFER_TASK_CACHE_KEY);
}
