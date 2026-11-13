import { PanelLeftClose, PanelLeftOpen } from '@/shared/ui/icons';
import { Link, useLocation } from 'react-router-dom';
import { BUILD_ID } from '@/config/build-id.generated';
import { APP_ENV } from '@/config/env';
import { variantLabel } from '@/shared/lib/variant-label';
import { copy } from '@/shared/config/copy';
import { cn } from '@/shared/lib/cn';
import { formatBuildId } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { useCommunityDisplay } from '@/entities/community-token/model/use-community-display';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { isNavActive, NAV_ITEMS, type NavItem } from '@/app/navigation/navigation';

function navTo(item: NavItem, search: string) {
  return { pathname: item.to, search } as const;
}

export interface DesktopSidebarProps {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}

/** Desktop navigation: collapsible left rail, same NAV_ITEMS as the mobile bar. */
export function DesktopSidebar({ collapsed, onToggle }: DesktopSidebarProps) {
  const location = useLocation();
  const { symbol } = useCommunityContext();
  const wordmark = useCommunityDisplay(symbol).symbol;
  return (
    <aside
      aria-label={copy.nav.desktopLabel}
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface/90 backdrop-blur transition-[width] duration-200 md:flex',
        collapsed ? 'w-16' : 'w-[232px]',
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center gap-2 border-b border-line',
          collapsed ? 'justify-center px-2' : 'px-4',
        )}
      >
        <Link
          to={{ pathname: '/', search: location.search }}
          aria-label={copy.header.brandAria(wordmark)}
          className="flex min-w-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-strong text-[11px] font-bold text-on-brand shadow-sm"
          >
            L20
          </span>
          {!collapsed ? (
            <span className="truncate text-base font-semibold tracking-tight">{wordmark}</span>
          ) : null}
        </Link>
      </div>

      <nav className="flex-1 px-2 py-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isNavActive(location.pathname, item);
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <Link
                  to={navTo(item, location.search)}
                  aria-label={item.ariaLabel}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    collapsed && 'justify-center px-0',
                    active
                      ? 'bg-brand-soft/60 text-brand-strong'
                      : 'text-muted hover:bg-elevated hover:text-foreground',
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand"
                    />
                  ) : null}
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  {!collapsed && item.placeholder ? (
                    <Badge tone="neutral" className="ml-auto">
                      {copy.common.comingSoon}
                    </Badge>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={cn('border-t border-line p-3', collapsed && 'px-2')}>
        {!collapsed ? (
          <div className="mb-3 space-y-1.5 rounded-2xl bg-elevated p-2.5">
            <div className="flex items-center gap-1.5">
              <Badge tone={APP_ENV.isProd ? 'success' : 'warning'}>
                {variantLabel(APP_ENV.variant)}
              </Badge>
            </div>
            <p className="font-mono text-[10px] text-muted">
              {copy.build.version(formatBuildId(BUILD_ID))}
            </p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? copy.header.expandSidebar : copy.header.collapseSidebar}
          title={collapsed ? copy.header.expandSidebar : copy.header.collapseSidebar}
          className={cn(
            'inline-flex h-10 w-full items-center gap-2 rounded-xl px-2.5 text-xs text-muted hover:bg-elevated hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            collapsed && 'justify-center',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              <span>{copy.header.collapseSidebar}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
