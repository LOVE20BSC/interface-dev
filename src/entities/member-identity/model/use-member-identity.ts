import { useEffect, useState } from 'react';
import { useAccount, useChainId, useReadContract } from 'wagmi';
import { memberNftAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { cache, type CacheScope } from '@/shared/lib/cache';
import { isSameAddress } from '@/shared/lib/format';
import {
  useMemberIdentities,
  type MemberIdentity,
} from '@/entities/member-identity/model/use-member-identities';

export type { MemberIdentity };

export type MemberIdentityStatus =
  'disconnected' | 'loading' | 'unconfigured' | 'error' | 'empty' | 'needs-selection' | 'ready';

export interface MemberIdentityState {
  readonly status: MemberIdentityStatus;
  /** Current identity first, then memberId ascending (UX spec §3.2). */
  readonly identities: readonly MemberIdentity[];
  readonly balance: bigint | undefined;
  readonly selected: MemberIdentity | null;
  /** ownerOf() disagreed with the persisted identity; it was cleared. */
  readonly isInvalidated: boolean;
  readonly isTruncated: boolean;
  readonly memberNftAddress: HexAddress | undefined;
  readonly select: (tokenId: bigint) => void;
  readonly clear: () => void;
  readonly refetch: () => void;
}

const IDENTITY_KEY = 'identity';

/**
 * In-tab selection signal. The header pill and the page each own a hook
 * instance; writing the cache in one must update the other immediately, without
 * waiting for a reload or a cross-tab storage event.
 */
const selectionListeners = new Set<() => void>();

function notifySelectionChanged(): void {
  for (const listener of selectionListeners) listener();
}

interface StoredIdentity {
  readonly tokenId?: unknown;
}

function readStoredTokenId(raw: StoredIdentity | null): bigint | null {
  if (raw === null) return null;
  const value = raw.tokenId;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * Selected member identity read model.
 *
 * Selection is cached per (chainId, MemberNFT address, wallet) through the single
 * storage boundary and re-validated against ownerOf() on every load. A transferred
 * identity is cleared and reported neutrally instead of letting the user act on an
 * identity they no longer control (ADR-0003 §2, UX spec §3.1).
 */
export function useMemberIdentity(): MemberIdentityState {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isInvalidated, setIsInvalidated] = useState(false);
  const enumeration = useMemberIdentities(account, selectedTokenId);
  const nft = enumeration.memberNftAddress;

  // The cache is an external store; this effect is the only hydration point.
  /* eslint-disable react-hooks/set-state-in-effect -- hydration reads the namespaced cache */
  useEffect(() => {
    setHydrated(false);
    setIsInvalidated(false);
    if (account === undefined || nft === undefined) {
      setSelectedTokenId(null);
      setHydrated(true);
      return;
    }
    const scope: CacheScope = { chainId, contractAddress: nft, wallet: account };
    const stored = cache.get<StoredIdentity>(scope, IDENTITY_KEY);
    setSelectedTokenId(readStoredTokenId(stored));
    setHydrated(true);
  }, [account, chainId, nft]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (account === undefined || nft === undefined) return;
    const scope: CacheScope = { chainId, contractAddress: nft, wallet: account };
    const sync = () => {
      setSelectedTokenId(readStoredTokenId(cache.get<StoredIdentity>(scope, IDENTITY_KEY)));
    };
    selectionListeners.add(sync);
    return () => {
      selectionListeners.delete(sync);
    };
  }, [account, chainId, nft]);

  const ownerRead = useReadContract({
    address: nft,
    abi: memberNftAbi,
    functionName: 'ownerOf',
    args: selectedTokenId !== null ? [selectedTokenId] : undefined,
    query: { enabled: nft !== undefined && selectedTokenId !== null },
  });

  /* eslint-disable react-hooks/set-state-in-effect -- ownerOf is an external on-chain fact */
  useEffect(() => {
    if (selectedTokenId === null || account === undefined || nft === undefined) return;
    if (ownerRead.data === undefined) return;
    if (isSameAddress(ownerRead.data, account)) return;
    const scope: CacheScope = { chainId, contractAddress: nft, wallet: account };
    cache.remove(scope, IDENTITY_KEY);
    setSelectedTokenId(null);
    setIsInvalidated(true);
    notifySelectionChanged();
  }, [account, chainId, nft, ownerRead.data, selectedTokenId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const identities = enumeration.identities;

  const selected: MemberIdentity | null =
    selectedTokenId === null
      ? null
      : (identities.find((identity) => identity.tokenId === selectedTokenId) ?? {
          tokenId: selectedTokenId,
          name: null,
        });

  const select = (tokenId: bigint) => {
    if (account === undefined || nft === undefined) return;
    const scope: CacheScope = { chainId, contractAddress: nft, wallet: account };
    cache.set(scope, IDENTITY_KEY, { tokenId: tokenId.toString() });
    setSelectedTokenId(tokenId);
    setIsInvalidated(false);
    notifySelectionChanged();
  };

  const clear = () => {
    if (account !== undefined && nft !== undefined) {
      const scope: CacheScope = { chainId, contractAddress: nft, wallet: account };
      cache.remove(scope, IDENTITY_KEY);
    }
    setSelectedTokenId(null);
    notifySelectionChanged();
  };

  const refetch = () => {
    enumeration.refetch();
    ownerRead.refetch();
  };

  let status: MemberIdentityStatus;
  if (account === undefined) {
    status = 'disconnected';
  } else if (enumeration.status === 'unconfigured') {
    status = 'unconfigured';
  } else if (enumeration.status === 'error' || ownerRead.isError) {
    status = 'error';
  } else if (
    !hydrated ||
    enumeration.status === 'loading' ||
    (selectedTokenId !== null && ownerRead.isLoading)
  ) {
    status = 'loading';
  } else if (selectedTokenId !== null && ownerRead.data !== undefined) {
    status = isSameAddress(ownerRead.data, account) ? 'ready' : 'empty';
  } else if (enumeration.identities.length === 0) {
    status = 'empty';
  } else {
    status = 'needs-selection';
  }

  return {
    status,
    identities,
    balance: enumeration.balance,
    selected,
    isInvalidated,
    isTruncated: enumeration.isTruncated,
    memberNftAddress: nft,
    select,
    clear,
    refetch,
  };
}
