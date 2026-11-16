/**
 * FLIP (First–Last–Invert–Play) layout animation on top of the Web Animations API.
 *
 * owner 2026-11-17: 点「使用此身份 NFT」时，被点的那张卡片要从当前位置移动到列表最顶部
 * （列表本来就把当前身份排第一），这样「身份被移到首位并生效」是看得见的；替代原来整页
 * 淡出淡入、卡片突然换位置。只用浏览器自带的 `element.animate`：没有动画库、没有新增
 * stylesheet、没有 transition 依赖。
 *
 * 调用顺序是固定的：点击时先 `captureFlipPositions()` 量「First」→ React 提交重排后的
 * DOM → 在 `useLayoutEffect`（首帧绘制之前）里 `playFlip(previous, entries)` 量「Last」
 * 并播放。
 *
 * 清理：transform 动画用 `fill: 'none'`，动画一结束浏览器就丢掉效果，元素回到最终布局，
 * 不会残留内联 transform；为「被点的卡片浮在其它卡片之上」临时加的 `position/z-index`
 * 在动画结束时（或 `cancel()`、组件卸载时）由这里清掉。
 */

export interface FlipElement {
  /** Stable identity shared by the two measurements (e.g. the token id). */
  readonly key: string;
  readonly element: Element;
}

export interface FlipPosition {
  readonly key: string;
  readonly top: number;
  readonly height: number;
}

export interface FlipPlayback {
  /** Animations that were started; empty when nothing needed to move. */
  readonly animations: readonly Animation[];
  /** Resolves when the movement finished or was cancelled. */
  readonly settled: Promise<void>;
  /** Cancels the movement and clears the temporary inline styles. */
  readonly cancel: () => void;
}

export interface FlipOptions {
  readonly durationMs?: number | undefined;
  readonly easing?: string | undefined;
  /** Keys that get the「被点的那张」treatment (raised above the others). */
  readonly emphasisKeys?: readonly string[] | undefined;
  /** `prefers-reduced-motion: reduce`: no animation, the items land at once. */
  readonly reducedMotion?: boolean | undefined;
}

export interface FlipHighlightOptions {
  /**
   * `halo` lifts the element with a brand-coloured ring that fades out (cards: their
   * own `transition-colors` already fades the background change, and that transition
   * makes the settled background unreadable while it runs).
   * `tint` fades a brand tint out of the element's own background (table rows: no
   * `transition-colors` there, so the settled background is readable).
   */
  readonly kind?: 'halo' | 'tint' | undefined;
  readonly durationMs?: number | undefined;
  readonly reducedMotion?: boolean | undefined;
}

/** 300 ms reads as a deliberate move without making the list feel slow. */
export const FLIP_DURATION_MS = 300;
/** Decelerating curve: fast start, soft landing at the top of the list. */
export const FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const FLIP_HIGHLIGHT_MS = 620;

/** Sub-pixel rounding is not a move; below this the item did not travel. */
const MIN_MOVE_PX = 2;

/**
 * An element that is not laid out measures 0×0 — the mobile card list and the
 * desktop table both live in the DOM, only one of them is displayed. Skipping
 * those keeps the two breakpoints from mixing measurements.
 */
function isLaidOut(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

export function captureFlipPositions(entries: readonly FlipElement[]): FlipPosition[] {
  const positions: FlipPosition[] = [];
  for (const entry of entries) {
    if (!isLaidOut(entry.element)) continue;
    const rect = entry.element.getBoundingClientRect();
    positions.push({ key: entry.key, top: rect.top, height: rect.height });
  }
  return positions;
}

/**
 * Inverts and plays the move for every entry that changed position. Entries with
 * no previous measurement, without a laid-out box, or that moved less than a
 * pixel are left alone.
 */
export function playFlip(
  previous: readonly FlipPosition[],
  entries: readonly FlipElement[],
  options: FlipOptions = {},
): FlipPlayback {
  if (options.reducedMotion === true) {
    return { animations: [], settled: Promise.resolve(), cancel: () => {} };
  }
  const before = new Map(previous.map((position) => [position.key, position]));
  const emphasis = new Set(options.emphasisKeys ?? []);
  const durationMs = options.durationMs ?? FLIP_DURATION_MS;
  const easing = options.easing ?? FLIP_EASING;
  const animations: Animation[] = [];
  const raised: HTMLElement[] = [];

  for (const entry of entries) {
    const first = before.get(entry.key);
    if (first === undefined) continue;
    // jsdom (unit tests) has neither layout nor `element.animate`.
    if (typeof entry.element.animate !== 'function') continue;
    if (!isLaidOut(entry.element)) continue;
    const delta = first.top - entry.element.getBoundingClientRect().top;
    if (Math.abs(delta) < MIN_MOVE_PX) continue;
    if (emphasis.has(entry.key) && entry.element instanceof HTMLElement) {
      // The tapped card crosses the card it replaces: keep it above the others so
      // the path stays trackable instead of sliding underneath them.
      entry.element.style.position = 'relative';
      entry.element.style.zIndex = '1';
      raised.push(entry.element);
    }
    animations.push(
      entry.element.animate(
        [{ transform: `translateY(${delta.toFixed(2)}px)` }, { transform: 'translateY(0)' }],
        { duration: durationMs, easing, fill: 'none' },
      ),
    );
  }

  const release = (): void => {
    for (const element of raised) {
      element.style.position = '';
      element.style.zIndex = '';
    }
  };
  const settled = Promise.all(
    animations.map((animation) => animation.finished.catch(() => undefined)),
  ).then(release);

  return {
    animations,
    settled,
    cancel: () => {
      for (const animation of animations) animation.cancel();
      release();
    },
  };
}

/**
 * Turns a theme token (`#rrggbb`, as both palettes define them) into the same
 * colour at a given alpha. Anything else is returned untouched: a token format we
 * cannot parse still yields a valid shadow, just without the transparency ramp.
 */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex === null) return color;
  const value = Number.parseInt(hex[1] ?? '', 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * The「它被移到这里」emphasis, played after the move (or instead of it on the
 * desktop `<table>`).
 *
 * `halo` draws a brand-coloured ring around the element and fades it out — used for
 * cards, whose `transition-colors` already animates the background change (reading
 * their background while that transition runs would give the pre-change colour and
 * leave a step at the end of the pulse).
 * `tint` fades a soft brand tint back into the element's own background — used for
 * table rows, whose background flips instantly and is therefore readable.
 *
 * Skipped entirely under `prefers-reduced-motion: reduce` (no flashing).
 */
export function pulseFlipHighlight(
  element: Element,
  options: FlipHighlightOptions = {},
): Animation | null {
  if (options.reducedMotion === true) return null;
  if (typeof element.animate !== 'function') return null;
  if (!isLaidOut(element)) return null;
  const computed = window.getComputedStyle(element);
  const durationMs = options.durationMs ?? FLIP_HIGHLIGHT_MS;

  if (options.kind === 'tint') {
    // Theme tokens resolve through the cascade: light and dark both expose a soft
    // brand tint, so the pulse never hard-codes a palette value.
    const tint = computed.getPropertyValue('--color-brand-soft').trim();
    if (tint === '') return null;
    const base = computed.backgroundColor;
    if (base === tint) return null;
    return element.animate([{ backgroundColor: tint }, { backgroundColor: base }], {
      duration: durationMs,
      easing: 'ease-out',
    });
  }

  const brand = computed.getPropertyValue('--color-brand').trim();
  if (brand === '') return null;
  const ring = `0 0 0 3px ${withAlpha(brand, 0.45)}`;
  const gone = `0 0 0 3px ${withAlpha(brand, 0)}`;
  return element.animate([{ boxShadow: ring }, { boxShadow: gone }], {
    duration: durationMs,
    easing: 'ease-out',
  });
}
