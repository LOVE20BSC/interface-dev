import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FLIP_DURATION_MS,
  FLIP_EASING,
  FLIP_HIGHLIGHT_MS,
  captureFlipPositions,
  playFlip,
  pulseFlipHighlight,
  type FlipElement,
} from '@/shared/lib/flip';

interface AnimateCall {
  readonly keyframes: readonly Keyframe[];
  readonly options: KeyframeAnimationOptions | undefined;
}

function rect(top: number, height: number, width = 320): DOMRect {
  return {
    top,
    height,
    width,
    bottom: top + height,
    left: 0,
    right: width,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** A card whose measured box is fixed; `animate` pushes the call and can settle. */
function card(key: string, top: number, height = 120): FlipElement & { calls: AnimateCall[] } {
  const element = document.createElement('li');
  element.setAttribute('data-identity-id', key);
  element.getBoundingClientRect = () => rect(top, height);
  const calls: AnimateCall[] = [];
  (element as Element & { animate: unknown }).animate = (
    keyframes: Keyframe[],
    options?: KeyframeAnimationOptions,
  ) => {
    calls.push({ keyframes, options });
    return { finished: Promise.resolve(), cancel: () => {} } as unknown as Animation;
  };
  return { key: `li:${key}`, element, calls };
}

/** The same markup, but laid out with 0×0 because that breakpoint is not displayed. */
function hiddenElement(): FlipElement {
  const element = document.createElement('tr');
  element.getBoundingClientRect = () => rect(0, 0, 0);
  return { key: 'tr:1', element };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('captureFlipPositions', () => {
  it('measures laid-out cards and skips the breakpoint that is not displayed', () => {
    const visible = card('1', 210);
    expect(captureFlipPositions([visible, hiddenElement()])).toEqual([
      { key: 'li:1', top: 210, height: 120 },
    ]);
  });
});

describe('playFlip', () => {
  it('inverts the travel distance of every card that changed position', async () => {
    // Before: #1 at 210 (h 124), #2 at 350 (h 120). After: #2 first at 210 (h 144),
    // #1 second at 354 (h 128) — the badge swapped cards, so heights change too.
    const moved = card('2', 210, 144);
    const pushed = card('1', 354, 128);

    const playback = playFlip(
      [
        { key: 'li:2', top: 350, height: 120 },
        { key: 'li:1', top: 210, height: 124 },
      ],
      [moved, pushed],
      { emphasisKeys: ['li:2'] },
    );

    expect(playback.animations).toHaveLength(2);
    expect(moved.calls[0]?.keyframes).toEqual([
      { transform: 'translateY(140.00px)' },
      { transform: 'translateY(0)' },
    ]);
    expect(pushed.calls[0]?.keyframes).toEqual([
      { transform: 'translateY(-144.00px)' },
      { transform: 'translateY(0)' },
    ]);
    expect(moved.calls[0]?.options).toEqual({
      duration: FLIP_DURATION_MS,
      easing: FLIP_EASING,
      fill: 'none',
    });
    expect(FLIP_DURATION_MS).toBe(300);
    await playback.settled;
  });

  it('leaves cards that did not move alone', () => {
    const still = card('1', 210);
    const playback = playFlip([{ key: 'li:1', top: 210, height: 120 }], [still]);
    expect(playback.animations).toHaveLength(0);
    expect(still.calls).toHaveLength(0);
  });

  it('raises the emphasised card while it moves, then clears the inline styles', async () => {
    const moved = card('2', 210);
    const playback = playFlip([{ key: 'li:2', top: 350, height: 120 }], [moved], {
      emphasisKeys: ['li:2'],
    });
    const style = (moved.element as HTMLElement).style;
    expect(style.position).toBe('relative');
    expect(style.zIndex).toBe('1');
    await playback.settled;
    expect(style.position).toBe('');
    expect(style.zIndex).toBe('');
  });

  it('skips everything under prefers-reduced-motion: reduce', () => {
    const moved = card('2', 210);
    const playback = playFlip([{ key: 'li:2', top: 350, height: 120 }], [moved], {
      reducedMotion: true,
    });
    expect(playback.animations).toHaveLength(0);
    expect(moved.calls).toHaveLength(0);
  });

  it('does nothing in an environment without element.animate (jsdom)', () => {
    const plain = document.createElement('li');
    plain.getBoundingClientRect = () => rect(210, 120);
    const playback = playFlip(
      [{ key: 'li:2', top: 350, height: 120 }],
      [{ key: 'li:2', element: plain }],
    );
    expect(playback.animations).toHaveLength(0);
    expect(playback.settled).toBeInstanceOf(Promise);
  });
});

describe('pulseFlipHighlight', () => {
  function rowWith(
    backgroundColor: string,
    tint: string,
  ): { row: HTMLTableRowElement; calls: AnimateCall[] } {
    const row = document.createElement('tr');
    row.getBoundingClientRect = () => rect(10, 40);
    const calls: AnimateCall[] = [];
    (row as Element & { animate: unknown }).animate = (
      keyframes: Keyframe[],
      options?: KeyframeAnimationOptions,
    ) => {
      calls.push({ keyframes, options });
      return { finished: Promise.resolve(), cancel: () => {} } as unknown as Animation;
    };
    const original = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      if (element !== row) return original.call(window, element);
      return {
        backgroundColor,
        getPropertyValue: (property: string) => (property === '--color-brand-soft' ? tint : ''),
      } as unknown as CSSStyleDeclaration;
    });
    return { row, calls };
  }

  it('fades a soft brand tint back into the row background (desktop fallback)', () => {
    const { row, calls } = rowWith('rgba(219, 234, 254, 0.3)', '#dbeafe');
    expect(pulseFlipHighlight(row, { kind: 'tint' })).not.toBeNull();
    expect(calls[0]?.keyframes).toEqual([
      { backgroundColor: '#dbeafe' },
      { backgroundColor: 'rgba(219, 234, 254, 0.3)' },
    ]);
    expect(calls[0]?.options?.duration).toBe(FLIP_HIGHLIGHT_MS);
  });

  it('draws a brand ring for cards, without touching the background', () => {
    const { row, calls } = rowWith('rgb(255, 255, 255)', '#dbeafe');
    const computed = window.getComputedStyle(row);
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      backgroundColor: 'rgb(255, 255, 255)',
      getPropertyValue: (property: string) =>
        property === '--color-brand' ? '#2563eb' : computed.getPropertyValue(property),
    } as unknown as CSSStyleDeclaration);
    expect(pulseFlipHighlight(row, { kind: 'halo' })).not.toBeNull();
    expect(calls[0]?.keyframes).toEqual([
      { boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.45)' },
      { boxShadow: '0 0 0 3px rgba(37, 99, 235, 0)' },
    ]);
  });

  it('is skipped under prefers-reduced-motion and for elements that are not laid out', () => {
    const { row } = rowWith('rgb(255, 255, 255)', '#dbeafe');
    expect(pulseFlipHighlight(row, { kind: 'tint', reducedMotion: true })).toBeNull();
    const hidden = document.createElement('tr');
    hidden.getBoundingClientRect = () => rect(0, 0, 0);
    expect(pulseFlipHighlight(hidden, { kind: 'tint' })).toBeNull();
  });
});
