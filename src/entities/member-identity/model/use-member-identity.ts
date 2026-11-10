import { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, useReadContract, useReadContracts } from 'wagmi';
import { memberNftAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { cache } from '@/shared/lib/cache';
import { isSameAddress } from '@/shared/lib/format';
import { useMemberNftAddress } from '@/entities/member-identity/model/use-member-nft-address';

export interface MemberIdentity {
  readonly tokenId: bigint;
  readonly name: string;
}

export type MemberIdentityStatus =
  'disconnected' | 'loading' | 'unconfigured' | 'error' | 'empty' | 'needs-selection' | 'ready';

export interface MemberIdentityState {
  readonly status: MemberIdentityStatus;
  readonly identities: readonly MemberIdentity[];
  readonly selected: MemberIdentity | null;
  readonly isInvalidated: boolean;
  readonly isTruncated: boolean;
  readonly memberNftAddress: HexAddress | undefined;
  readonly select: (tokenId: bigint) => void;
  readonly clear: () => void;
  readonly refetch: () => void;
}

const MAX_IDENTITIES = 100;
const IDENTITY_KEY = 'identity';

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
 * Read model for the selected member identity.
 *
 * Selection is cached per (chainId, MemberNFT address, wallet) and re-validated
 * against ownerOf() on every load. A transferred identity is cleared and reported
 * neutrally instead of letting the user act on an identity they no longer control.
 *
 * Enumeration uses balanceOf + tokenOfOwnerByIndex via multicall; no event logs,
 * no backend, no tokenURI.
 */
export function useMemberIdentity(): MemberIdentityState {
  const { address: account } = useAccount();
  const chainId = useChainId();
  const memberNft = useMemberNftAddress();
  const nft = memberNft.address;

  const [selectedTokenId, setSelectedTokenId] = useState<bigint | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isInvalidated, setIsInvalidated] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- hydration reads the namespaced cache, an external store */
  useEffect(() => {
    setHydrated(false);
    if (account === undefined || nft === undefined) {
      setSelectedTokenId(null);
      setHydrated(true);
      return;
    }
    const stored = cache.get<StoredIdentity>(
      { chainId, contractAddress: nft, wallet: account },
      IDENTITY_KEY,
    );
    setSelectedTokenId(readStoredTokenId(stored));
    setHydrated(true);
  }, [account, chainId, nft]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const balanceRead = useReadContract({
    address: nft,
    abi: memberNftAbi,
    functionName: 'balanceOf',
    args: account !== undefined ? [account] : ['0x0000000000000000000000000000000000000000'],
    query: { enabled: nft !== undefined && account !== undefined },
  });

  const totalCount = balanceRead.data !== undefined ? Number(balanceRead.data) : 0;
  const limitedCount = Number.isFinite(totalCount) ? Math.min(totalCount, MAX_IDENTITIES) : 0;
  const isTruncated = totalCount > MAX_IDENTITIES;

  const idContracts = useMemo(() => {
    if (nft === undefined || account === undefined || limitedCount === 0) return [];
    return Array.from({ length: limitedCount }, (_, index) => ({
      address: nft,
      abi: memberNftAbi,
      functionName: 'tokenOfOwnerByIndex' as const,
      args: [account, BigInt(index)] as const,
    }));
  }, [account, limitedCount, nft]);

  const idsRead = useReadContracts({
    contracts: idContracts,
    query: { enabled: idContracts.length > 0 },
  });

  const tokenIds = useMemo(() => {
    const results = idsRead.data ?? [];
    return results.flatMap((entry) =>
      entry.status === 'success' && typeof entry.result === 'bigint' ? [entry.result] : [],
    );
  }, [idsRead.data]);

  const nameContracts = useMemo(() => {
    if (nft === undefined || tokenIds.length === 0) return [];
    return tokenIds.map((tokenId) => ({
      address: nft,
      abi: memberNftAbi,
      functionName: 'memberName' as const,
      args: [tokenId] as const,
    }));
  }, [nft, tokenIds]);

  const namesRead = useReadContracts({
    contracts: nameContracts,
    query: { enabled: nameContracts.length > 0 },
  });

  const nameByTokenId = useMemo(() => {
    const map = new Map<string, string>();
    const results = namesRead.data ?? [];
    results.forEach((entry, index) => {
      const tokenId = tokenIds[index];
      if (tokenId === undefined) return;
      if (
        entry.status === 'success' &&
        typeof entry.result === 'string' &&
        entry.result.length > 0
      ) {
        map.set(tokenId.toString(), entry.result);
      }
    });
    return map;
  }, [namesRead.data, tokenIds]);

  const identities = useMemo<readonly MemberIdentity[]>(
    () =>
      tokenIds.map((tokenId) => ({
        tokenId,
        name: nameByTokenId.get(tokenId.toString()) ?? `身份 #${tokenId.toString()}`,
      })),
    [nameByTokenId, tokenIds],
  );

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
    if (ownerRead.data === undefined || isSameAddress(ownerRead.data, account)) return;
    cache.remove({ chainId, contractAddress: nft, wallet: account }, IDENTITY_KEY);
    setSelectedTokenId(null);
    setIsInvalidated(true);
  }, [account, chainId, nft, ownerRead.data, selectedTokenId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const select = (tokenId: bigint) => {
    if (account === undefined || nft === undefined) return;
    cache.set({ chainId, contractAddress: nft, wallet: account }, IDENTITY_KEY, {
      tokenId: tokenId.toString(),
    });
    setSelectedTokenId(tokenId);
    setIsInvalidated(false);
  };

  const clear = () => {
    if (account !== undefined && nft !== undefined) {
      cache.remove({ chainId, contractAddress: nft, wallet: account }, IDENTITY_KEY);
    }
    setSelectedTokenId(null);
  };

  const refetch = () => {
    if (nft === undefined) {
      memberNft.refetch();
      return;
    }
    balanceRead.refetch();
    idsRead.refetch();
    namesRead.refetch();
    ownerRead.refetch();
    memberNft.refetch();
  };

  let status: MemberIdentityStatus;
  if (account === undefined) {
    status = 'disconnected';
  } else if (memberNft.status === 'unconfigured') {
    status = 'unconfigured';
  } else if (memberNft.status === 'error') {
    status = 'error';
  } else if (
    !hydrated ||
    memberNft.status === 'resolving' ||
    balanceRead.isLoading ||
    (limitedCount > 0 && idsRead.isLoading) ||
    (selectedTokenId !== null && ownerRead.isLoading)
  ) {
    status = 'loading';
  } else if (balanceRead.isError || idsRead.isError) {
    status = 'error';
  } else if (
    selectedTokenId !== null &&
    ownerRead.data !== undefined &&
    isSameAddress(ownerRead.data, account)
  ) {
    status = 'ready';
  } else if (identities.length === 0) {
    status = 'empty';
  } else {
    status = 'needs-selection';
  }

  const selected: MemberIdentity | null =
    selectedTokenId === null
      ? null
      : (identities.find((identity) => identity.tokenId === selectedTokenId) ?? {
          tokenId: selectedTokenId,
          name:
            nameByTokenId.get(selectedTokenId.toString()) ?? `身份 #${selectedTokenId.toString()}`,
        });

  return {
    status,
    identities,
    selected,
    isInvalidated,
    isTruncated,
    memberNftAddress: nft,
    select,
    clear,
    refetch,
  };
}
