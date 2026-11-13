import { useCallback, useSyncExternalStore } from 'react';
import {
  applyTheme,
  DEFAULT_THEME,
  getTheme,
  subscribeTheme,
  type ThemeId,
} from '@/shared/lib/theme';

/**
 * Reads the palette from the document (the single source of truth, already set
 * by the index.html bootstrap before React mounted) and re-reads it whenever any
 * component applies a theme. No private React state: two `useTheme()` callers
 * can never disagree with `data-theme`.
 */
export function useTheme(): {
  readonly theme: ThemeId;
  readonly selectTheme: (theme: ThemeId) => void;
} {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => DEFAULT_THEME);
  const selectTheme = useCallback((next: ThemeId) => applyTheme(next), []);
  return { theme, selectTheme };
}
