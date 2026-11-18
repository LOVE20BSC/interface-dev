import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { formatTokenAmount } from '@/shared/lib/format';
import { useCommunityBalance } from '@/entities/community-token/model/use-community-balance';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { StakeAssetsPanel } from '@/pages/me/stake-assets-panel';

type MeTab = 'balance' | 'stake';

const TEXT_LINK =
  'inline-flex items-center text-sm font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong';

function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-line bg-surface px-4 py-4">
      <h2 id={id} className="text-sm font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * 我的 (UX spec §3.7): balance + account/about, a settings-ish list. The
 * identity NFT card moved out (owner 2026-11-14) — `/my-nft` owns identity
 * management; only text links remain here, so the page never spends the
 * one-filled-button rule.
 *
 * owner 2026-11-18 23:20：页面加两个标签「钱包余额」「质押资产」；治理域原来的
 * 「我的流动性质押」卡从 `/gov` 挪到「质押资产」下（只在切到该标签时挂载）。
 * owner 2026-11-19：原「账户」与「关于」两个 section 移除——钱包地址 / 网络挪进
 * 右上角钱包下拉菜单，版本与开源文档入口归 `/about`。
 */
export function MePage() {
  const { search } = useLocation();
  const { symbol } = useCommunityContext();
  const token = useCommunityToken(symbol);
  const balance = useCommunityBalance(token.address, token.decimals);
  const [tab, setTab] = useState<MeTab>('balance');

  const to = (pathname: string) => ({ pathname, search }) as const;
  const amountText =
    balance.status === 'ready' && balance.value !== undefined
      ? `${formatTokenAmount(balance.value, balance.decimals)} ${token.symbol}`
      : undefined;

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label={copy.me.tabsAria}
        className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-elevated p-1 text-xs"
      >
        {(['balance', 'stake'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            data-testid={`me-tab-${value}`}
            onClick={() => setTab(value)}
            className={cn(
              'rounded-xl px-2 py-2 font-medium transition-colors',
              tab === value
                ? 'bg-surface text-brand-strong shadow-soft'
                : 'text-muted hover:text-foreground',
            )}
          >
            {copy.me.tabs[value]}
          </button>
        ))}
      </div>

      {tab === 'balance' ? (
        <Section id="me-balance-title" title={copy.me.balanceTitle}>
          {token.address === undefined ? (
            <p className="mt-2 text-sm leading-6 text-muted">{copy.me.balanceUnavailable}</p>
          ) : (
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate font-mono text-lg font-semibold text-foreground">
                {amountText ?? copy.common.unknown}
              </p>
              <Link to={to('/swap')} className={TEXT_LINK}>
                {copy.me.swap}
              </Link>
            </div>
          )}
        </Section>
      ) : (
        <StakeAssetsPanel />
      )}
    </div>
  );
}
