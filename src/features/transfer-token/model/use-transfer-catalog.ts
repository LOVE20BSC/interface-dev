import { useMemo, useState } from 'react';
import { useBytecode, useReadContracts } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import {
  NETWORK,
  configuredAddress,
  isConfiguredAddress,
  type HexAddress,
} from '@/config/networks';
import {
  useSwapCatalog,
  type SwapTokenSearchStatus,
} from '@/features/swap-token/model/use-swap-catalog';
import type { SwapToken } from '@/features/swap-token/lib/swap-types';
import type { TransferToken } from '@/features/transfer-token/lib/transfer-types';

/**
 * Token universe of 代币转账.
 *
 * Community tokens are the same on-chain Launch registry the 兑换 page uses
 * (paged `Launch.tokens` + exact `tokenAddressBySymbol` lookup) — no hardcoded
 * list. WETH9 and the LP token come from the address book slots; a custom ERC20
 * is validated on demand (bytecode + `symbol()` + `decimals()`) and only joins
 * the list when it is a real token.
 */

export type CustomTokenStatus = 'idle' | 'invalid' | 'checking' | 'no-code' | 'unreadable' | 'ok';

export interface CustomTokenState {
  readonly status: CustomTokenStatus;
  readonly token: TransferToken | undefined;
  readonly address: string | undefined;
  readonly retry: () => void;
}

export interface TransferCatalog {
  readonly nativeToken: TransferToken;
  readonly communityTokens: readonly TransferToken[];
  readonly wrappedToken: TransferToken | undefined;
  readonly lpToken: TransferToken | undefined;
  readonly searchResults: readonly TransferToken[];
  readonly searchStatus: SwapTokenSearchStatus;
  readonly search: string;
  readonly setSearch: (value: string) => void;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly isLoading: boolean;
  readonly custom: CustomTokenState;
  readonly addCustomToken: (address: string) => void;
  readonly clearCustomToken: () => void;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function useCustomToken(candidate: string | undefined): CustomTokenState {
  const address = candidate !== undefined && isConfiguredAddress(candidate) ? candidate : undefined;

  const code = useBytecode({ address, query: { enabled: address !== undefined } });

  const contracts = useMemo(
    () =>
      address === undefined
        ? []
        : [
            { address, abi: love20TokenAbi, functionName: 'symbol' as const },
            { address, abi: love20TokenAbi, functionName: 'decimals' as const },
          ],
    [address],
  );
  const metadata = useReadContracts({
    contracts,
    query: { enabled: address !== undefined },
  });

  const symbolResult = metadata.data?.[0];
  const decimalsResult = metadata.data?.[1];
  const symbol =
    symbolResult?.status === 'success' &&
    typeof symbolResult.result === 'string' &&
    symbolResult.result.length > 0
      ? symbolResult.result
      : undefined;
  const decimals =
    decimalsResult?.status === 'success' && typeof decimalsResult.result === 'number'
      ? decimalsResult.result
      : undefined;

  const retry = () => {
    void code.refetch();
    void metadata.refetch();
  };

  if (candidate === undefined || candidate.length === 0) {
    return { status: 'idle', token: undefined, address: undefined, retry };
  }
  if (!ADDRESS_RE.test(candidate)) {
    return { status: 'invalid', token: undefined, address: undefined, retry };
  }
  if (address === undefined) {
    return { status: 'invalid', token: undefined, address: undefined, retry };
  }
  // viem returns undefined for an address without code; wagmi may surface it as
  // null, so both mean "no contract at this address".
  const noCode = code.data === undefined || code.data === null || code.data === '0x';
  if (code.isLoading || (!code.isFetched && code.data == null)) {
    return { status: 'checking', token: undefined, address, retry };
  }
  if (code.isError) {
    return { status: 'unreadable', token: undefined, address, retry };
  }
  if (noCode) {
    return { status: 'no-code', token: undefined, address, retry };
  }
  if (metadata.isLoading) {
    return { status: 'checking', token: undefined, address, retry };
  }
  if (symbol === undefined || decimals === undefined) {
    return { status: 'unreadable', token: undefined, address, retry };
  }
  return {
    status: 'ok',
    address,
    retry,
    token: { kind: 'custom', address, symbol, decimals },
  };
}

function toTransferToken(token: SwapToken): TransferToken {
  return {
    kind: 'community',
    address: token.address,
    symbol: token.symbol,
    decimals: token.decimals ?? 18,
  };
}

export function useTransferCatalog(): TransferCatalog {
  const launch = configuredAddress('launch');
  const swapCatalog = useSwapCatalog(launch);
  const wethAddress = configuredAddress('weth');
  const pairAddress = configuredAddress('pair');
  const [customAddress, setCustomAddress] = useState<string | undefined>(undefined);

  const metadataAddresses = useMemo(
    () =>
      [wethAddress, pairAddress].filter((address): address is HexAddress => address !== undefined),
    [pairAddress, wethAddress],
  );

  const metadataContracts = useMemo(
    () =>
      metadataAddresses.flatMap((address) => [
        { address, abi: love20TokenAbi, functionName: 'symbol' as const },
        { address, abi: love20TokenAbi, functionName: 'decimals' as const },
      ]),
    [metadataAddresses],
  );

  const metadata = useReadContracts({
    contracts: metadataContracts,
    query: { enabled: metadataContracts.length > 0 },
  });

  const readToken = (index: number, kind: TransferToken['kind']): TransferToken | undefined => {
    const address = metadataAddresses[index];
    if (address === undefined) return undefined;
    const symbolResult = metadata.data?.[index * 2];
    const decimalsResult = metadata.data?.[index * 2 + 1];
    const symbol =
      symbolResult?.status === 'success' &&
      typeof symbolResult.result === 'string' &&
      symbolResult.result.length > 0
        ? symbolResult.result
        : undefined;
    const decimals =
      decimalsResult?.status === 'success' && typeof decimalsResult.result === 'number'
        ? decimalsResult.result
        : undefined;
    if (symbol === undefined || decimals === undefined) return undefined;
    return { kind, address, symbol, decimals };
  };

  const wethIndex = wethAddress === undefined ? -1 : metadataAddresses.indexOf(wethAddress);
  const pairIndex = pairAddress === undefined ? -1 : metadataAddresses.indexOf(pairAddress);
  const wrappedToken = wethIndex >= 0 ? readToken(wethIndex, 'wrapped') : undefined;
  const lpToken = pairIndex >= 0 ? readToken(pairIndex, 'lp') : undefined;

  const custom = useCustomToken(customAddress);

  const nativeToken = useMemo<TransferToken>(
    () => ({
      kind: 'native',
      address: undefined,
      symbol: NETWORK.nativeCurrency.symbol,
      decimals: NETWORK.nativeCurrency.decimals,
    }),
    [],
  );

  const communityTokens = useMemo(
    () => swapCatalog.communityTokens.map(toTransferToken),
    [swapCatalog.communityTokens],
  );
  const searchResults = useMemo(
    () => swapCatalog.searchResults.map(toTransferToken),
    [swapCatalog.searchResults],
  );

  return {
    nativeToken,
    communityTokens,
    wrappedToken,
    lpToken,
    searchResults,
    searchStatus: swapCatalog.searchStatus,
    search: swapCatalog.search,
    setSearch: swapCatalog.setSearch,
    hasMore: swapCatalog.hasMore,
    loadMore: swapCatalog.loadMore,
    isLoading: swapCatalog.isLoading || metadata.isLoading,
    custom,
    addCustomToken: (address) => {
      setCustomAddress(address.trim());
    },
    clearCustomToken: () => setCustomAddress(undefined),
  };
}
