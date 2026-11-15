import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMediaQuery } from '@/shared/lib/use-media-query';

export type TransitionPhase = 'idle' | 'leaving' | 'entering';

/**
 * Page-level soft transition (owner 2026-11-16: 「有一个过渡动画，要不然感觉很突兀，
 * 突然刷新了下」).
 *
 * The app has several whole-page changes that are not route changes — selecting an
 * identity NFT, switching the community, switching the palette — plus one route
 * change that happens without a navigation gesture (mint receipt → /my-nft). All
 * of them go through `run()`: the shell fades the page content out, the change is
 * applied while it is invisible, then the new state fades back in.
 *
 * CSS only (src/index.css `.l20-page-transition`); no animation dependency. The
 * durations here and in the stylesheet must stay in sync. `prefers-reduced-motion:
 * reduce` skips the animation in JS (the change is applied immediately) AND the
 * stylesheet disables the keyframes, so no JS-only window can slip through.
 */
export const TRANSITION_LEAVE_MS = 180;
export const TRANSITION_ENTER_MS = 200;

export interface SoftTransitionValue {
  readonly phase: TransitionPhase;
  readonly isTransitioning: boolean;
  /** Fades out, applies the whole-page change, fades back in. */
  readonly run: (change: () => void) => void;
}

const SoftTransitionContext = createContext<SoftTransitionValue | null>(null);

const NO_PROVIDER: SoftTransitionValue = {
  phase: 'idle',
  isTransitioning: false,
  run: (change) => change(),
};

export function SoftTransitionProvider({ children }: { readonly children: ReactNode }) {
  // Reads the same media query the stylesheet honours; jsdom defaults to false.
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [phase, setPhase] = useState<TransitionPhase>('idle');
  const reducedRef = useRef(reducedMotion);
  const busyRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const run = useCallback((change: () => void) => {
    // A transition owns the page until it finishes; a second tap must not queue a
    // second whole-page change.
    if (busyRef.current) return;
    if (reducedRef.current || typeof window === 'undefined') {
      change();
      return;
    }
    busyRef.current = true;
    setPhase('leaving');
    timerRef.current = window.setTimeout(() => {
      change();
      setPhase('entering');
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        busyRef.current = false;
        setPhase('idle');
      }, TRANSITION_ENTER_MS);
    }, TRANSITION_LEAVE_MS);
  }, []);

  const value = useMemo<SoftTransitionValue>(
    () => ({ phase, isTransitioning: phase !== 'idle', run }),
    [phase, run],
  );

  return <SoftTransitionContext.Provider value={value}>{children}</SoftTransitionContext.Provider>;
}

/**
 * Outside the shell (unit tests render a page on its own) the transitions are a
 * no-op: the change is applied immediately instead of throwing.
 */
export function useSoftTransition(): SoftTransitionValue {
  return useContext(SoftTransitionContext) ?? NO_PROVIDER;
}
