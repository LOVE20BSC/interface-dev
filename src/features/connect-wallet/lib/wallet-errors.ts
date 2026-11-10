import { copy } from '@/shared/config/copy';

/**
 * Wallet-layer errors (EIP-1193). Kept out of shared/lib/errors.ts so the large
 * contract selector map is not pulled into the first-screen bundle; wallet
 * connect/switch failures only need these few cases.
 */
function readCode(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const code = (value as { code?: unknown }).code;
  if (typeof code === 'number') return code;
  const cause = (value as { cause?: unknown }).cause;
  return cause === undefined || cause === value ? undefined : readCode(cause);
}

function readMessage(value: unknown): string {
  if (typeof value !== 'object' || value === null) return '';
  const record = value as Record<string, unknown>;
  const own = typeof record.message === 'string' ? record.message : '';
  return `${own} ${readMessage(record.cause)}`.trim();
}

export function toWalletErrorMessage(error: unknown): string {
  const code = readCode(error);
  if (code === 4001) return copy.errors.rejected;
  if (code === -32002) return copy.errors.requestPending;
  if (code === 4901 || code === 4902) return copy.errors.unknownChain;
  if (code === 4100) return copy.errors.noAccess;

  const message = readMessage(error).toLowerCase();
  if (message.includes('user rejected') || message.includes('user denied')) {
    return copy.errors.rejected;
  }
  if (message.includes('insufficient funds') || message.includes('insufficient balance')) {
    return copy.errors.insufficientFunds;
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
