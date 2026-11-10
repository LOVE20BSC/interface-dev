import { useEffect, useMemo, useState } from 'react';
import { useReadContracts } from 'wagmi';
import { memberNftAbi } from '@/config/abis';
import { isMemberNameCharacterValid, utf8ByteLength } from '@/domain/member-name';
import {
  applyDevNamePrefixIfNeeded,
  DEV_NAME_PREFIX_BYTES,
} from '@/features/mint-identity/lib/dev-name-prefix';
import type { MintConfigState } from '@/features/mint-identity/model/use-mint-config';

export type MintNameStatus =
  'empty' | 'too-long' | 'invalid' | 'checking' | 'taken' | 'available' | 'error';

export interface MintQuoteState {
  readonly nameStatus: MintNameStatus;
  /** Name after the CI-004 dev/test prefix; what the chain will actually store. */
  readonly effectiveName: string;
  readonly isPrefixed: boolean;
  readonly byteLength: number;
  /** Maximum bytes the user may type, already reduced by the dev prefix. */
  readonly maxBytes: number | undefined;
  /** Quoted cost in payment-token units; undefined until a valid name is checked. */
  readonly cost: bigint | undefined;
  /** Existing token id when the name is taken; undefined means unknown. */
  readonly existingMemberId: bigint | undefined;
  readonly refetch: () => void;
}

const NAME_DEBOUNCE_MS = 400;

function localNameStatus(
  rawName: string,
  effectiveName: string,
  maxNameLength: number | undefined,
  isConfigReady: boolean,
): 'empty' | 'too-long' | 'invalid' | 'waiting' | 'ok' {
  if (rawName.length === 0) return 'empty';
  if (!isConfigReady || maxNameLength === undefined) return 'waiting';
  if (!isMemberNameCharacterValid(rawName)) return 'invalid';
  if (utf8ByteLength(effectiveName) > maxNameLength) return 'too-long';
  return 'ok';
}

/**
 * Debounced name → price/uniqueness quote (UX spec §3.3).
 *
 * The debounce is the cancellation mechanism: until it settles the contracts
 * array is empty, so a stale request for the previous name cannot overwrite the
 * answer for the new one. Names are sent to the contract exactly as mint() will
 * see them (including the CI-004 dev prefix), never folded to lower case here.
 */
export function useMintQuote(rawName: string, config: MintConfigState): MintQuoteState {
  const [debouncedName, setDebouncedName] = useState('');

  useEffect(() => {
    if (debouncedName === rawName) return;
    const timer = window.setTimeout(() => setDebouncedName(rawName), NAME_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [debouncedName, rawName]);

  const preview = applyDevNamePrefixIfNeeded(rawName, config.paymentTokenSymbol);
  const status = localNameStatus(
    rawName,
    preview.effectiveName,
    config.maxNameLength,
    config.status === 'ready',
  );

  const maxBytes =
    config.maxNameLength !== undefined
      ? config.maxNameLength - (preview.isPrefixed ? DEV_NAME_PREFIX_BYTES : 0)
      : undefined;
  const byteLength = utf8ByteLength(rawName);

  const debounced = applyDevNamePrefixIfNeeded(debouncedName, config.paymentTokenSymbol);
  const debouncedIsValid =
    debouncedName.length > 0 &&
    rawName === debouncedName &&
    config.status === 'ready' &&
    config.maxNameLength !== undefined &&
    isMemberNameCharacterValid(debouncedName) &&
    utf8ByteLength(debounced.effectiveName) <= config.maxNameLength;

  const nft = config.memberNftAddress;
  const contracts = useMemo(() => {
    if (nft === undefined || !debouncedIsValid) return [];
    return [
      {
        address: nft,
        abi: memberNftAbi,
        functionName: 'calculateMintCost' as const,
        args: [debounced.effectiveName] as const,
      },
      {
        address: nft,
        abi: memberNftAbi,
        functionName: 'isNameUsed' as const,
        args: [debounced.effectiveName] as const,
      },
      {
        address: nft,
        abi: memberNftAbi,
        functionName: 'memberId' as const,
        args: [debounced.effectiveName] as const,
      },
    ];
  }, [debounced.effectiveName, debouncedIsValid, nft]);

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
    effectiveName: preview.effectiveName,
    isPrefixed: preview.isPrefixed,
    byteLength,
    maxBytes,
    cost: nameStatus === 'available' ? cost : undefined,
    existingMemberId: nameStatus === 'taken' ? existingMemberId : undefined,
    refetch: () => {
      reads.refetch();
    },
  };
}
