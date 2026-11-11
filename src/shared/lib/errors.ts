import { CONTRACT_ERROR_MESSAGES, ERROR_REGISTRY_SOURCE } from '@/config/errors.generated';
import { copy } from '@/shared/config/copy';

type HexData = `0x${string}`;

/**
 * Small hand-written safety net. The generated map is authoritative and usually
 * covers everything; this keeps the three M0-critical errors readable if the
 * registry import is ever replaced or emptied.
 *
 * TODO: regenerate scripts/error-messages.zh.json and src/config/errors.generated.ts
 * from matt-gov/registry/errors.json whenever the protocol adds errors.
 */
const FALLBACK_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  '0xea74f32b': copy.errors.revertPhaseNotStarted,
  '0x33393244': copy.errors.revertIdentityNotOwner,
  '0x08c379a0': copy.errors.revertCallFailed,
  '0x4e487b71': copy.errors.revertInvalidData,
});

const MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  ...FALLBACK_MESSAGES,
  ...CONTRACT_ERROR_MESSAGES,
});

const ERROR_STRING_SELECTOR = '0x08c379a0';
const PANIC_SELECTOR = '0x4e487b71';
const HEX_DATA_RE = /^0x[0-9a-fA-F]{8,}$/;

export function getErrorRegistrySource(): string {
  return ERROR_REGISTRY_SOURCE;
}

/** selector (0x + 8 hex chars) → Chinese sentence, or null when unknown. */
export function getContractErrorMessage(selector: string): string | null {
  return MESSAGES[selector.toLowerCase()] ?? null;
}

export function isUserRejection(error: unknown): boolean {
  if (readNumber(error, 'code') === 4001) return true;
  const message = readMessage(error).toLowerCase();
  return message.includes('user rejected') || message.includes('user denied');
}

/**
 * Walks viem/wagmi error chains for revert data. viem nests it differently
 * depending on the transport (error.data, error.cause.data, error.info.error.data).
 */
export function extractRevertData(error: unknown): HexData | null {
  return walkForData(error, 0, new Set<object>());
}

function walkForData(value: unknown, depth: number, seen: Set<object>): HexData | null {
  if (depth > 6 || value === null || value === undefined) return null;
  if (typeof value === 'string') {
    return HEX_DATA_RE.test(value) ? (value as HexData) : null;
  }
  if (typeof value !== 'object') return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const record = value as Record<string, unknown>;
  for (const key of ['data', 'revertData', 'returnData', 'raw']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && HEX_DATA_RE.test(candidate)) {
      return candidate as HexData;
    }
    if (typeof candidate === 'object' && candidate !== null) {
      const nested = walkForData(candidate, depth + 1, seen);
      if (nested !== null) return nested;
    }
  }
  for (const key of ['cause', 'error', 'info', 'originalError', 'details']) {
    const nested = walkForData(record[key], depth + 1, seen);
    if (nested !== null) return nested;
  }
  return null;
}

function readNumber(value: unknown, key: string): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate === 'number') return candidate;
  const cause = (value as Record<string, unknown>).cause;
  if (cause !== undefined && cause !== value) return readNumber(cause, key);
  return undefined;
}

function readMessage(value: unknown): string {
  if (typeof value !== 'object' || value === null) return '';
  const record = value as Record<string, unknown>;
  const own = typeof record.message === 'string' ? record.message : '';
  const cause = readMessage(record.cause);
  return `${own} ${cause}`.trim();
}

/**
 * The only function UI code should use for a failed write/read. It never returns
 * raw revert bytes, a selector, or library internals.
 */
export function toUserMessage(error: unknown): string {
  if (isUserRejection(error)) return copy.errors.rejected;
  if (readNumber(error, 'code') === -32002) return copy.errors.requestPending;

  const data = extractRevertData(error);
  if (data !== null) {
    const selector = data.slice(0, 10).toLowerCase();
    if (selector === ERROR_STRING_SELECTOR) return copy.errors.contractGeneric;
    if (selector === PANIC_SELECTOR) return copy.errors.contractPanic;
    const mapped = getContractErrorMessage(selector);
    if (mapped !== null) return mapped;
    return copy.errors.contractGeneric;
  }

  const message = readMessage(error).toLowerCase();
  if (message.includes('insufficient funds') || message.includes('insufficient balance')) {
    return copy.errors.insufficientFunds;
  }
  if (message.includes('user rejected') || message.includes('user denied')) {
    return copy.errors.rejected;
  }
  if (
    message.includes('failed to fetch') ||
    message.includes('http request failed') ||
    message.includes('timeout') ||
    message.includes('network error') ||
    message.includes('disconnected')
  ) {
    return copy.errors.network;
  }
  return copy.errors.generic;
}
