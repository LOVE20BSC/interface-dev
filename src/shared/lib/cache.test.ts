import { beforeEach, describe, expect, it } from 'vitest';
import {
  cache,
  clearSessionFlag,
  consumeSessionFlag,
  listCacheKeys,
  markSessionFlag,
} from '@/shared/lib/cache';

const SCOPE = {
  chainId: 31337,
  contractAddress: '0x00000000000000000000000000000000000000AA',
  wallet: '0xAbCdEf0000000000000000000000000000000001',
} as const;

const KEY = 'identity';

describe('cache key format', () => {
  it('is love20:v1:<chainId>:<contractAddress>:<wallet>:<businessKey>', () => {
    expect(cache.key(SCOPE, KEY)).toBe(
      'love20:v1:31337:0x00000000000000000000000000000000000000aa:0xabcdef0000000000000000000000000000000001:identity',
    );
  });

  it('lowercases wallet and contract address so checksums cannot fork an entry', () => {
    const lower = { ...SCOPE, wallet: SCOPE.wallet.toLowerCase() } as const;
    const checksummed = { ...SCOPE, wallet: SCOPE.wallet } as const;
    expect(cache.key(lower, KEY)).toBe(cache.key(checksummed, KEY));
    expect(cache.key(SCOPE, KEY)).not.toContain(SCOPE.wallet);
  });

  it('rejects empty or malformed scopes', () => {
    expect(() => cache.key({ ...SCOPE, wallet: '' }, KEY)).toThrow();
    expect(() => cache.key({ ...SCOPE, contractAddress: '' }, KEY)).toThrow();
    expect(() => cache.key({ ...SCOPE, chainId: 0 }, KEY)).toThrow();
    expect(() => cache.key(SCOPE, 'identity:0xabc')).toThrow();
    expect(() => cache.key(SCOPE, 'not a semantic key')).toThrow();
  });
});

describe('cache get/set/remove', () => {
  beforeEach(() => {
    cache.clearAll();
  });

  it('round-trips JSON values', () => {
    expect(cache.set(SCOPE, KEY, { tokenId: '42', nested: { ok: true } })).toBe(true);
    expect(cache.get(SCOPE, KEY)).toEqual({ tokenId: '42', nested: { ok: true } });
  });

  it('isolates by chain, contract and wallet', () => {
    cache.set(SCOPE, KEY, 'mine');
    expect(cache.get({ ...SCOPE, chainId: 1 }, KEY)).toBeNull();
    expect(
      cache.get({ ...SCOPE, contractAddress: '0x00000000000000000000000000000000000000BB' }, KEY),
    ).toBeNull();
    expect(
      cache.get({ ...SCOPE, wallet: '0x0000000000000000000000000000000000000002' }, KEY),
    ).toBeNull();
  });

  it('removes one entry', () => {
    cache.set(SCOPE, KEY, 'value');
    cache.remove(SCOPE, KEY);
    expect(cache.get(SCOPE, KEY)).toBeNull();
  });

  it('self-heals malformed JSON by deleting only the offending key', () => {
    const key = cache.key(SCOPE, KEY);
    // Test-only: production code must never touch storage outside cache.ts.
    window.localStorage.setItem(key, '{not-json');
    cache.set({ ...SCOPE, wallet: '0x0000000000000000000000000000000000000002' }, KEY, 'other');
    expect(cache.get(SCOPE, KEY)).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(listCacheKeys().length).toBe(1);
  });

  it('clears by prefix without touching unrelated entries', () => {
    cache.set(SCOPE, KEY, 'a');
    cache.set(SCOPE, 'onboarding', 'b');
    cache.set({ ...SCOPE, chainId: 1 }, KEY, 'c');
    cache.clearByPrefix(`love20:v1:${SCOPE.chainId}:`);
    expect(cache.get(SCOPE, KEY)).toBeNull();
    expect(cache.get(SCOPE, 'onboarding')).toBeNull();
    expect(cache.get({ ...SCOPE, chainId: 1 }, KEY)).toBe('c');
  });

  it('refuses to clear a prefix outside the love20 namespace', () => {
    expect(() => cache.clearByPrefix('something-else:')).toThrow();
  });
});

describe('session flags', () => {
  beforeEach(() => {
    clearSessionFlag('preloadReloaded');
  });

  it('consumeSessionFlag is true exactly once', () => {
    expect(consumeSessionFlag('preloadReloaded')).toBe(false);
    markSessionFlag('preloadReloaded');
    expect(consumeSessionFlag('preloadReloaded')).toBe(true);
    expect(consumeSessionFlag('preloadReloaded')).toBe(false);
  });
});
