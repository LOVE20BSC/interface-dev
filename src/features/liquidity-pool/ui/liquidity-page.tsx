import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import {
  DEFAULT_SLIPPAGE_PERCENT,
  isSlippageValid,
  MAX_SLIPPAGE_PERCENT,
  MIN_SLIPPAGE_PERCENT,
} from '@/features/liquidity-pool/lib/liquidity-form';
import type { LiquidityToken } from '@/features/liquidity-pool/lib/liquidity-types';
import { useLiquidityCatalog } from '@/features/liquidity-pool/model/use-liquidity-catalog';
import { usePoolState } from '@/features/liquidity-pool/model/use-pool-state';
import { AddLiquidityPanel } from '@/features/liquidity-pool/ui/add-liquidity-panel';
import { LiquidityTokenBar } from '@/features/liquidity-pool/ui/liquidity-token-bar';
import { MyLiquidityPanel } from '@/features/liquidity-pool/ui/my-liquidity-panel';
import { PoolQueryPanel } from '@/features/liquidity-pool/ui/pool-query-panel';

export type LiquidityTab = 'add' | 'mine' | 'query';

export interface LiquidityPageProps {
  readonly isConnected: boolean;
  readonly isWrongChain: boolean;
  readonly connectAction: ReactNode;
}

const TABS: readonly LiquidityTab[] = ['add', 'mine', 'query'];

function StateCard({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {children}
      </div>
    </Card>
  );
}

/**
 * 应用·流动性池 (owner 2026-11-14)。三块：添加 / 我的 / 社区查询。
 *
 * - 加池默认走 Hub 的一键单边（只填一侧，另一侧由合约配平）；Hub 缺失或空池时
 *   自动降级到「两侧都填」走 Router，并在页面说明区别；
 * - 我的流动性读 pair 的 `balanceOf`/`totalSupply`，按比例撤出；
 * - 社区查询只读储备与总供应，没有池子时明确说「这个代币还没有流动性池」。
 *
 * 页面只选一个社区代币：换 token 就是换池子，三块共用同一份 `token`/`pool` 状态。
 */
export function LiquidityPage({ isConnected, isWrongChain, connectAction }: LiquidityPageProps) {
  const router = configuredAddress('router');
  const factory = configuredAddress('factory');
  const hub = configuredAddress('hub');
  const { address: account } = useAccount();
  const { symbol } = useCommunityContext();
  const community = useCommunityToken(symbol);

  const catalog = useLiquidityCatalog();
  const wrappedAddress = catalog.wrappedToken?.address ?? configuredAddress('weth');

  const [tab, setTab] = useState<LiquidityTab>('add');
  const [customToken, setCustomToken] = useState<LiquidityToken | undefined>(undefined);
  const [slippagePercent, setSlippagePercent] = useState(DEFAULT_SLIPPAGE_PERCENT);
  const [customSlippage, setCustomSlippage] = useState(String(DEFAULT_SLIPPAGE_PERCENT));
  const [customSlippageError, setCustomSlippageError] = useState<string | undefined>(undefined);

  // 自定义地址解析成功后接管选择：地址输入就是「换到另一个池子」。
  /* eslint-disable react-hooks/set-state-in-effect -- resolved custom token is external chain data */
  useEffect(() => {
    if (catalog.custom.token !== undefined) setCustomToken(catalog.custom.token);
  }, [catalog.custom.token]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const communityToken = useMemo((): LiquidityToken | undefined => {
    if (
      community.status !== 'ready' ||
      community.address === undefined ||
      community.decimals === undefined
    ) {
      return undefined;
    }
    return {
      kind: 'community',
      address: community.address,
      symbol: community.symbol,
      decimals: community.decimals,
    };
  }, [community.address, community.decimals, community.status, community.symbol]);

  const token = customToken ?? communityToken ?? catalog.communityTokens[0];
  const native = catalog.nativeToken;

  const pool = usePoolState({
    tokenAddress: token?.address,
    nativeAddress: wrappedAddress,
    account,
    enabled: token?.address !== undefined && wrappedAddress !== undefined,
  });

  const handleSelectPreset = (percent: number) => {
    setSlippagePercent(percent);
    setCustomSlippage(String(percent));
    setCustomSlippageError(undefined);
  };
  const handleCustomSlippage = (value: string) => {
    setCustomSlippage(value);
    const parsed = Number.parseFloat(value);
    if (!isSlippageValid(parsed)) {
      setCustomSlippageError(
        `${copy.liquidity.settings.rangeError}（${MIN_SLIPPAGE_PERCENT}%–${MAX_SLIPPAGE_PERCENT}%）`,
      );
      return;
    }
    setCustomSlippageError(undefined);
    setSlippagePercent(parsed);
  };

  if (router === undefined || factory === undefined || wrappedAddress === undefined) {
    return (
      <StateCard
        title={copy.liquidity.states.unconfiguredTitle}
        description={copy.liquidity.states.unconfiguredBody}
      >
        <Link to="/" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
          {copy.liquidity.states.backHome}
        </Link>
      </StateCard>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted">{copy.liquidity.intro}</p>

      <div
        role="tablist"
        aria-label={copy.liquidity.tabs.add}
        className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-elevated p-1 text-xs"
      >
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            data-testid={`liquidity-tab-${value}`}
            onClick={() => setTab(value)}
            className={cn(
              'rounded-xl px-2 py-2 font-medium transition-colors',
              tab === value
                ? 'bg-surface text-brand-strong shadow-soft'
                : 'text-muted hover:text-foreground',
            )}
          >
            {copy.liquidity.tabs[value]}
          </button>
        ))}
      </div>

      {token !== undefined ? (
        <LiquidityTokenBar catalog={catalog} selected={token} onSelect={setCustomToken} />
      ) : null}

      {token === undefined ? (
        <StateCard
          title={copy.liquidity.states.readFailed}
          description={copy.liquidity.add.quoteErrorBody}
        >
          <button
            type="button"
            className={buttonStyles('secondary', 'md')}
            onClick={() => catalog.custom.retry()}
          >
            {copy.liquidity.states.retry}
          </button>
        </StateCard>
      ) : tab === 'add' ? (
        !isConnected ? (
          <StateCard
            title={copy.liquidity.states.connectTitle}
            description={copy.liquidity.states.connectBody}
          >
            {connectAction}
          </StateCard>
        ) : isWrongChain ? (
          <StateCard
            title={copy.liquidity.states.wrongChainTitle}
            description={copy.liquidity.states.wrongChainBody}
          >
            {connectAction}
          </StateCard>
        ) : (
          <AddLiquidityPanel
            token={token}
            wrapped={catalog.wrappedToken}
            native={native}
            pool={pool}
            slippagePercent={slippagePercent}
            customSlippage={customSlippage}
            customSlippageError={customSlippageError}
            onSelectSlippagePreset={handleSelectPreset}
            onCustomSlippageChange={handleCustomSlippage}
            isConnected={isConnected}
          />
        )
      ) : tab === 'mine' ? (
        !isConnected ? (
          <StateCard
            title={copy.liquidity.states.connectTitle}
            description={copy.liquidity.states.connectBody}
          >
            {connectAction}
          </StateCard>
        ) : isWrongChain ? (
          <StateCard
            title={copy.liquidity.states.wrongChainTitle}
            description={copy.liquidity.states.wrongChainBody}
          >
            {connectAction}
          </StateCard>
        ) : (
          <MyLiquidityPanel
            token={token}
            native={native}
            pool={pool}
            slippagePercent={slippagePercent}
            customSlippage={customSlippage}
            customSlippageError={customSlippageError}
            onSelectSlippagePreset={handleSelectPreset}
            onCustomSlippageChange={handleCustomSlippage}
            onGoAdd={() => setTab('add')}
            isConnected={isConnected}
          />
        )
      ) : (
        <PoolQueryPanel
          token={token}
          native={native}
          pool={pool}
          onGoAdd={() => setTab('add')}
        />
      )}

      {hub === undefined ? (
        <p className="text-[11px] leading-4 text-muted">{copy.liquidity.add.hubMissing}</p>
      ) : null}
    </div>
  );
}
