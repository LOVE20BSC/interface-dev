import { expect, type Page } from '@playwright/test';

/**
 * Soft-transition probe (owner 2026-11-16).
 *
 * The whole-page transition only lives 180 ms + 200 ms, so asserting on
 * `main[data-transition]` directly races the fade. An init script records every
 * mutation instead: the spec clicks, and the probe proves the page really went
 * idle → leaving → entering (and that a button was busy while it faded).
 */
interface TransitionProbe {
  __l20Transitions?: string[];
  __l20Busy?: boolean;
}

export async function recordSoftTransition(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = window as unknown as TransitionProbe;
    probe.__l20Transitions = [];
    probe.__l20Busy = false;

    const record = (): void => {
      const main = document.querySelector('main');
      const phase = main?.getAttribute('data-transition') ?? null;
      if (phase !== null) probe.__l20Transitions?.push(phase);
      if (document.querySelector('button[aria-busy="true"]') !== null) probe.__l20Busy = true;
    };

    const start = (): void => {
      new MutationObserver(record).observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-transition', 'aria-busy'],
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  });
}

export async function transitionPhases(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as TransitionProbe).__l20Transitions ?? []);
}

/** Waits until the click produced a full fade-out → fade-in cycle. */
export async function expectSoftTransition(page: Page): Promise<void> {
  await expect
    .poll(async () => (await transitionPhases(page)).join(','), {
      timeout: 5_000,
      intervals: [20, 50, 100],
    })
    .toMatch(/leaving.*entering/);
}

/** A button carried `aria-busy` while the page faded (the row's 切换中… state). */
export async function expectBusyButtonDuringTransition(page: Page): Promise<void> {
  await expect
    .poll(
      async () => page.evaluate(() => (window as unknown as TransitionProbe).__l20Busy ?? false),
      { timeout: 5_000, intervals: [20, 50, 100] },
    )
    .toBe(true);
}

/**
 * Freezes the running page fade at its midpoint so the screenshot really shows
 * the transition (a full-opacity frame would be indistinguishable from the
 * settled page). Returns how many page-transition animations were paused; 0 means
 * the shot was taken too late to catch one, which the caller must not treat as a
 * failure — the probes above are the actual assertions.
 */
export async function freezePageFadeAtMidpoint(page: Page): Promise<number> {
  return page.evaluate(() => {
    const animations = document
      .getAnimations()
      .filter(
        (animation): animation is CSSAnimation =>
          animation instanceof CSSAnimation &&
          (animation.animationName === 'l20-page-leave' ||
            animation.animationName === 'l20-page-enter'),
      );
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = animation.animationName === 'l20-page-leave' ? 90 : 100;
    }
    return animations.length;
  });
}
