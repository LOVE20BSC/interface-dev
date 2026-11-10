import { useCallback, useSyncExternalStore } from 'react';

const QUERY_RESULT_FALLBACK = false;

/**
 * Match a CSS media query. Used only to choose popover vs bottom sheet.
 * Implemented as an external store so it cannot desynchronize during hydration
 * or trigger a setState cascade in an effect.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return QUERY_RESULT_FALLBACK;
    }
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => QUERY_RESULT_FALLBACK);
}
