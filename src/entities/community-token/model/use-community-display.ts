import { useMemo } from 'react';
import { copy } from '@/shared/config/copy';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';

export interface CommunityDisplay {
  /** Protocol label until the selected community's symbol() is readable. */
  readonly symbol: string;
  /** True once the community token address is known and its metadata is in. */
  readonly resolved: boolean;
  /**
   * True while the symbol is still in flight on a cold start (no cached value).
   * Surfaces that render a community name as chrome use this to hold the name
   * back instead of flashing the protocol label for a frame and then swapping
   * in the on-chain symbol (QA 2026-11-14 G8).
   */
  readonly pending: boolean;
}

/**
 * Single display-name rule for every community surface (UX spec §1.3/§1.4):
 * render the on-chain symbol() when the community is resolved, otherwise the
 * protocol label. `name()` is never a display name.
 *
 * `pending` exists only so the eager chrome (wordmark) can wait for the real
 * name on a cold start; document.title and the wallet chip keep the protocol
 * label fallback untouched.
 */
export function useCommunityDisplay(symbol: string): CommunityDisplay {
  const community = useCommunityToken(symbol);
  const resolved = community.address !== undefined && !community.isMetadataLoading;
  const pending = !resolved && (community.status === 'loading' || community.isMetadataLoading);
  const displaySymbol = resolved ? community.symbol : copy.brand.protocolLabel;
  return useMemo(
    () => ({ symbol: displaySymbol, resolved, pending }),
    [displaySymbol, resolved, pending],
  );
}
