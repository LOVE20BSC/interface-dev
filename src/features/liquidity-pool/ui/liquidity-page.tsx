import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { Button, buttonStyles } from '@/shared/ui/button';
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
  testId,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly testId?: string;
}) {
  return (
    <Card {...(testId !== undefined ? { 'data-testid': testId } : {})}>
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
  /** 切社区时要清自定义代币；两个 ref 让 effect 只依赖 symbol（回调每次渲染都会变）。 */
  const clearCustomRef = useRef(catalog.clearCustomToken);
  const symbolRef = useRef(symbol);

  useEffect(() => {
    clearCustomRef.current = catalog.clearCustomToken;
  });

  // 自定义地址解析成功后接管选择：地址输入就是「换到另一个池子」。
  /* eslint-disable react-hooks/set-state-in-effect -- resolved custom token is external chain data */
  useEffect(() => {
    if (catalog.custom.token !== undefined) setCustomToken(catalog.custom.token);
  }, [catalog.custom.token]);

  // QA D5（P2）：右上角切社区后，之前选的「自定义代币」不能继续覆盖新社区——否则
  // URL 已经是新社区、页面还是旧代币的池子，而且页内没有清除入口。symbol 一变就
  // 清掉自定义选择（地址输入框一起清空），页面跟随社区。
  useEffect(() => {
    if (symbolRef.current === symbol) return;
    symbolRef.current = symbol;
    setCustomToken(undefined);
    clearCustomRef.current();
  }, [symbol]);
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

  /**
   * QA D4（P2）：只有社区还在解析（首屏占位）时才用目录第一个代币当占位；社区解析
   * 完成但读不到（unknown / error）时不能拿 TestLOVE20 顶替，要显示「读不到这个社区」。
   */
  const token =
    customToken ??
    communityToken ??
    (community.status === 'loading' ? catalog.communityTokens[0] : undefined);
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
        <LiquidityTokenBar catalog={catalog} selected={token} />
      ) : null}

      {token === undefined ? (
        community.status === 'unknown' || community.status === 'error' ? (
          <StateCard
            testId="liquidity-community-unknown"
            title={copy.liquidity.states.communityUnknownTitle}
            description={copy.liquidity.states.communityUnknownBody}
          >
            <Button
              variant="secondary"
              size="md"
              data-testid="liquidity-community-retry"
              onClick={() => community.refetch()}
            >
              {copy.liquidity.states.retry}
            </Button>
          </StateCard>
        ) : (
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
        )
      ) : !isConnected || isWrongChain ? (
        tab === 'query' ? (
          <PoolQueryPanel token={token} native={native} pool={pool} onGoAdd={() => setTab('add')} />
        ) : (
          <StateCard
            title={
              isWrongChain
                ? copy.liquidity.states.wrongChainTitle
                : copy.liquidity.states.connectTitle
            }
            description={
              isWrongChain
                ? copy.liquidity.states.wrongChainBody
                : copy.liquidity.states.connectBody
            }
          >
            {connectAction}
          </StateCard>
        )
      ) : (
        /* QA D10（P3）：三个页签的面板常驻（非活动页签用 hidden 隐藏），页签来回切换
           不再清空已填金额、展开的详情与智能模式状态；写链状态也只在面板内保留。 */
        <>
          <div hidden={tab !== 'add'}>
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
          </div>
          <div hidden={tab !== 'mine'}>
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
          </div>
          <div hidden={tab !== 'query'}>
            <PoolQueryPanel
              token={token}
              native={native}
              pool={pool}
              onGoAdd={() => setTab('add')}
            />
          </div>
        </>
      )}

      {hub === undefined ? (
        <p className="text-[11px] leading-4 text-muted">{copy.liquidity.add.hubMissing}</p>
      ) : null}
    </div>
  );
}
