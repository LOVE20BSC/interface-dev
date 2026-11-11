import { describe, expect, it } from 'vitest';
import { isLoopbackHost, isLoopbackRpcBlocked } from '@/shared/lib/rpc-access';

describe('isLoopbackHost', () => {
  it('recognises the three loopback spellings, including IPv6 brackets', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('LOCALHOST.')).toBe(true);
  });

  it('does not treat a public host or a wildcard bind as loopback', () => {
    expect(isLoopbackHost('bsc-dataseed.binance.org')).toBe(false);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('127.0.0.1.example.com')).toBe(false);
  });
});

describe('isLoopbackRpcBlocked', () => {
  it('is true for an HTTPS page with a loopback RPC', () => {
    expect(isLoopbackRpcBlocked('https://love20bsc.github.io', ['http://127.0.0.1:8545'])).toBe(
      true,
    );
    expect(isLoopbackRpcBlocked('https://love20bsc.github.io', ['http://localhost:8545'])).toBe(
      true,
    );
    expect(isLoopbackRpcBlocked('https://example.com', ['http://[::1]:8545'])).toBe(true);
  });

  it('is false when the page is not HTTPS (the local dev server is fine)', () => {
    expect(isLoopbackRpcBlocked('http://127.0.0.1:5180', ['http://127.0.0.1:8545'])).toBe(false);
    expect(isLoopbackRpcBlocked('http://localhost:5180', ['http://localhost:8545'])).toBe(false);
  });

  it('is false when the configured RPC is reachable from the HTTPS page', () => {
    expect(
      isLoopbackRpcBlocked('https://love20bsc.github.io', [
        'https://bsc-dataseed.binance.org',
        'https://rpc.example.com',
      ]),
    ).toBe(false);
  });

  it('treats one loopback entry in the fallback list as blocked', () => {
    expect(
      isLoopbackRpcBlocked('https://love20bsc.github.io', [
        'https://rpc.example.com',
        'http://127.0.0.1:8545',
      ]),
    ).toBe(true);
  });

  it('is false for malformed origins and RPC entries instead of throwing', () => {
    expect(isLoopbackRpcBlocked('not-a-url', ['http://127.0.0.1:8545'])).toBe(false);
    expect(isLoopbackRpcBlocked('https://example.com', ['not-a-url'])).toBe(false);
    expect(isLoopbackRpcBlocked('https://example.com', [])).toBe(false);
  });
});
