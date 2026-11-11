import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { memberNftAbi } from '@/config/abis';
import type { HexAddress } from '@/config/networks';
import {
  createMemberNameCache,
  resolveMemberNameByName,
  type MemberNameReader,
} from '@/features/transfer-identity/lib/member-name-recipient';

export type MemberNameRecipientStatus =
  'idle' | 'reading' | 'ok' | 'self' | 'not-found' | 'capped' | 'error';

export interface MemberNameRecipientState {
  readonly status: MemberNameRecipientStatus;
  readonly memberId: bigint | null;
  readonly name: string | null;
  readonly address: HexAddress | null;
  /** Re-run the lookup after a transient failure; successful name → id is cached. */
  readonly retry: () => void;
}

const IDLE: MemberNameRecipientState = {
  status: 'idle',
  memberId: null,
  name: null,
  address: null,
  retry: () => {},
};

const NAME_DEBOUNCE_MS = 400;

/**
 * Session cache of name → id. Ownership is never cached: the drawer always
 * reads ownerOf() for the matched id so a concurrent transfer cannot leave a
 * stale recipient on screen.
 */
const sessionNameCache = createMemberNameCache();

type PublicClientLike = NonNullable<ReturnType<typeof usePublicClient>>;

function chainReader(client: PublicClientLike, address: HexAddress): MemberNameReader {
  return {
    totalSupply: async () =>
      (await client.readContract({
        address,
        abi: memberNftAbi,
        functionName: 'totalSupply',
      })) as bigint,
    normalizeName: async (name) =>
      (await client.readContract({
        address,
        abi: memberNftAbi,
        functionName: 'normalizeName',
        args: [name],
      })) as string,
    memberNames: async (ids) => {
      const results = await client.multicall({
        allowFailure: true,
        contracts: ids.map((id) => ({
          address,
          abi: memberNftAbi,
          functionName: 'memberName' as const,
          args: [id] as const,
        })),
      });
      return results.map((entry) =>
        entry.status === 'success' && typeof entry.result === 'string' ? entry.result : null,
      );
    },
    ownerOf: async (memberId) =>
      (await client.readContract({
        address,
        abi: memberNftAbi,
        functionName: 'ownerOf',
        args: [memberId],
      })) as string,
  };
}

function toState(
  resolution: Awaited<ReturnType<typeof resolveMemberNameByName>>,
  retry: () => void,
): MemberNameRecipientState {
  switch (resolution.status) {
    case 'ok':
      return {
        status: 'ok',
        memberId: resolution.memberId,
        name: resolution.name,
        address: resolution.address,
        retry,
      };
    case 'self':
      return {
        status: 'self',
        memberId: resolution.memberId,
        name: resolution.name,
        address: null,
        retry,
      };
    default:
      return { status: resolution.status, memberId: null, name: null, address: null, retry };
  }
}

/**
 * 按身份 NFT 名字: the typed name is normalised by the contract and matched by
 * enumerating totalSupply()/memberName() in ≤100-id Multicall3 chunks, capped at
 * 1000 ids. The lookup runs once per debounced input (plus an explicit retry);
 * there is no polling or interval refetch.
 */
export function useMemberNameRecipient(
  memberNftAddress: HexAddress | undefined,
  input: string,
  active: boolean,
  selfAddress: string | undefined,
): MemberNameRecipientState {
  const client = usePublicClient();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly value: MemberNameRecipientState;
  } | null>(null);

  const trimmed = input.trim();
  const currentKey = `${memberNftAddress ?? ''}|${trimmed}|${attempt}`;

  const retry = () => setAttempt((value) => value + 1);

  useEffect(() => {
    if (!active || trimmed === '' || memberNftAddress === undefined || client === undefined) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void resolveMemberNameByName(
        trimmed,
        selfAddress,
        chainReader(client, memberNftAddress),
        sessionNameCache,
      ).then((resolution) => {
        if (cancelled) return;
        setResult({ key: currentKey, value: toState(resolution, retry) });
      });
    }, NAME_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, attempt, client, currentKey, memberNftAddress, selfAddress, trimmed]);

  if (!active || trimmed === '') {
    return { ...IDLE, retry };
  }
  if (memberNftAddress === undefined || client === undefined) {
    return { status: 'error', memberId: null, name: null, address: null, retry };
  }
  if (result === null || result.key !== currentKey) {
    return { status: 'reading', memberId: null, name: null, address: null, retry };
  }
  return result.value;
}
