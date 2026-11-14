import { copy } from '@/shared/config/copy-pages';
import { TokenPicker, type TokenPickerGroup, type TokenPickerItem } from '@/shared/ui/token-picker';
import { swapTokenKey, type SwapToken } from '@/features/swap-token/lib/swap-types';
import type { SwapTokenSearchStatus } from '@/features/swap-token/model/use-swap-catalog';

export interface TokenSelectProps {
  readonly side: 'from' | 'to';
  readonly selected: SwapToken | undefined;
  /**
   * The token already chosen on the other side. Owner 2026-11-14: the picker must
   * not offer it, so a duplicate pair cannot even be selected.
   */
  readonly otherSelected: SwapToken | undefined;
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

/**
 * 兑换 selector: a thin adapter over the shared `TokenPicker`. The token
 * universe (native / wrapped / community + exact-symbol lookup) stays swap
 * territory; presenting and searching it is shared (the transfer page uses the
 * same picker with a different universe).
 */
export function TokenSelect(props: TokenSelectProps) {
  const {
    side,
    selected,
    otherSelected,
    nativeToken,
    wrappedToken,
    communityTokens,
    searchResults,
  } = props;
  const label = side === 'from' ? copy.swap.from : copy.swap.to;
  // Hide the opposite side's token; the one-line note says why it is missing.
  const excludedKeys = otherSelected === undefined ? [] : [swapTokenKey(otherSelected)];
  const excludedNote =
    otherSelected === undefined ? undefined : copy.swap.excludeOtherSide(otherSelected.symbol);

  const tokensByKey = new Map<string, SwapToken>();
  const toItem = (token: SwapToken): TokenPickerItem => {
    const key = swapTokenKey(token);
    tokensByKey.set(key, token);
    return { key, symbol: token.symbol };
  };

  const groups: TokenPickerGroup[] = [
    { key: 'native', label: copy.swap.groupNative, items: [toItem(nativeToken)] },
  ];
  if (wrappedToken !== undefined) {
    groups.push({
      key: 'wrapped',
      label: copy.swap.groupWrapped,
      items: [toItem(wrappedToken)],
    });
  }
  groups.push({
    key: 'community',
    label: copy.swap.groupCommunity,
    items: communityTokens.map(toItem),
    emptyLabel: copy.swap.noCommunityTokens,
  });

  const selectedItem = selected !== undefined ? toItem(selected) : undefined;
  const pick = (item: TokenPickerItem) => {
    const token = tokensByKey.get(item.key);
    if (token !== undefined) props.onSelect(token);
  };

  return (
    <TokenPicker
      optionTestIdPrefix="swap"
      triggerTestId={`swap-${side}-token`}
      triggerAriaLabel={props.triggerLabel ?? copy.swap.selectToken(label)}
      labels={{
        title: copy.swap.tokenSheetTitle,
        searchPlaceholder: copy.swap.searchPlaceholder,
        searchHint: copy.swap.searchHint,
        searchEmpty: copy.swap.searchEmpty,
        searchLoading: copy.swap.searchLoading,
        loadMore: copy.swap.loadMore,
      }}
      groups={groups}
      searchResults={searchResults.map(toItem)}
      searchResultsGroupKey="community"
      searchStatus={props.searchStatus}
      search={props.search}
      onSearchChange={props.onSearchChange}
      selected={selectedItem}
      excludedKeys={excludedKeys}
      excludedNote={excludedNote}
      onSelect={pick}
      hasMore={props.hasMore}
      onLoadMore={props.onLoadMore}
      isLoading={props.isLoading}
      disabled={props.disabled}
      triggerLabel={props.triggerLabel}
      triggerClassName={props.triggerClassName}
    />
  );
}
