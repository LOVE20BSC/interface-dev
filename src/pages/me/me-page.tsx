import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BUILD_ID } from '@/config/build-id.generated';
import { APP_ENV } from '@/config/env';
import { BRAND_DOCS_URL, NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { CopyableAddress } from '@/shared/ui/copyable-address';
import { formatBuildId, formatTokenAmount } from '@/shared/lib/format';
import { variantLabel } from '@/shared/lib/variant-label';
import { useCommunityBalance } from '@/entities/community-token/model/use-community-balance';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';

const TEXT_LINK =
  'inline-flex items-center text-sm font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

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

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-foreground">{children}</dd>
    </div>
  );
}

/**
 * 我的 (UX spec §3.7): balance + account/about, a settings-ish list. The
 * identity NFT card moved out (owner 2026-11-14) — `/my-nft` owns identity
 * management; only text links remain here, so the page never spends the
 * one-filled-button rule.
 */
export function MePage() {
  const { search } = useLocation();
  const wallet = useWalletConnection();
  const { symbol } = useCommunityContext();
  const token = useCommunityToken(symbol);
  const balance = useCommunityBalance(token.address, token.decimals);

  const to = (pathname: string) => ({ pathname, search }) as const;
  const amountText =
    balance.status === 'ready' && balance.value !== undefined
      ? `${formatTokenAmount(balance.value, balance.decimals)} ${token.symbol}`
      : undefined;

  return (
    <div className="space-y-4">
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

      <Section id="me-account-title" title={copy.me.accountTitle}>
        <dl className="mt-1 divide-y divide-line">
          <Row label={copy.me.walletLabel}>
            {wallet.address === undefined ? (
              copy.me.walletNotConnected
            ) : (
              <CopyableAddress
                address={wallet.address}
                label={copy.me.walletLabel}
                className="text-foreground"
              />
            )}
          </Row>
          <Row label={copy.me.networkLabel}>
            {copy.me.networkValue(NETWORK.name, NETWORK.chainId)}
          </Row>
        </dl>
      </Section>

      <Section id="me-about-title" title={copy.me.aboutTitle}>
        <dl className="mt-1 divide-y divide-line">
          <Row label={copy.me.versionLabel}>
            {copy.me.versionValue(formatBuildId(BUILD_ID), variantLabel(APP_ENV.variant))}
          </Row>
          <div className="flex items-center justify-between gap-3 py-2 text-sm">
            <dt className="shrink-0 text-muted">{copy.me.docs}</dt>
            <dd className="min-w-0">
              <a
                href={BRAND_DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-brand-strong underline-offset-4 hover:underline"
              >
                {copy.home.docs}
              </a>
            </dd>
          </div>
        </dl>
      </Section>
    </div>
  );
}
