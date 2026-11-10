import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { orderIdentities } from '@/domain/identity-order';
import { memberNftAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import { useMemberNftAddress } from '@/entities/member-identity/model/use-member-nft-address';

export interface MemberIdentity {
  readonly tokenId: bigint;
  /** null when memberName() could not be read; never fabricate a name. */
  readonly name: string | null;
}

export type MemberIdentitiesStatus =
  'disconnected' | 'loading' | 'unconfigured' | 'error' | 'ready';

export interface MemberIdentitiesState {
  readonly status: MemberIdentitiesStatus;
  /** Current identity first (when given), then memberId ascending (UX spec §3.2). */
  readonly identities: readonly MemberIdentity[];
  readonly balance: bigint | undefined;
  readonly isTruncated: boolean;
  readonly memberNftAddress: HexAddress | undefined;
  readonly refetch: () => void;
}

const MAX_IDENTITIES = 100;

/**
 * Enumerate a wallet's MemberNFT identities: balanceOf + tokenOfOwnerByIndex(i),
 * batched through Multicall3 by wagmi's readContracts, then batched memberName().
 * No event logs, no backend, no tokenURI (ADR-0003 §2).
 *
 * `currentTokenId` only changes presentation order; the chain enumeration is
 * always memberId ascending before the current identity is lifted.
 */
export function useMemberIdentities(
  wallet: HexAddress | undefined,
  currentTokenId: bigint | null = null,
): MemberIdentitiesState {
  const memberNft = useMemberNftAddress();
  const nft = memberNft.address;

  const balanceRead = useReadContract({
    address: nft,
    abi: memberNftAbi,
    functionName: 'balanceOf',
    args: wallet !== undefined ? [wallet] : undefined,
    query: { enabled: nft !== undefined && wallet !== undefined },
  });

  const balance = balanceRead.data;
  const totalCount = balance !== undefined ? Number(balance) : 0;
  const limitedCount =
    balance !== undefined && Number.isFinite(totalCount) ? Math.min(totalCount, MAX_IDENTITIES) : 0;
  const isTruncated = balance !== undefined && totalCount > MAX_IDENTITIES;

  const idContracts = useMemo(() => {
    if (nft === undefined || wallet === undefined || limitedCount === 0) return [];
    return Array.from({ length: limitedCount }, (_, index) => ({
      address: nft,
      abi: memberNftAbi,
      functionName: 'tokenOfOwnerByIndex' as const,
      args: [wallet, BigInt(index)] as const,
    }));
  }, [limitedCount, nft, wallet]);

  const idsRead = useReadContracts({
    contracts: idContracts,
    query: { enabled: idContracts.length > 0 },
  });

  const tokenIds = useMemo(() => {
    const results = idsRead.data ?? [];
    const ids = results.flatMap((entry) =>
      entry.status === 'success' && typeof entry.result === 'bigint' ? [entry.result] : [],
    );
    return ids.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
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

  const identities = useMemo<readonly MemberIdentity[]>(() => {
    const results = namesRead.data ?? [];
    const enumerated = tokenIds.map((tokenId, index) => {
      const entry = results[index];
      const name =
        entry?.status === 'success' && typeof entry.result === 'string' && entry.result.length > 0
          ? entry.result
          : null;
      return { tokenId, name };
    });
    return orderIdentities(enumerated, currentTokenId);
  }, [currentTokenId, namesRead.data, tokenIds]);

  const refetch = () => {
    balanceRead.refetch();
    idsRead.refetch();
    namesRead.refetch();
    memberNft.refetch();
  };

  let status: MemberIdentitiesStatus;
  if (wallet === undefined) {
    status = 'disconnected';
  } else if (memberNft.status === 'unconfigured') {
    status = 'unconfigured';
  } else if (memberNft.status === 'error') {
    status = 'error';
  } else if (
    memberNft.status === 'resolving' ||
    balanceRead.isLoading ||
    (limitedCount > 0 && (idsRead.isLoading || namesRead.isLoading))
  ) {
    status = 'loading';
  } else if (balanceRead.isError || idsRead.isError) {
    status = 'error';
  } else {
    status = 'ready';
  }

  return {
    status,
    identities,
    balance,
    isTruncated,
    memberNftAddress: nft,
    refetch,
  };
}
