import { useState } from 'react';
import { Check, ChevronDown, Search } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Sheet } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';
import type { SwapToken } from '@/features/swap-token/lib/swap-types';
import type { SwapTokenSearchStatus } from '@/features/swap-token/model/use-swap-catalog';

export interface TokenSelectProps {
  readonly side: 'from' | 'to';
  readonly selected: SwapToken | undefined;
  readonly nativeToken: SwapToken;
  readonly wrappedToken: SwapToken | undefined;
  readonly communityTokens: readonly SwapToken[];
  readonly searchResults: readonly SwapToken[];
  readonly searchStatus: SwapTokenSearchStatus;
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly hasMore: boolean;
  readonly onLoadMore: () => void;
  readonly isLoading: boolean;
  readonly onSelect: (token: SwapToken) => void;
  readonly disabled?: boolean;
  /** Recovery actions reuse this selector with a verb as the trigger label. */
  readonly triggerLabel?: string;
  readonly triggerClassName?: string;
}

function TokenRow({
  token,
  selected,
  onSelect,
}: {
  readonly token: SwapToken;
  readonly selected: boolean;
  readonly onSelect: (token: SwapToken) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`swap-token-option-${token.symbol}`}
      aria-pressed={selected}
      onClick={() => onSelect(token)}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2.5 text-left text-sm',
        'hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        selected && 'bg-brand-soft/60',
      )}
    >
      <span className="truncate font-mono text-[13px] font-semibold text-foreground">
        {token.symbol}
      </span>
      {selected ? (
        <Check className="h-4 w-4 shrink-0 text-brand-strong" aria-hidden="true" />
      ) : null}
    </button>
  );
}

function GroupLabel({ children }: { readonly children: string }) {
  return (
    <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">
      {children}
    </p>
  );
}

function TokenList({
  props,
  onPick,
}: {
  readonly props: TokenSelectProps;
  readonly onPick: (token: SwapToken) => void;
}) {
  const {
    selected,
    nativeToken,
    wrappedToken,
    communityTokens,
    searchResults,
    searchStatus,
    search,
    onSearchChange,
    hasMore,
    onLoadMore,
    isLoading,
  } = props;
  const query = search.trim().toLowerCase();
  const exact = searchResults.filter(
    (token) =>
      !communityTokens.some(
        (candidate) =>
          candidate.address !== undefined &&
          token.address !== undefined &&
          candidate.address.toLowerCase() === token.address.toLowerCase(),
      ),
  );
  const matches = (token: SwapToken) =>
    query.length === 0 || token.symbol.toLowerCase().includes(query);
  const visibleCommunity = communityTokens.filter(matches);
  const showNative = matches(nativeToken);
  const showWrapped = wrappedToken !== undefined && matches(wrappedToken);
  const nothing =
    query.length > 0 &&
    !showNative &&
    !showWrapped &&
    visibleCommunity.length === 0 &&
    exact.length === 0 &&
    searchStatus !== 'loading';

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">{copy.swap.searchPlaceholder}</span>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={copy.swap.searchPlaceholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="h-10 w-full rounded-xl border border-line bg-surface pl-8 pr-2.5 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
        />
      </label>
      <p className="mt-1.5 px-1 text-[11px] leading-4 text-muted">{copy.swap.searchHint}</p>

      {isLoading && communityTokens.length === 0 ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-4/5" />
        </div>
      ) : null}

      {showNative ? (
        <div className="mt-2">
          <GroupLabel>{copy.swap.groupNative}</GroupLabel>
          <TokenRow token={nativeToken} selected={selected?.kind === 'native'} onSelect={onPick} />
        </div>
      ) : null}

      {showWrapped && wrappedToken !== undefined ? (
        <div className="mt-1">
          <GroupLabel>{copy.swap.groupWrapped}</GroupLabel>
          <TokenRow
            token={wrappedToken}
            selected={selected?.kind === 'wrapped'}
            onSelect={onPick}
          />
        </div>
      ) : null}

      <div className="mt-1">
        <GroupLabel>{copy.swap.groupCommunity}</GroupLabel>
        {exact.map((token) => (
          <TokenRow
            key={`exact-${token.symbol}`}
            token={token}
            selected={
              selected?.address !== undefined &&
              token.address !== undefined &&
              selected.address.toLowerCase() === token.address.toLowerCase()
            }
            onSelect={onPick}
          />
        ))}
        {visibleCommunity.map((token) => (
          <TokenRow
            key={token.address ?? token.symbol}
            token={token}
            selected={
              selected?.address !== undefined &&
              token.address !== undefined &&
              selected.address.toLowerCase() === token.address.toLowerCase()
            }
            onSelect={onPick}
          />
        ))}
        {visibleCommunity.length === 0 && exact.length === 0 && searchStatus === 'loading' ? (
          <p className="px-2.5 py-2 text-xs text-muted">{copy.swap.searchLoading}</p>
        ) : null}
        {nothing ? <p className="px-2.5 py-2 text-xs text-muted">{copy.swap.searchEmpty}</p> : null}
        {query.length === 0 &&
        communityTokens.length === 0 &&
        !isLoading &&
        searchStatus !== 'loading' ? (
          <p className="px-2.5 py-2 text-xs text-muted">{copy.swap.noCommunityTokens}</p>
        ) : null}
      </div>

      {query.length === 0 && hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-xs font-medium text-foreground hover:bg-slate-50"
        >
          {copy.swap.loadMore}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Same selector on both breakpoints: bottom sheet under md, popover at md+.
 * The list is native → wrapped → community; community pages arrive from
 * Launch.tokens and the search is an exact symbol lookup.
 */
export function TokenSelect(props: TokenSelectProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = useState(false);
  const { side, selected, disabled = false, onSelect, triggerLabel, triggerClassName } = props;
  const label = side === 'from' ? copy.swap.from : copy.swap.to;

  const renderTrigger = (onClick?: () => void) => (
    <button
      type="button"
      data-testid={`swap-${side}-token`}
      disabled={disabled}
      aria-label={triggerLabel ?? copy.swap.selectToken(label)}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-2xl border border-line bg-surface px-3 text-sm font-semibold text-foreground shadow-soft',
        triggerLabel === undefined ? 'max-w-[11rem]' : 'max-w-none',
        'hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-60',
        triggerClassName,
      )}
    >
      {triggerLabel !== undefined ? (
        <span className="truncate">{triggerLabel}</span>
      ) : selected === undefined ? (
        <Skeleton className="h-4 w-16" />
      ) : (
        <span className="truncate font-mono text-[13px]">{selected.symbol}</span>
      )}
      <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
    </button>
  );

  const pick = (token: SwapToken) => {
    onSelect(token);
    setOpen(false);
    props.onSearchChange('');
  };

  if (isDesktop) {
    return (
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) props.onSearchChange('');
        }}
      >
        <PopoverTrigger asChild>{renderTrigger()}</PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="end">
          <p className="mb-2 text-sm font-semibold text-foreground">{copy.swap.tokenSheetTitle}</p>
          <TokenList props={props} onPick={pick} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      {renderTrigger(() => {
        if (!disabled) setOpen(true);
      })}
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) props.onSearchChange('');
        }}
        title={copy.swap.tokenSheetTitle}
      >
        <TokenList props={props} onPick={pick} />
      </Sheet>
    </>
  );
}
