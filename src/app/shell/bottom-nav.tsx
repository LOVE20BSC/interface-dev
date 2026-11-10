import { Link, useLocation } from 'react-router-dom';
import { copy } from '@/shared/config/copy';
import { cn } from '@/shared/lib/cn';
import { isNavActive, NAV_ITEMS, type NavItem } from '@/app/navigation/navigation';

function navTo(item: NavItem, search: string) {
  return { pathname: item.to, search } as const;
}

/**
 * Mobile tab bar: five tabs with one shared treatment. The center 行动 tab is a
 * placeholder in M0, so it is deliberately not raised — a primary-action disc
 * would over-promise a feature that does not exist yet. This is the only mobile
 * nav; the desktop sidebar is a separate component (never a CSS-converted bottom
 * bar). The bar reserves env(safe-area-inset-bottom) for iPhones.
 */
export function BottomNav() {
  const location = useLocation();
  return (
    <nav
      aria-label={copy.nav.mobileLabel}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid h-16 w-full max-w-md grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(location.pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.key} className="relative flex">
              <Link
                to={navTo(item, location.search)}
                aria-label={item.ariaLabel}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex w-full flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 active:scale-95',
                  active ? 'text-brand-strong' : 'text-muted',
                )}
              >
                <Icon
                  className={cn('h-[22px] w-[22px]', active ? 'stroke-[2.4]' : 'stroke-2')}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
                {item.placeholder ? (
                  <span className="sr-only">（{copy.common.comingSoon}）</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
