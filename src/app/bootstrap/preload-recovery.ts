import { consumeSessionFlag, markSessionFlag } from '@/shared/lib/cache';

const RELOAD_FLAG = 'preloadReloaded';
export const BUILD_MISMATCH_EVENT = 'love20:build-mismatch';

/**
 * A stale HTML shell on Pages can point at chunks that were deleted by the next
 * deploy. Reload exactly once per tab; if it still fails, switch to the blocking
 * "有新版本" notice instead of looping.
 */
export function installPreloadRecovery(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    if (consumeSessionFlag(RELOAD_FLAG)) {
      window.dispatchEvent(new CustomEvent(BUILD_MISMATCH_EVENT));
      return;
    }
    markSessionFlag(RELOAD_FLAG);
    window.location.reload();
  });
}
