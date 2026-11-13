import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BUILD_ID } from '@/config/build-id.generated';
import { APP_ENV } from '@/config/env';
import { ADDRESSES, BRAND_DOCS_URL, DEPLOYMENT, NETWORK } from '@/config/networks';
import {
  resolveAboutAddressGroups,
  type AboutAddressKey,
  type AboutAddressRow,
} from '@/domain/about-addresses';
import { copy } from '@/shared/config/copy-pages';
import { cn } from '@/shared/lib/cn';
import { copyText } from '@/shared/lib/clipboard';
import { formatBuildId } from '@/shared/lib/format';
import { variantLabel } from '@/shared/lib/variant-label';
import { ArrowUpLeft, BookOpen, Check, Copy } from '@/shared/ui/icons';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  formatDeploymentBlock,
  formatIntegerSupply,
  formatPhaseValue,
  formatPoolBalance,
  formatRpcUrls,
  formatSupplyWithSymbol,
} from '@/pages/about/about-format';
import { useAboutChainData, type AboutValue } from '@/pages/about/use-about-data';

type AboutTab = 'contracts' | 'data';

const TAB_ORDER: readonly AboutTab[] = ['contracts', 'data'];

const TEXT_LINK =
  'inline-flex items-center gap-1.5 text-sm font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

function Intro() {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm leading-6 text-foreground">{copy.about.intro}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href={BRAND_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          data-testid="about-docs-link"
          className={TEXT_LINK}
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          {copy.about.docsLink}
        </a>
        <span className="text-xs leading-5 text-muted">{copy.about.docsNote}</span>
      </div>
    </section>
  );
}

function Tabs({
  active,
  onChange,
  id,
}: {
  readonly active: AboutTab;
  readonly onChange: (tab: AboutTab) => void;
  readonly id: string;
}) {
  const refs = useRef<Record<AboutTab, HTMLButtonElement | null>>({
    contracts: null,
    data: null,
  });

  const select = (tab: AboutTab) => {
    onChange(tab);
    refs.current[tab]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TAB_ORDER.indexOf(active);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      select(TAB_ORDER[(index + 1) % TAB_ORDER.length] ?? 'contracts');
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      select(TAB_ORDER[(index - 1 + TAB_ORDER.length) % TAB_ORDER.length] ?? 'contracts');
    } else if (event.key === 'Home') {
      event.preventDefault();
      select('contracts');
    } else if (event.key === 'End') {
      event.preventDefault();
      select('data');
    }
  };

  return (
    <div
      role="tablist"
      aria-label={copy.about.tabsLabel}
      className="flex gap-1 border-b border-line"
    >
      {TAB_ORDER.map((tab) => {
        const selected = active === tab;
        return (
          <button
            key={tab}
            ref={(node) => {
              refs.current[tab] = node;
            }}
            type="button"
            role="tab"
            id={`${id}-${tab}-tab`}
            aria-selected={selected}
            aria-controls={`${id}-${tab}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(tab)}
            onKeyDown={onKeyDown}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
              selected
                ? 'border-brand text-brand-strong'
                : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {copy.about.tabs[tab]}
          </button>
        );
      })}
    </div>
  );
}

function ChainInfoRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-2 text-sm">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-[11px] leading-5 text-foreground">
        {children}
      </dd>
    </div>
  );
}

function AddressRow({
  row,
  copied,
  onCopy,
}: {
  readonly row: AboutAddressRow;
  readonly copied: boolean;
  readonly onCopy: (row: AboutAddressRow) => void;
}) {
  const label = copy.about.addresses.labels[row.key];

  return (
    <li className="py-2.5" data-testid={`about-address-${row.key}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        {row.address !== undefined ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onCopy(row)}
              aria-label={copy.about.addresses.copyAddress(label)}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-muted hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span aria-live="polite">
                {copied ? copy.about.addresses.copied : copy.common.copy}
              </span>
            </button>
            {row.explorerUrl !== null ? (
              <a
                href={row.explorerUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={copy.about.addresses.explorer(label)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ArrowUpLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
      <p
        className={cn(
          'mt-1 break-all font-mono text-[11px] leading-5',
          row.address !== undefined ? 'text-foreground' : 'font-sans text-muted',
        )}
      >
        {row.address ?? copy.about.addresses.notConfigured}
      </p>
    </li>
  );
}

function AddressesPanel() {
  const groups = resolveAboutAddressGroups(ADDRESSES, NETWORK.blockExplorerUrl);
  const [copiedKey, setCopiedKey] = useState<AboutAddressKey | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, []);

  const onCopy = (row: AboutAddressRow) => {
    if (row.address === undefined) return;
    void copyText(row.address).then((ok) => {
      if (!ok) return;
      setCopiedKey(row.key);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  return (
    <div className="space-y-5">
      <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-4 py-1">
        <ChainInfoRow label={copy.about.addresses.chainId}>{NETWORK.chainId}</ChainInfoRow>
        <ChainInfoRow label={copy.about.addresses.rpc}>
          {formatRpcUrls(NETWORK.rpcUrls)
            .split('\n')
            .map((url) => (
              <span key={url} className="block">
                {url}
              </span>
            ))}
        </ChainInfoRow>
      </dl>

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`about-group-${group.key}`}>
          <h3 id={`about-group-${group.key}`} className="px-1 text-xs font-semibold text-muted">
            {copy.about.addresses.groups[group.key]}
          </h3>
          <ul className="mt-1 divide-y divide-line rounded-2xl border border-line bg-surface px-4">
            {group.rows.map((row) => (
              <AddressRow key={row.key} row={row} copied={copiedKey === row.key} onCopy={onCopy} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function renderValue<T>(state: AboutValue<T>, render: (value: T) => ReactNode): ReactNode {
  if (state.status === 'unconfigured') {
    return <span className="font-sans text-muted">{copy.about.data.notConfigured}</span>;
  }
  if (state.status === 'loading') {
    return <Skeleton className="h-4 w-20" />;
  }
  if (state.status === 'error' || state.value === undefined) {
    return <span className="text-muted">{copy.common.unknown}</span>;
  }
  return render(state.value);
}

function DataRow({
  label,
  children,
  valueTestId,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly valueTestId?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 text-sm">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd
        className="min-w-0 break-all text-right font-mono text-[11px] leading-5 text-foreground"
        {...(valueTestId !== undefined ? { 'data-testid': valueTestId } : {})}
      >
        {children}
      </dd>
    </div>
  );
}

function DataPanel({ symbol }: { readonly symbol: string }) {
  const data = useAboutChainData(symbol);

  return (
    <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-4 py-1">
      <DataRow label={copy.about.data.chainId}>{NETWORK.chainId}</DataRow>
      <DataRow label={copy.about.data.rpc}>
        {formatRpcUrls(NETWORK.rpcUrls)
          .split('\n')
          .map((url) => (
            <span key={url} className="block">
              {url}
            </span>
          ))}
      </DataRow>
      <DataRow label={copy.about.data.deploymentBlock}>
        {formatDeploymentBlock(DEPLOYMENT.deployment.blockNumber)}
      </DataRow>
      <DataRow label={copy.about.data.communityToken}>
        {renderValue(data.communitySymbol, (value) => value)}
      </DataRow>
      <DataRow label={copy.about.data.communitySupply} valueTestId="about-community-total-supply">
        {renderValue(data.communitySupply, (value) =>
          data.communityDecimals === undefined ? (
            <span className="text-muted">{copy.common.unknown}</span>
          ) : (
            formatSupplyWithSymbol(value, data.communityDecimals, data.communitySymbol.value)
          ),
        )}
      </DataRow>
      <DataRow label={copy.about.data.memberNftSupply} valueTestId="about-member-nft-total-supply">
        {renderValue(data.memberNftSupply, (value) => formatIntegerSupply(value))}
      </DataRow>
      <DataRow label={copy.about.data.airdropPool} valueTestId="about-airdrop-pool-balance">
        {renderValue(data.airdropPool, (value) =>
          data.airdropDecimals === undefined ? (
            <span className="text-muted">{copy.common.unknown}</span>
          ) : (
            formatPoolBalance(value, data.airdropDecimals, data.airdropSymbol)
          ),
        )}
      </DataRow>
      <DataRow label={copy.about.data.phase} valueTestId="about-current-phase">
        {renderValue(data.phase, (value) => formatPhaseValue(value))}
      </DataRow>
      <DataRow label={copy.about.data.appVersion}>{variantLabel(APP_ENV.variant)}</DataRow>
      <DataRow label={copy.about.data.buildNumber}>{formatBuildId(BUILD_ID)}</DataRow>
    </dl>
  );
}

/**
 * 关于 (documentation + debugging surface).
 *
 * Two accessible tabs (manual roving tabindex, Arrow/Home/End keyboard support):
 * 合约地址 lists every address-book slot, including 未配置 zeros, and 数据 reads
 * a small, read-only set of chain values with skeletons and honest `—`.
 */
export function AboutPage() {
  const [active, setActive] = useState<AboutTab>('contracts');
  const { search } = useLocation();
  const symbol = new URLSearchParams(search).get('symbol') ?? '';
  const id = useId();

  return (
    <div className="space-y-4">
      <Intro />
      <section className="rounded-2xl border border-line bg-surface px-4 pb-4 pt-1">
        <Tabs active={active} onChange={setActive} id={id} />
        <div
          role="tabpanel"
          id={`${id}-contracts-panel`}
          aria-labelledby={`${id}-contracts-tab`}
          hidden={active !== 'contracts'}
          tabIndex={0}
          className="pt-4 focus-visible:outline-none"
        >
          <AddressesPanel />
        </div>
        <div
          role="tabpanel"
          id={`${id}-data-panel`}
          aria-labelledby={`${id}-data-tab`}
          hidden={active !== 'data'}
          tabIndex={0}
          className="pt-4 focus-visible:outline-none"
        >
          {active === 'data' ? <DataPanel symbol={symbol} /> : null}
        </div>
      </section>
    </div>
  );
}
