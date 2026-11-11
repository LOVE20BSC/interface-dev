import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { DEPLOYMENT } from '@/config/networks';
import { copy } from '@/shared/config/copy';
import { cn } from '@/shared/lib/cn';
import { AppErrorBoundary } from '@/app/shell/error-boundary';
import { RouteFallback } from '@/app/shell/route-fallback';
import { RoutePrefetcher } from '@/app/router/route-prefetcher';
import { AppHeader } from '@/app/shell/app-header';
import { BottomNav } from '@/app/shell/bottom-nav';
import { DesktopSidebar } from '@/app/shell/desktop-sidebar';

function TestnetBanner() {
  if (!DEPLOYMENT.testnet) return null;
  return (
    <div
      role="status"
      className="border-b border-warning/20 bg-warning-soft/70 px-4 py-1.5 text-center text-[11px] font-medium text-warning"
    >
      {copy.banners.testnet}
    </div>
  );
}

/**
 * Application shell: header + content + mobile tab bar / desktop sidebar.
 * Navigation config is shared by both presentations; the bottom bar is not
 * restyled into the sidebar at md (they are distinct components on purpose).
 */
export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <RoutePrefetcher />
      <DesktopSidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
      <div
        className={cn(
          'flex min-h-dvh flex-col transition-[padding] duration-200',
          collapsed ? 'md:pl-16' : 'md:pl-[232px]',
        )}
      >
        <AppHeader />
        <TestnetBanner />
        <main className="mx-auto w-full max-w-[32rem] flex-1 px-4 pb-[calc(var(--nav-h)+16px)] pt-4 md:max-w-2xl md:pb-10">
          <AppErrorBoundary key={location.pathname}>
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </AppErrorBoundary>
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
