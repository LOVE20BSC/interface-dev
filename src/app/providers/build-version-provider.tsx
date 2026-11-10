import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { BUILD_ID } from '@/config/build-id.generated';
import { BASE_URL } from '@/app/router/base-path';
import { BUILD_MISMATCH_EVENT } from '@/app/bootstrap/preload-recovery';

const BuildVersionBanner = lazy(async () => {
  const module = await import('@/app/providers/build-version-banner');
  return { default: module.BuildVersionBanner };
});

interface BuildVersionValue {
  readonly buildId: string;
  readonly mismatch: boolean;
  readonly reload: () => void;
}

const BuildVersionContext = createContext<BuildVersionValue | null>(null);

export function useBuildVersion(): BuildVersionValue {
  const value = useContext(BuildVersionContext);
  if (value === null) throw new Error('useBuildVersion must be used inside BuildVersionProvider');
  return value;
}

/**
 * Pages serves index.html with max-age=600 and offers no custom headers, so a
 * stale shell is detected by evidence only: compare the build id baked into this
 * bundle with build-id.json from the same deployment. The blocking UI itself is
 * lazy-loaded; the check costs a few hundred bytes on the happy path.
 */
export function BuildVersionProvider({ children }: { readonly children: ReactNode }) {
  const [mismatch, setMismatch] = useState(false);
  const [remoteBuildId, setRemoteBuildId] = useState<string | null>(null);
  const [reloadRequested, setReloadRequested] = useState(false);

  useEffect(() => {
    const onMismatch = () => setMismatch(true);
    window.addEventListener(BUILD_MISMATCH_EVENT, onMismatch);
    return () => window.removeEventListener(BUILD_MISMATCH_EVENT, onMismatch);
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch(`${BASE_URL}build-id.json?t=${Date.now().toString()}`, {
          cache: 'no-store',
        });
        if (!response.ok) return;
        const payload: unknown = await response.json();
        if (typeof payload !== 'object' || payload === null) return;
        const remote = (payload as { buildId?: unknown }).buildId;
        if (typeof remote !== 'string') return;
        if (cancelled) return;
        setRemoteBuildId(remote);
        if (remote !== BUILD_ID) setMismatch(true);
      } catch {
        // Offline / old deployment without build-id.json: do not nag the user.
      }
    };

    void check();
    const interval = window.setInterval(
      () => {
        void check();
      },
      5 * 60 * 1000,
    );
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const reload = () => {
    setReloadRequested(true);
    window.location.reload();
  };

  const value = useMemo<BuildVersionValue>(
    () => ({ buildId: BUILD_ID, mismatch, reload }),
    [mismatch],
  );

  return (
    <BuildVersionContext.Provider value={value}>
      {children}
      {mismatch ? (
        <Suspense fallback={null}>
          <BuildVersionBanner
            localBuildId={BUILD_ID}
            remoteBuildId={remoteBuildId}
            reloading={reloadRequested}
            onReload={reload}
          />
        </Suspense>
      ) : null}
    </BuildVersionContext.Provider>
  );
}
