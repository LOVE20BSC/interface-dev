import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from '@/shared/ui/icons';
import { cn } from '@/shared/lib/cn';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Sheet } from '@/shared/ui/sheet';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Shared token picker: presentation + search only. The caller owns the token
 * universe (type, metadata source, balance) and passes already-resolved options
 * grouped by section. This component never reads the chain and never decides
 * which tokens exist — the same rule the 兑换 page already follows.
 *
 * Behaviour is the one the swap selector shipped with: one search box, native →
 * wrapped → community (in caller order), an optional exact-symbol result list
 * rendered inside its group, 「加载更多」 paging and the same messages. Bottom
 * sheet under md, popover at md+.
 */

export interface TokenPickerItem {
  /** Stable identity (native kind, or a lower-cased address). */
  readonly key: string;
  readonly symbol: string;
  /** Optional short tag rendered next to the symbol (e.g. 自定义). */
  readonly badge?: string;
}

export interface TokenPickerGroup {
  readonly key: string;
  readonly label: string;
  readonly items: readonly TokenPickerItem[];
  /**
   * Empty-state line rendered when the group has no items and the search box is
   * empty. Groups without it disappear when empty.
   */
  readonly emptyLabel?: string;
}

export type TokenPickerSearchStatus = 'idle' | 'loading' | 'found' | 'empty' | 'error';

export interface TokenPickerLabels {
  readonly title: string;
  readonly searchPlaceholder: string;
  readonly searchHint: string;
  readonly searchEmpty: string;
  readonly searchLoading: string;
  readonly loadMore: string;
}

export interface TokenPickerProps {
  /** Row test id prefix: `${optionTestIdPrefix}-token-option-${symbol}`. */
  readonly optionTestIdPrefix: string;
  readonly triggerTestId: string;
  readonly triggerAriaLabel: string;
  readonly labels: TokenPickerLabels;
  readonly groups: readonly TokenPickerGroup[];
  /** Exact-symbol lookup result, rendered first inside `searchResultsGroupKey`. */
  readonly searchResults?: readonly TokenPickerItem[] | undefined;
  /** Group whose section hosts the exact result rows (e.g. community). */
  readonly searchResultsGroupKey?: string | undefined;
  readonly searchStatus: TokenPickerSearchStatus;
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly selected: TokenPickerItem | undefined;
  /**
   * Items that must not be selectable because another control already owns them
   * (the 兑换 page hides the opposite side's token — owner 2026-11-14). Hidden
   * here, and `excludedNote` explains why the list is one entry shorter.
   */
  readonly excludedKeys?: readonly string[] | undefined;
  readonly excludedNote?: string | undefined;
  readonly onSelect: (item: TokenPickerItem) => void;
  readonly hasMore?: boolean | undefined;
  readonly onLoadMore?: (() => void) | undefined;
  readonly isLoading?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  /** Recovery actions reuse this selector with a verb as the trigger label. */
  readonly triggerLabel?: string | undefined;
  readonly triggerClassName?: string | undefined;
  readonly extraContent?: ReactNode | undefined;
}

function TokenRow({
  item,
  testIdPrefix,
  selected,
  onSelect,
}: {
  readonly item: TokenPickerItem;
  readonly testIdPrefix: string;
  readonly selected: boolean;
  readonly onSelect: (item: TokenPickerItem) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`${testIdPrefix}-token-option-${item.symbol}`}
      aria-pressed={selected}
      onClick={() => onSelect(item)}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2.5 text-left text-sm',
        'hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        selected && 'bg-brand-soft/60',
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono text-[13px] font-semibold text-foreground">
          {item.symbol}
        </span>
        {item.badge !== undefined ? (
          <span className="shrink-0 rounded-full bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted">
            {item.badge}
          </span>
        ) : null}
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
  readonly props: TokenPickerProps;
  readonly onPick: (item: TokenPickerItem) => void;
}) {
  const {
    groups,
    searchResults = [],
    searchResultsGroupKey,
    searchStatus,
    search,
    onSearchChange,
    hasMore = false,
    onLoadMore,
    isLoading = false,
    optionTestIdPrefix,
    selected,
    excludedKeys = [],
  } = props;
  const query = search.trim().toLowerCase();
  const excluded = new Set(excludedKeys);
  const resultKeys = new Set(searchResults.map((item) => item.key));
  const matches = (item: TokenPickerItem) =>
    !excluded.has(item.key) && (query.length === 0 || item.symbol.toLowerCase().includes(query));

  const visibleByGroup = groups.map((group) => ({
    group,
    items: group.items.filter((item) => !resultKeys.has(item.key) && matches(item)),
  }));
  const exactVisible =
    searchResultsGroupKey === undefined
      ? []
      : searchResults.filter(
          (item) => !excluded.has(item.key) && (matches(item) || query.length === 0),
        );
  const anythingVisible =
    visibleByGroup.some((entry) => entry.items.length > 0) || exactVisible.length > 0;
  const searching = query.length > 0;

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">{props.labels.searchPlaceholder}</span>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={props.labels.searchPlaceholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="h-10 w-full rounded-xl border border-line bg-surface pl-8 pr-2.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
        />
      </label>
      <p className="mt-1.5 px-1 text-[11px] leading-4 text-muted">{props.labels.searchHint}</p>
      {props.excludedNote !== undefined ? (
        <p className="mt-1 px-1 text-[11px] leading-4 text-muted" data-testid="token-picker-note">
          {props.excludedNote}
        </p>
      ) : null}

      {isLoading && groups.every((group) => group.items.length === 0) ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-4/5" />
        </div>
      ) : null}

      {visibleByGroup.map(({ group, items }) => {
        const exactHere = group.key === searchResultsGroupKey ? exactVisible : [];
        const showEmpty = !searching && items.length === 0 && exactHere.length === 0;
        if (items.length === 0 && exactHere.length === 0 && !(showEmpty && group.emptyLabel)) {
          return null;
        }
        return (
          <div key={group.key} className="mt-1 first:mt-2">
            <GroupLabel>{group.label}</GroupLabel>
            {exactHere.map((item) => (
              <TokenRow
                key={`exact-${item.key}`}
                item={item}
                testIdPrefix={optionTestIdPrefix}
                selected={selected?.key === item.key}
                onSelect={onPick}
              />
            ))}
            {items.map((item) => (
              <TokenRow
                key={item.key}
                item={item}
                testIdPrefix={optionTestIdPrefix}
                selected={selected?.key === item.key}
                onSelect={onPick}
              />
            ))}
            {showEmpty && group.emptyLabel !== undefined ? (
              <p className="px-2.5 py-2 text-xs text-muted">{group.emptyLabel}</p>
            ) : null}
          </div>
        );
      })}

      {searching && !anythingVisible && searchStatus !== 'loading' && searchStatus !== 'idle' ? (
        <p className="px-2.5 py-2 text-xs text-muted">{props.labels.searchEmpty}</p>
      ) : null}
      {searching && !anythingVisible && searchStatus === 'loading' ? (
        <p className="px-2.5 py-2 text-xs text-muted">{props.labels.searchLoading}</p>
      ) : null}

      {query.length === 0 && hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          className="mt-2 w-full rounded-xl border border-line px-3 py-2 text-xs font-medium text-foreground hover:bg-elevated"
        >
          {props.labels.loadMore}
        </button>
      ) : null}
      {props.extraContent}
    </div>
  );
}

/**
 * Same selector on both breakpoints: bottom sheet under md, popover at md+.
 * The list is the caller's group order; the search is a symbol substring filter
 * plus the caller's exact-symbol lookup result.
 */
export function TokenPicker(props: TokenPickerProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = useState(false);
  const {
    selected,
    disabled = false,
    onSelect,
    triggerLabel,
    triggerClassName,
    triggerAriaLabel,
    triggerTestId,
  } = props;

  // An external selection (e.g. a custom ERC20 that finished resolving) closes
  // the sheet/popover; opening the picker does not change the selection, so it
  // never closes itself right after opening.
  const selectedKey = selected?.key;
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (selectedKey === undefined) return;
    setOpen(false);
  }, [selectedKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const renderTrigger = (onClick?: () => void) => (
    <button
      type="button"
      data-testid={triggerTestId}
      disabled={disabled}
      aria-label={triggerAriaLabel}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-2xl border border-line bg-surface px-3 text-sm font-semibold text-foreground shadow-soft',
        triggerLabel === undefined ? 'max-w-[11rem]' : 'max-w-none',
        'hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60',
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

  const pick = (item: TokenPickerItem) => {
    onSelect(item);
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
          <p className="mb-2 text-sm font-semibold text-foreground">{props.labels.title}</p>
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
        title={props.labels.title}
      >
        <TokenList props={props} onPick={pick} />
      </Sheet>
    </>
  );
}
