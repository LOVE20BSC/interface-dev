import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DETECTION_WINDOW_MS,
  LATE_PROVIDER_RECHECK_MS,
  useInjectedWalletStatus,
} from '@/features/connect-wallet/model/use-injected-wallet-status';

const provider = { request: () => Promise.resolve(null) };

function installProvider(): void {
  Object.defineProperty(window, 'ethereum', {
    configurable: true,
    writable: true,
    value: provider,
  });
}

function removeProvider(): void {
  delete window.ethereum;
}

function fireInitializedEvent(): void {
  window.dispatchEvent(new Event('ethereum#initialized'));
}

beforeEach(() => {
  removeProvider();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  removeProvider();
});

describe('useInjectedWalletStatus', () => {
  it('is available immediately when a provider was injected before mount', () => {
    installProvider();

    const { result } = renderHook(() => useInjectedWalletStatus());

    expect(result.current).toBe('available');
  });

  it('settles to missing within the 800 ms budget when no provider arrives', () => {
    expect(DETECTION_WINDOW_MS).toBeLessThanOrEqual(800);

    const { result } = renderHook(() => useInjectedWalletStatus());
    expect(result.current).toBe('checking');

    act(() => {
      vi.advanceTimersByTime(DETECTION_WINDOW_MS - 1);
    });
    expect(result.current).toBe('checking');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('missing');

    // The fallback is terminal until a provider actually shows up.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe('missing');
  });

  it('picks up a wallet that injects during the window and never goes back to checking', () => {
    const { result } = renderHook(() => useInjectedWalletStatus());
    expect(result.current).toBe('checking');

    act(() => {
      vi.advanceTimersByTime(DETECTION_WINDOW_MS - 100);
      installProvider();
      fireInitializedEvent();
    });
    expect(result.current).toBe('available');

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe('available');
  });

  it('upgrades a settled missing state when a late wallet fires ethereum#initialized', () => {
    const { result } = renderHook(() => useInjectedWalletStatus());

    act(() => {
      vi.advanceTimersByTime(DETECTION_WINDOW_MS);
    });
    expect(result.current).toBe('missing');

    act(() => {
      installProvider();
      fireInitializedEvent();
    });
    expect(result.current).toBe('available');
  });

  it('still notices a late wallet that injects without dispatching the event', () => {
    const { result } = renderHook(() => useInjectedWalletStatus());

    act(() => {
      vi.advanceTimersByTime(DETECTION_WINDOW_MS);
    });
    expect(result.current).toBe('missing');

    act(() => {
      installProvider();
    });
    expect(result.current).toBe('missing');

    act(() => {
      vi.advanceTimersByTime(LATE_PROVIDER_RECHECK_MS);
    });
    expect(result.current).toBe('available');
  });
});
