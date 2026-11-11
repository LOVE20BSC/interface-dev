import { useMemo } from 'react';
import { copy } from '@/shared/config/copy';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';

export interface CommunityDisplay {
  /** Protocol label until the selected community's symbol() is readable. */
  readonly symbol: string;
  /** True once the community token address is known and its metadata is in. */
  readonly resolved: boolean;
}

/**
 * Single display-name rule for every community surface (UX spec §1.3/§1.4):
 * render the on-chain symbol() when the community is resolved, otherwise the
 * protocol label. `name()` is never a display name.
 */
export function useCommunityDisplay(symbol: string): CommunityDisplay {
  const community = useCommunityToken(symbol);
  const resolved = community.address !== undefined && !community.isMetadataLoading;
  const displaySymbol = resolved ? community.symbol : copy.brand.protocolLabel;
  return useMemo(() => ({ symbol: displaySymbol, resolved }), [displaySymbol, resolved]);
}
