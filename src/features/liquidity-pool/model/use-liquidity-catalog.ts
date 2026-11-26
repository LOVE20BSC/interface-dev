import { useMemo, useState } from 'react';
import { NETWORK, configuredAddress, type HexAddress } from '@/config/networks';
import {
  TOKEN_ADDRESS_RE,
  useCustomToken as useCustomTokenLookup,
} from '@/entities/community-token/model/use-custom-token';
import {
  useSwapCatalog,
  type SwapTokenSearchStatus,
} from '@/features/swap-token/model/use-swap-catalog';
import { useWrappedNative } from '@/features/swap-token/model/use-wrapped-native';
import type { LiquidityToken } from '@/features/liquidity-pool/lib/liquidity-types';

/**
 * 流动性池的 token 宇宙：社区代币来自 Launch 目录（与兑换页同一份链上注册表），
 * 自定义代币按 `symbol()`/`decimals()` 现场校验，包装原生币来自 Router.WETH()。
 * 本 hook 只读元数据，不读余额、不写链。
 */

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

function toLiquidityToken(token: {
  readonly address: HexAddress | undefined;
  readonly symbol: string;
  readonly decimals: number | undefined;
}): LiquidityToken | undefined {
  // 精度读不到就不把 token 放进可选列表：加池的数量与最少额都按精度换算，
  // 猜一个 18 会让用户看到错误的数量（硬规则 4 的同一条思路）。
  if (token.decimals === undefined) return undefined;
  return {
    kind: 'community',
    address: token.address,
    symbol: token.symbol,
    decimals: token.decimals,
  };
}

function mapTokens(
  tokens: readonly {
    readonly address: HexAddress | undefined;
    readonly symbol: string;
    readonly decimals: number | undefined;
  }[],
): LiquidityToken[] {
  return tokens.flatMap((token) => {
    const mapped = toLiquidityToken(token);
    return mapped === undefined ? [] : [mapped];
  });
}

/** 加池页的对外状态：格式不对交给输入框自己的格式提示，因此 `malformed` 落 `idle`。 */
export type CustomTokenStatus = 'idle' | 'invalid' | 'checking' | 'no-code' | 'unreadable' | 'ok';

export interface CustomTokenState {
  readonly status: CustomTokenStatus;
  readonly token: LiquidityToken | undefined;
  readonly retry: () => void;
}

function useCustomToken(candidate: string | undefined): CustomTokenState {
  // 判定来自 `entities/community-token`（候选 A）：零地址 → no-code、精度读不到 → 不是 ok。
  const lookup = useCustomTokenLookup(candidate);
  const status: CustomTokenStatus =
    lookup.status === 'empty' || lookup.status === 'malformed' ? 'idle' : lookup.status;
  // 自定义代币对象必须稳定：页面把它当 effect 依赖，每次渲染新建对象会形成无限循环。
  const token = useMemo((): LiquidityToken | undefined => {
    if (lookup.status !== 'ok' || lookup.address === undefined) return undefined;
    if (lookup.symbol === undefined || lookup.decimals === undefined) return undefined;
    return {
      kind: 'custom',
      address: lookup.address,
      symbol: lookup.symbol,
      decimals: lookup.decimals,
    };
  }, [lookup.address, lookup.decimals, lookup.status, lookup.symbol]);
  return { status, token, retry: lookup.retry };
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
    if (
      wrapped.address === undefined ||
      wrapped.symbol === undefined ||
      wrapped.decimals === undefined
    ) {
      return undefined;
    }
    return {
      kind: 'wrapped',
      address: wrapped.address,
      symbol: wrapped.symbol,
      decimals: wrapped.decimals,
    };
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
      if (!TOKEN_ADDRESS_RE.test(trimmed)) {
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
