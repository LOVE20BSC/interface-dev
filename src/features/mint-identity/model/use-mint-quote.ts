import { useEffect, useMemo, useState } from 'react';
import { useReadContracts } from 'wagmi';
import { memberNftAbi } from '@/config/abis';
import { APP_ENV } from '@/config/env';
import { utf8ByteLength } from '@/domain/member-name';
import { localNameStatus, requiresTestNamePrefix } from '@/features/mint-identity/lib/name-rule';
import type { MintConfigState } from '@/features/mint-identity/model/use-mint-config';

export type MintNameStatus =
  | 'empty'
  | 'too-long'
  | 'invalid'
  | 'prefix-required'
  | 'checking'
  | 'taken'
  | 'available'
  | 'error';

export interface MintQuoteState {
  readonly nameStatus: MintNameStatus;
  /** True on dev/test builds: the name must start with `Test` (UX spec §3.3). */
  readonly requiresTestPrefix: boolean;
  readonly byteLength: number;
  /** Quoted cost in payment-token units; undefined until a valid name is checked. */
  readonly cost: bigint | undefined;
  /** Existing token id when the name is taken; undefined means unknown. */
  readonly existingMemberId: bigint | undefined;
  readonly refetch: () => void;
}

const NAME_DEBOUNCE_MS = 400;

/**
 * Debounced name → price/uniqueness quote (UX spec §3.3).
 *
 * The debounce is the cancellation mechanism: until it settles the contracts
 * array is empty, so a stale request for the previous name cannot overwrite the
 * answer for the new one. Names are sent to the contract exactly as the user
 * typed them — core@72a1604 stopped prefixing names, so calculateMintCost(),
 * isNameUsed() and memberId() all take the raw string. The dev/test `Test`
 * requirement is a local blocking rule, never a transformation.
 */
export function useMintQuote(rawName: string, config: MintConfigState): MintQuoteState {
  const [debouncedName, setDebouncedName] = useState('');

  useEffect(() => {
    if (debouncedName === rawName) return;
    const timer = window.setTimeout(() => setDebouncedName(rawName), NAME_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [debouncedName, rawName]);

  const rule = {
    variant: APP_ENV.variant,
    maxNameLength: config.maxNameLength,
    isConfigReady: config.status === 'ready',
  } as const;
  const status = localNameStatus({ name: rawName, ...rule });
  const byteLength = utf8ByteLength(rawName);

  const debouncedStatus = localNameStatus({ name: debouncedName, ...rule });
  const debouncedIsValid = rawName === debouncedName && debouncedStatus === 'ok';

  const nft = config.memberNftAddress;
  const contracts = useMemo(() => {
    if (nft === undefined || !debouncedIsValid) return [];
    return [
      {
        address: nft,
        abi: memberNftAbi,
        functionName: 'calculateMintCost' as const,
        args: [debouncedName] as const,
      },
      {
        address: nft,
        abi: memberNftAbi,
        functionName: 'isNameUsed' as const,
        args: [debouncedName] as const,
      },
      {
        address: nft,
        abi: memberNftAbi,
        functionName: 'memberId' as const,
        args: [debouncedName] as const,
      },
    ];
  }, [debouncedIsValid, debouncedName, nft]);

  const reads = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  const costEntry = reads.data?.[0];
  const usedEntry = reads.data?.[1];
  const idEntry = reads.data?.[2];

  const cost =
    costEntry?.status === 'success' && typeof costEntry.result === 'bigint'
      ? costEntry.result
      : undefined;
  const used =
    usedEntry?.status === 'success' && typeof usedEntry.result === 'boolean'
      ? usedEntry.result
      : undefined;
  const existingMemberId =
    idEntry?.status === 'success' && typeof idEntry.result === 'bigint' && idEntry.result > 0n
      ? idEntry.result
      : undefined;
  const quoteFailed = reads.data?.some((entry) => entry.status === 'failure') ?? false;

  let nameStatus: MintNameStatus;
  if (status === 'empty') {
    nameStatus = 'empty';
  } else if (status === 'invalid') {
    nameStatus = 'invalid';
  } else if (status === 'too-long') {
    nameStatus = 'too-long';
  } else if (status === 'prefix-required') {
    nameStatus = 'prefix-required';
  } else if (status === 'waiting' || rawName !== debouncedName) {
    nameStatus = 'checking';
  } else if (reads.isError || quoteFailed) {
    nameStatus = 'error';
  } else if (reads.isLoading || reads.data === undefined) {
    nameStatus = 'checking';
  } else if (used === true || existingMemberId !== undefined) {
    nameStatus = 'taken';
  } else if (used === undefined || cost === undefined) {
    nameStatus = 'error';
  } else {
    nameStatus = 'available';
  }

  return {
    nameStatus,
    requiresTestPrefix: requiresTestNamePrefix(APP_ENV.variant),
    byteLength,
    cost: nameStatus === 'available' ? cost : undefined,
    existingMemberId: nameStatus === 'taken' ? existingMemberId : undefined,
    refetch: () => {
      reads.refetch();
    },
  };
}
