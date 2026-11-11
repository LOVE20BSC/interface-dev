/**
 * Browser access rules for the configured RPC endpoint.
 *
 * A page served over HTTPS cannot call a loopback RPC: Chromium blocks the
 * request before it leaves the page (`Permission was denied for this request to
 * access the 'loopback' address space`). The UI must say that plainly instead of
 * blaming a flaky network.
 *
 * Pure functions only: the shell passes `window.location.origin` and the
 * configured `RPC_URLS`, so this is unit-testable without a browser.
 */

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', '::1', 'localhost']);

/** `URL.hostname` keeps IPv6 brackets; strip them and any trailing root dot. */
function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
}

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(normalizeHostname(hostname));
}

/**
 * True only when the page is HTTPS and at least one configured RPC is loopback.
 * That is exactly the combination browsers refuse, so the shell can show the
 * one-time "use the local dev server" notice.
 */
export function isLoopbackRpcBlocked(origin: string, rpcUrls: readonly string[]): boolean {
  let page: URL;
  try {
    page = new URL(origin);
  } catch {
    return false;
  }
  if (page.protocol !== 'https:') return false;
  return rpcUrls.some((rpcUrl) => {
    try {
      return isLoopbackHost(new URL(rpcUrl).hostname);
    } catch {
      return false;
    }
  });
}
