import { useMemo, useState } from 'react';
import { useReadContracts } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import { NETWORK, configuredAddress, type HexAddress } from '@/config/networks';
import { useCustomToken as useCustomTokenLookup } from '@/entities/community-token/model/use-custom-token';
import {
  useSwapCatalog,
  type SwapTokenSearchStatus,
} from '@/features/swap-token/model/use-swap-catalog';
import type { SwapToken } from '@/features/swap-token/lib/swap-types';
import {
  transferCustomTokenStatus,
  type CustomTokenStatus,
} from '@/features/transfer-token/lib/custom-token-state';
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
  /** Community directory (Launch registry) is still reading its first page. */
  readonly communityLoading: boolean;
  /** Community directory read failed — the chain itself is unreachable. */
  readonly communityError: boolean;
  /** Re-read the community directory and the wrapped/LP metadata. */
  readonly refetch: () => void;
  readonly custom: CustomTokenState;
  readonly addCustomToken: (address: string) => void;
  readonly clearCustomToken: () => void;
}

function useCustomToken(candidate: string | undefined): CustomTokenState {
  // 判定来自 `entities/community-token`（候选 A）：零地址一律「没有合约」、
  // 精度读不到一律不给结论。转账页把「格式不对」叫作 invalid（输入框自己不做
  // 格式拦截），加池页叫 idle（输入框有自己的格式提示）。
  const lookup = useCustomTokenLookup(candidate);
  const status = transferCustomTokenStatus(lookup.status);
  const token = useMemo((): TransferToken | undefined => {
    if (lookup.status !== 'ok' || lookup.address === undefined) return undefined;
    if (lookup.symbol === undefined || lookup.decimals === undefined) return undefined;
    return {
      kind: 'custom',
      address: lookup.address,
      symbol: lookup.symbol,
      decimals: lookup.decimals,
    };
  }, [lookup.address, lookup.decimals, lookup.status, lookup.symbol]);
  return { status, token, address: lookup.address, retry: lookup.retry };
}

/** 精度读不到就不放进可选列表（owner 2026-11-26 拍）：转账金额按精度换算，
 * 猜一个 18 会让用户看到错误的数量——与加池页同一口径。 */
function toTransferToken(token: SwapToken): TransferToken | undefined {
  if (token.decimals === undefined) return undefined;
  return {
    kind: 'community',
    address: token.address,
    symbol: token.symbol,
    decimals: token.decimals,
  };
}

function mapTransferTokens(tokens: readonly SwapToken[]): TransferToken[] {
  return tokens.flatMap((token) => {
    const mapped = toTransferToken(token);
    return mapped === undefined ? [] : [mapped];
  });
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
    () => mapTransferTokens(swapCatalog.communityTokens),
    [swapCatalog.communityTokens],
  );
  const searchResults = useMemo(
    () => mapTransferTokens(swapCatalog.searchResults),
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
    communityLoading: swapCatalog.isLoading,
    communityError: swapCatalog.isError,
    refetch: () => {
      swapCatalog.refetch();
      void metadata.refetch();
    },
    custom,
    addCustomToken: (address) => {
      setCustomAddress(address.trim());
    },
    clearCustomToken: () => setCustomAddress(undefined),
  };
}
