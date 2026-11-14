import { useState } from 'react';
import { ArrowUpLeft, List } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy';
import { cn } from '@/shared/lib/cn';
import { Separator } from '@/shared/ui/separator';
import { useCommunitySymbolSearch } from '@/features/switch-community/model/use-community-symbol-search';
import { useRecentCommunities } from '@/features/switch-community/model/use-recent-communities';

export interface CommunityMenuContentProps {
  readonly currentSymbol: string;
  readonly onSwitch: (symbol: string) => void;
  readonly onNavigate: () => void;
}

function StubRow({
  icon,
  label,
  value,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div
      aria-disabled="true"
      className="flex w-full cursor-not-allowed items-center gap-2 rounded-xl px-2.5 py-2.5 text-sm text-muted opacity-70"
    >
      <span className="text-muted" aria-hidden="true">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

/**
 * Community menu: 最近访问 / 父币 / 子币, plus the owner's 2026-11-14 symbol
 * search (`src/features/switch-community/model/use-community-symbol-search.ts`,
 * which reuses the Launch catalog the swap picker owns). Typing replaces the
 * recent list with exact/prefix matches so one symbol is one tap away; clearing
 * the input restores 最近访问 unchanged. Parent/child resolution still arrives
 * with the address-book data layer and stays visibly stubbed.
 */
export function CommunityMenuContent({
  currentSymbol,
  onSwitch,
  onNavigate,
}: CommunityMenuContentProps) {
  const { recent } = useRecentCommunities();
  const [query, setQuery] = useState('');
  const search = useCommunitySymbolSearch(query);
  const others = recent.filter((entry) => entry.symbol !== currentSymbol);
  const searching = search.status !== 'idle';

  const pick = (symbol: string) => {
    if (symbol !== currentSymbol) onSwitch(symbol);
    onNavigate();
  };

  return (
    <div>
      <label htmlFor="community-search" className="sr-only">
        {copy.community.searchLabel}
      </label>
      <div className="px-1 pt-1">
        <input
          id="community-search"
          data-testid="community-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            const first = search.matches[0];
            if (first !== undefined) {
              event.preventDefault();
              pick(first.symbol);
            }
          }}
          placeholder={copy.community.searchPlaceholder}
          aria-label={copy.community.searchLabel}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="h-9 w-full rounded-xl border border-line bg-surface px-2.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
        />
      </div>

      {searching ? (
        <div data-testid="community-search-results">
          <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            {copy.community.searchResults}
          </p>
          {search.status === 'loading' ? (
            <p className="px-2.5 py-2 text-xs leading-5 text-muted" role="status">
              {copy.community.searchLoading}
            </p>
          ) : null}
          {search.status === 'error' ? (
            <p className="px-2.5 py-2 text-xs leading-5 text-danger-strong" role="alert">
              {copy.community.searchError}
            </p>
          ) : null}
          {search.status === 'empty' ? (
            <p className="px-2.5 py-2 text-xs leading-5 text-muted" role="status">
              {copy.community.searchEmpty}
            </p>
          ) : null}
          {search.matches.length > 0 ? (
            <ul>
              {search.matches.map((match) => (
                <li key={match.symbol}>
                  <button
                    type="button"
                    data-testid={`community-search-result-${match.symbol}`}
                    onClick={() => pick(match.symbol)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm',
                      'hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    )}
                  >
                    <span className="font-mono text-[13px] font-semibold text-foreground">
                      {match.symbol}
                    </span>
                    {match.symbol === currentSymbol ? (
                      <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-strong">
                        {copy.community.searchCurrent}
                      </span>
                    ) : null}
                    {match.exact ? (
                      <span className="ml-auto text-[10px] text-muted">
                        {copy.community.searchExact}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {search.matches.length > 0 && search.matches.every((match) => !match.exact) ? (
            <p className="px-2.5 pt-1 text-[11px] leading-4 text-muted">
              {copy.community.searchHint}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <p className="px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted">
            {copy.community.recent}
          </p>
          {others.length === 0 ? (
            <p className="px-2.5 py-2 text-xs leading-5 text-muted">{copy.community.emptyRecent}</p>
          ) : (
            <ul>
              {others.map((entry) => (
                <li key={entry.symbol}>
                  <button
                    type="button"
                    onClick={() => pick(entry.symbol)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm',
                      'hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    )}
                  >
                    <span className="font-mono text-[13px] font-semibold text-foreground">
                      {entry.symbol}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="px-2.5 pt-1 text-[11px] leading-4 text-muted">
            {copy.community.searchHint}
          </p>
        </>
      )}

      <Separator className="my-2" />
      <StubRow
        icon={<ArrowUpLeft className="h-4 w-4" />}
        label={copy.community.parent}
        value={copy.community.notWired}
      />
      <StubRow
        icon={<List className="h-4 w-4" />}
        label={copy.community.child}
        value={copy.community.notWired}
      />

      <p className="mt-2 border-t border-line px-2.5 pt-2.5 text-[11px] leading-5 text-muted">
        {copy.community.switchHint}
      </p>
    </div>
  );
}
