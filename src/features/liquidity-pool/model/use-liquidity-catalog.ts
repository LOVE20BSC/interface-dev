import { useMemo, useState } from 'react';
import { useBytecode, useReadContracts } from 'wagmi';
import { love20TokenAbi } from '@/config/abis';
import {
  NETWORK,
  configuredAddress,
  isConfiguredAddress,
  type HexAddress,
} from '@/config/networks';
import { useSwapCatalog, type SwapTokenSearchStatus } from '@/features/swap-token/model/use-swap-catalog';
import { useWrappedNative } from '@/features/swap-token/model/use-wrapped-native';
import type { LiquidityToken } from '@/features/liquidity-pool/lib/liquidity-types';

/**
 * 流动性池的 token 宇宙：社区代币来自 Launch 目录（与兑换页同一份链上注册表），
 * 自定义代币按 `symbol()`/`decimals()` 现场校验，包装原生币来自 Router.WETH()。
 * 本 hook 只读元数据，不读余额、不写链。
 */

export type CustomTokenStatus = 'idle' | 'invalid' | 'checking' | 'no-code' | 'unreadable' | 'ok';

export interface CustomTokenState {
  readonly status: CustomTokenStatus;
  readonly token: LiquidityToken | undefined;
  readonly retry: () => void;
}

export interface LiquidityCatalog {
  readonly nativeToken: LiquidityToken;
  readonly wrappedToken: LiquidityToken | undefined;
  readonly communityTokens: readonly LiquidityToken[];
  readonly searchResults: readonly LiquidityToken[];
  readonly searchStatus: SwapTokenSearchStatus;
  readonly search: string;
  readonly setSearch: (value: string) => void;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly isLoading: boolean;
  readonly custom: CustomTokenState;
  readonly addCustomToken: (address: string) => void;
  readonly clearCustomToken: () => void;
  readonly customInput: string;
  readonly setCustomInput: (value: string) => void;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function toLiquidityToken(token: {
  readonly address: HexAddress | undefined;
  readonly symbol: string;
  readonly decimals: number | undefined;
}): LiquidityToken | undefined {
  // 精度读不到就不把 token 放进可选列表：加池的数量与最少额都按精度换算，
  // 猜一个 18 会让用户看到错误的数量。
  if (token.decimals === undefined) return undefined;
  return {
    kind: 'community',
    address: token.address,
    symbol: token.symbol,
    decimals: token.decimals,
  };
}

function mapTokens(tokens: readonly {
  readonly address: HexAddress | undefined;
  readonly symbol: string;
  readonly decimals: number | undefined;
}[]): LiquidityToken[] {
  return tokens.flatMap((token) => {
    const mapped = toLiquidityToken(token);
    return mapped === undefined ? [] : [mapped];
  });
}

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
  const metadata = useReadContracts({ contracts, query: { enabled: address !== undefined } });

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

  const status: CustomTokenStatus = (() => {
    if (address === undefined) return 'idle';
    if (code.isLoading) return 'checking';
    if (code.isError) return 'unreadable';
    if (code.data === undefined || code.data === '0x') return 'no-code';
    if (symbol !== undefined && decimals !== undefined) return 'ok';
    if (metadata.isLoading) return 'checking';
    if (metadata.isError) return 'unreadable';
    return 'unreadable';
  })();

  // 自定义代币对象必须稳定：页面把它当 effect 依赖，每次渲染新建对象会让
  // setState 触发下一次渲染，形成无限循环（选自定义代币后页面卡死）。
  const token = useMemo((): LiquidityToken | undefined => {
    if (status !== 'ok' || address === undefined || symbol === undefined || decimals === undefined) {
      return undefined;
    }
    return { kind: 'custom', address, symbol, decimals };
  }, [address, decimals, status, symbol]);

  return {
    status,
    token,
    retry: () => {
      void code.refetch();
      void metadata.refetch();
    },
  };
}

export function useLiquidityCatalog(): LiquidityCatalog {
  const wrapped = useWrappedNative();
  const catalog = useSwapCatalog(configuredAddress('launch'));

  const [customInput, setCustomInput] = useState('');
  const [customCandidate, setCustomCandidate] = useState<string | undefined>(undefined);
  const custom = useCustomToken(customCandidate);

  const nativeToken = useMemo(
    (): LiquidityToken => ({
      kind: 'native',
      address: undefined,
      symbol: NETWORK.nativeCurrency.symbol,
      decimals: NETWORK.nativeCurrency.decimals,
    }),
    [],
  );

  const wrappedToken = useMemo((): LiquidityToken | undefined => {
    if (wrapped.address === undefined || wrapped.symbol === undefined || wrapped.decimals === undefined) {
      return undefined;
    }
    return { kind: 'wrapped', address: wrapped.address, symbol: wrapped.symbol, decimals: wrapped.decimals };
  }, [wrapped.address, wrapped.decimals, wrapped.symbol]);

  return {
    nativeToken,
    wrappedToken,
    communityTokens: mapTokens(catalog.communityTokens),
    searchResults: mapTokens(catalog.searchResults),
    searchStatus: catalog.searchStatus,
    search: catalog.search,
    setSearch: catalog.setSearch,
    hasMore: catalog.hasMore,
    loadMore: catalog.loadMore,
    isLoading: catalog.isLoading || wrapped.isLoading,
    custom,
    addCustomToken: (address: string) => {
      const trimmed = address.trim();
      if (!ADDRESS_RE.test(trimmed)) {
        setCustomCandidate(undefined);
        setCustomInput(trimmed);
        return;
      }
      setCustomInput(trimmed);
      setCustomCandidate(trimmed);
    },
    clearCustomToken: () => {
      setCustomCandidate(undefined);
      setCustomInput('');
    },
    customInput,
    setCustomInput,
  };
}
