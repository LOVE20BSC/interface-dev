import type { LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { configuredAddress } from '@/config/networks';
import {
  groupAppsByCategory,
  resolveAppsCatalog,
  type AppEntry,
  type AppIconKey,
} from '@/domain/apps-catalog';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import {
  ArrowDownUp,
  BookOpen,
  ChevronRight,
  Droplets,
  Gift,
  Palette,
  Send,
  ShieldCheck,
  UserRound,
} from '@/shared/ui/icons';

/**
 * 应用 (UX spec §3.6): the feature-directory surface behind the fourth tab.
 *
 * The catalog is static data (`domain/apps-catalog.ts`), so there is no loading
 * state. Every row is a real route that keeps the current search (including
 * `?symbol=` and any other query). A row whose target contract is missing in
 * this build renders as a disabled row with its reason instead of a dead link.
 * There is deliberately no filled button on this page.
 */

const APP_ICONS: Readonly<Record<AppIconKey, LucideIcon>> = Object.freeze({
  gift: Gift,
  identity: UserRound,
  swap: ArrowDownUp,
  send: Send,
  liquidity: Droplets,
  batch: Send,
  shield: ShieldCheck,
  book: BookOpen,
  palette: Palette,
});

/** Build availability from the address book, never from a per-page env branch. */
function currentCatalog(): readonly AppEntry[] {
  return resolveAppsCatalog({
    airdrop: configuredAddress('airdropDistributor') !== undefined,
    memberNFT: configuredAddress('memberNFT') !== undefined,
    router: configuredAddress('router') !== undefined,
    batchTransfer: configuredAddress('batchTransfer') !== undefined,
  });
}

function AppRow({ entry, search }: { readonly entry: AppEntry; readonly search: string }) {
  const item = copy.apps.items[entry.labelKey];
  const Icon = APP_ICONS[entry.icon];
  const disabled = entry.availability === 'unavailable';

  const body = (
    <>
      <span
        className={cn(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
          disabled ? 'bg-elevated text-muted' : 'bg-brand-soft text-brand-strong',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{item.label}</span>
        {disabled && entry.unavailableReason !== undefined ? (
          <span className="mt-0.5 block text-xs leading-5 text-muted">
            {copy.apps.unavailable[entry.unavailableReason]}
          </span>
        ) : (
          <span className="mt-0.5 block text-xs leading-5 text-muted">{item.description}</span>
        )}
      </span>
    </>
  );

  if (disabled) {
    return (
      <li>
        <div
          aria-disabled="true"
          data-app-id={entry.id}
          className="flex min-h-14 items-center gap-3 bg-elevated/60 px-4 py-3"
        >
          {body}
        </div>
      </li>
    );
  }

  return (
    <li>
      <Link
        to={{ pathname: entry.route, search }}
        data-app-id={entry.id}
        className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
        {body}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </Link>
    </li>
  );
}

function AppList({
  entries,
  search,
}: {
  readonly entries: readonly AppEntry[];
  readonly search: string;
}) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {entries.map((entry) => (
        <AppRow key={entry.id} entry={entry} search={search} />
      ))}
    </ul>
  );
}

export function AppsPage() {
  const { search } = useLocation();
  const entries = currentCatalog();
  // One category stays a flat list; two or more switch to grouped sections.
  const groups = groupAppsByCategory(entries);

  return (
    <nav aria-label={copy.apps.label} className="space-y-5">
      {groups === null ? (
        <AppList entries={entries} search={search} />
      ) : (
        groups.map((group) => (
          <section
            key={group.category}
            aria-labelledby={`apps-category-${group.category}`}
            className="space-y-2"
          >
            <h2
              id={`apps-category-${group.category}`}
              className="px-1 text-xs font-semibold text-muted"
            >
              {copy.apps.categories[group.category]}
            </h2>
            <AppList entries={group.entries} search={search} />
          </section>
        ))
      )}
    </nav>
  );
}
