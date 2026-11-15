import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SoftTransitionProvider,
  TRANSITION_ENTER_MS,
  TRANSITION_LEAVE_MS,
  useSoftTransition,
} from '@/shared/model/soft-transition';

function wrapper({ children }: { readonly children: ReactNode }) {
  return <SoftTransitionProvider>{children}</SoftTransitionProvider>;
}

const media = (matches: boolean): MediaQueryList =>
  ({
    matches,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

describe('useSoftTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fades out, applies the whole-page change, then fades back in', () => {
    const { result } = renderHook(() => useSoftTransition(), { wrapper });
    const change = vi.fn();

    act(() => {
      result.current.run(change);
    });
    expect(result.current.phase).toBe('leaving');
    expect(result.current.isTransitioning).toBe(true);
    expect(change).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(TRANSITION_LEAVE_MS);
    });
    expect(change).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('entering');

    act(() => {
      vi.advanceTimersByTime(TRANSITION_ENTER_MS);
    });
    expect(result.current.phase).toBe('idle');
    expect(result.current.isTransitioning).toBe(false);
  });

  it('ignores a second change while a transition owns the page', () => {
    const { result } = renderHook(() => useSoftTransition(), { wrapper });
    const first = vi.fn();
    const second = vi.fn();

    act(() => {
      result.current.run(first);
      result.current.run(second);
    });
    act(() => {
      vi.advanceTimersByTime(TRANSITION_LEAVE_MS + TRANSITION_ENTER_MS);
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('applies the change immediately with prefers-reduced-motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => media(query.includes('reduce')));
    const { result } = renderHook(() => useSoftTransition(), { wrapper });
    const change = vi.fn();

    act(() => {
      result.current.run(change);
    });

    // No fade phases and no timers: the preference turns the animation off.
    expect(change).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('idle');
  });

  it('runs immediately when rendered outside the shell provider', () => {
    const { result } = renderHook(() => useSoftTransition());
    const change = vi.fn();

    act(() => {
      result.current.run(change);
    });

    expect(change).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('idle');
  });
});
