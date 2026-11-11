/**
 * Send-time transaction errors — pure classifier (no React, no wagmi, no copy).
 *
 * The owner-reported P0 had two halves. The receipt half is `tx-watch.ts`
 * (bounded wait). This file is the send half: his wallet carried nonce 68 while
 * the chain was at 69, so the wallet/RPC refused the transaction with a
 * "nonce too low"-class error and the generic fallback told him
 * 「操作没有完成，请稍后重试。」 — which is both wrong and unactionable.
 *
 * MetaMask/viem/anvil/BSC nodes express the same condition differently:
 *
 * - viem decodes some of them into `NonceTooLowError` / `NonceTooHighError`;
 * - other wallets/RPCs only expose a raw provider message (`-32000 nonce too low`,
 *   `nonce has already been used`, `replacement transaction underpriced`,
 *   `already known` / `known transaction`);
 * - wagmi wraps all of it in a `TransactionExecutionError` whose `cause` chain
 *   (or `info.error`) holds the real message.
 *
 * The third owner-reported shape is a stale chain view: after an anvil restart
 * his wallet still asked for block 982 while the node was at 970, so the node
 * answered `BlockOutOfRangeError` ("block height is 970 but requested was 982").
 * That surfaced as the same useless generic. It is a different cure (refresh /
 * reconnect the wallet), so it is its own kind.
 *
 * `classifyTxSendError` walks names and message substrings so every shape maps
 * to one actionable verdict instead of `errors.generic`:
 *
 * | observed shape                                   | kind           | user copy + action                     |
 * | ------------------------------------------------ | -------------- | -------------------------------------- |
 * | nonce too low / too high / used, underpriced,     | nonceMismatch  | nonceGap sentence + 「重新提交」       |
 * | already known / known transaction                 | ...            | (explicit on-chain nonce heals it)     |
 * | BlockOutOfRangeError, block height/requested was, | staleBlock     | 「钱包还停留在旧链的区块上…」 + 「刷新」 |
 * | header not found, unknown block                   |                |                                        |
 *
 * Anything else (user rejection, insufficient funds, revert, network) keeps the
 * existing mapping; `errors.generic` stays only for genuinely unknown failures.
 */

export type TxSendErrorKind = 'nonceMismatch' | 'underpriced' | 'alreadyKnown' | 'staleBlock';

const NONCE_ERROR_NAMES: ReadonlySet<string> = new Set([
  'NonceTooLowError',
  'NonceTooHighError',
  'NonceMaxValueError',
  'NonceExpiredError',
]);

const STALE_BLOCK_ERROR_NAMES: ReadonlySet<string> = new Set([
  'BlockOutOfRangeError',
  'BlockNotFoundError',
  'UnknownBlockError',
  'BlockNumberOutOfRangeError',
]);

/** Raw node/provider strings (lower-cased substrings). */
const NONCE_MESSAGES: readonly string[] = [
  'nonce too low',
  'nonce too high',
  'nonce has already been used',
  'nonce provided for the transaction',
  'transaction already imported',
  'nonce is too low',
  'nonce is too high',
];

const UNDERPRICED_MESSAGES: readonly string[] = [
  'replacement transaction underpriced',
  'replacement underpriced',
  'transaction underpriced',
];

const ALREADY_KNOWN_MESSAGES: readonly string[] = ['already known', 'known transaction'];

/** anvil/geth ask for a block that no longer exists after a restart. */
const STALE_BLOCK_MESSAGES: readonly string[] = [
  'blockoutofrangeerror',
  'header not found',
  'unknown block',
  'block not found',
];

/** The paired anvil sentence: "block height is 970 but requested was 982". */
function looksLikeStaleBlockMessage(haystack: string): boolean {
  if (STALE_BLOCK_MESSAGES.some((message) => haystack.includes(message))) return true;
  return haystack.includes('block height is') && haystack.includes('requested was');
}

interface ErrorParts {
  readonly names: Set<string>;
  readonly messages: string[];
}

const NESTED_KEYS = [
  'cause',
  'error',
  'info',
  'originalError',
  'details',
  'data',
  'metaMessages',
] as const;

function collectParts(value: unknown, parts: ErrorParts, depth: number, seen: Set<object>): void {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    parts.messages.push(value);
    return;
  }
  if (typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string') parts.names.add(record.name);
  if (typeof record.message === 'string') parts.messages.push(record.message);
  for (const key of NESTED_KEYS) collectParts(record[key], parts, depth + 1, seen);
}

/**
 * Returns the nonce-shaped family for a send failure, or null when the error is
 * something else (user rejection, insufficient funds, revert, network, ...).
 */
export function classifyTxSendError(error: unknown): TxSendErrorKind | null {
  const parts: ErrorParts = { names: new Set(), messages: [] };
  collectParts(error, parts, 0, new Set());

  for (const name of parts.names) {
    if (NONCE_ERROR_NAMES.has(name)) return 'nonceMismatch';
  }
  for (const name of parts.names) {
    if (STALE_BLOCK_ERROR_NAMES.has(name)) return 'staleBlock';
  }

  const haystack = parts.messages.join(' ').toLowerCase();
  if (looksLikeStaleBlockMessage(haystack)) return 'staleBlock';
  if (NONCE_MESSAGES.some((message) => haystack.includes(message))) return 'nonceMismatch';
  if (UNDERPRICED_MESSAGES.some((message) => haystack.includes(message))) return 'underpriced';
  if (ALREADY_KNOWN_MESSAGES.some((message) => haystack.includes(message))) return 'alreadyKnown';
  return null;
}

/**
 * True for every nonce-shaped send failure. They share one actionable message
 * (「钱包里的交易记录和链上没有对上…」) and the 「重新提交」 action, so callers
 * do not need to distinguish the sub-kinds for UI purposes.
 */
export function isTxSendNonceError(error: unknown): boolean {
  const kind = classifyTxSendError(error);
  return kind === 'nonceMismatch' || kind === 'underpriced' || kind === 'alreadyKnown';
}

/** True for a stale wallet chain view (old block height after a chain restart). */
export function isTxStaleBlockError(error: unknown): boolean {
  return classifyTxSendError(error) === 'staleBlock';
}

/** Only the two recovery families the UI knows how to act on. */
export type TxSendRecoveryKind = 'nonce' | 'staleBlock';

export function txSendRecoveryKind(error: unknown): TxSendRecoveryKind | undefined {
  const kind = classifyTxSendError(error);
  if (kind === null) return undefined;
  return kind === 'staleBlock' ? 'staleBlock' : 'nonce';
}
