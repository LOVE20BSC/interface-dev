/**
 * THE storage boundary.
 *
 * Every persisted value is namespaced:
 *   love20:v1:<chainId>:<contractAddress>:<wallet>:<businessKey>
 *
 * - wallet and contractAddress are lower-cased so a checksummed address and its
 *   lowercase form cannot create two entries;
 * - businessKey is a semantic name (`identity`, `recentCommunities`, ...), never
 *   an address or JSON blob;
 * - malformed JSON self-heals by deleting only the offending key.
 *
 * No other module may reference localStorage/sessionStorage. ESLint enforces it
 * and src/architecture.test.ts re-checks the source tree.
 */

const VERSION = 'v1';
const PREFIX = `love20:${VERSION}:`;
const SESSION_PREFIX = `${PREFIX}session:`;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BUSINESS_KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

export interface CacheScope {
  readonly chainId: number;
  /** Contract the data belongs to. Use ZERO_ADDRESS for contract-less UI preferences. */
  readonly contractAddress: string;
  /** Current wallet address. Never pass an empty string. */
  readonly wallet: string;
}

export interface CacheApi {
  readonly key: (scope: CacheScope, businessKey: string) => string;
  readonly get: <T>(scope: CacheScope, businessKey: string) => T | null;
  readonly set: <T>(scope: CacheScope, businessKey: string, value: T) => boolean;
  readonly remove: (scope: CacheScope, businessKey: string) => void;
  readonly clearByPrefix: (prefix: string) => void;
  readonly clearScope: (scope: CacheScope) => void;
  readonly clearAll: () => void;
}

function assertScope(scope: CacheScope): void {
  if (!Number.isSafeInteger(scope.chainId) || scope.chainId <= 0) {
    throw new Error(`cache: invalid chainId "${String(scope.chainId)}"`);
  }
  if (!ADDRESS_RE.test(scope.contractAddress)) {
    throw new Error(`cache: contractAddress must be a 0x-prefixed 20-byte address`);
  }
  if (!ADDRESS_RE.test(scope.wallet)) {
    throw new Error(`cache: wallet must be a 0x-prefixed 20-byte address (never empty)`);
  }
}

function assertBusinessKey(businessKey: string): void {
  if (!BUSINESS_KEY_RE.test(businessKey)) {
    throw new Error(
      `cache: businessKey "${businessKey}" must be a semantic name ([A-Za-z][A-Za-z0-9_-]*); it must not contain addresses, JSON or colons`,
    );
  }
}

function storage(): Storage | null {
  try {
    // Access can throw in private mode / sandboxed iframes.
    const candidate = globalThis.localStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

function sessionStorageOrNull(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function makeKey(scope: CacheScope, businessKey: string): string {
  assertScope(scope);
  assertBusinessKey(businessKey);
  return `${PREFIX}${scope.chainId}:${scope.contractAddress.toLowerCase()}:${scope.wallet.toLowerCase()}:${businessKey}`;
}

function looksLikeOurKey(key: string): boolean {
  return key.startsWith(PREFIX);
}

export const cache: CacheApi = {
  key: makeKey,

  get<T>(scope: CacheScope, businessKey: string): T | null {
    const store = storage();
    if (store === null) return null;
    const key = makeKey(scope, businessKey);
    const raw = store.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Old-version junk must never crash the first paint.
      store.removeItem(key);
      return null;
    }
  },

  set<T>(scope: CacheScope, businessKey: string, value: T): boolean {
    const store = storage();
    if (store === null) return false;
    const key = makeKey(scope, businessKey);
    try {
      store.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      // Quota or a non-serializable value: cache is best-effort, never fatal.
      return false;
    }
  },

  remove(scope: CacheScope, businessKey: string): void {
    const store = storage();
    if (store === null) return;
    store.removeItem(makeKey(scope, businessKey));
  },

  clearByPrefix(prefix: string): void {
    if (!prefix.startsWith(PREFIX)) {
      throw new Error(`cache: clearByPrefix must start with "${PREFIX}"`);
    }
    const store = storage();
    if (store === null) return;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key !== null && key.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  },

  clearScope(scope: CacheScope): void {
    assertScope(scope);
    this.clearByPrefix(
      `${PREFIX}${scope.chainId}:${scope.contractAddress.toLowerCase()}:${scope.wallet.toLowerCase()}:`,
    );
  },

  clearAll(): void {
    this.clearByPrefix(PREFIX);
  },
};

/**
 * One-shot session flags (e.g. "already reloaded after vite:preloadError").
 * They are deliberately outside the chain/wallet namespace: they describe this
 * browser tab, not a chain-scoped user preference.
 */
export function markSessionFlag(name: string): void {
  if (!BUSINESS_KEY_RE.test(name)) throw new Error(`cache: invalid session flag "${name}"`);
  const store = sessionStorageOrNull();
  if (store === null) return;
  try {
    store.setItem(`${SESSION_PREFIX}${name}`, '1');
  } catch {
    // ignore
  }
}

/** Reads a session flag without consuming it (render-time visibility checks). */
export function hasSessionFlag(name: string): boolean {
  if (!BUSINESS_KEY_RE.test(name)) throw new Error(`cache: invalid session flag "${name}"`);
  const store = sessionStorageOrNull();
  if (store === null) return false;
  try {
    return store.getItem(`${SESSION_PREFIX}${name}`) !== null;
  } catch {
    return false;
  }
}

/** Returns true the first time it is called in this tab, then clears the flag. */
export function consumeSessionFlag(name: string): boolean {
  if (!BUSINESS_KEY_RE.test(name)) throw new Error(`cache: invalid session flag "${name}"`);
  const store = sessionStorageOrNull();
  if (store === null) return false;
  const key = `${SESSION_PREFIX}${name}`;
  try {
    const present = store.getItem(key) !== null;
    if (present) store.removeItem(key);
    return present;
  } catch {
    return false;
  }
}

/** Removes a one-shot session flag (used by tests and recovery flows). */
export function clearSessionFlag(name: string): void {
  if (!BUSINESS_KEY_RE.test(name)) throw new Error(`cache: invalid session flag "${name}"`);
  const store = sessionStorageOrNull();
  if (store === null) return;
  try {
    store.removeItem(`${SESSION_PREFIX}${name}`);
  } catch {
    // ignore
  }
}

/** Test/helper: lists the cache keys currently stored (namespaced only). */
export function listCacheKeys(): readonly string[] {
  const store = storage();
  if (store === null) return [];
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key !== null && looksLikeOurKey(key)) keys.push(key);
  }
  return keys;
}
