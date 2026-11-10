import { ArrowRight, RefreshCw } from '@/shared/ui/icons';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BUILD_ID } from '@/config/build-id.generated';
import { APP_ENV } from '@/config/env';
import { DEFAULT_SYMBOL, NETWORK, addressBookStatus, configuredAddress } from '@/config/networks';
import { variantLabel } from '@/config/variant';
import { copy } from '@/shared/config/copy';
import { formatBuildId, formatPhase } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { useCurrentPhase } from '@/entities/phase/model/use-current-phase';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { IdentityWelcome } from '@/features/select-identity/ui/identity-welcome';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';

const QUICK_ACTIONS = [
  { key: 'myNft', to: '/my-nft', ...copy.home.cards.myNft },
  { key: 'mint', to: '/mint', ...copy.home.cards.mint },
  { key: 'airdrop', to: '/airdrop', ...copy.home.cards.airdrop },
  { key: 'swap', to: '/swap', ...copy.home.cards.swap },
] as const;

export function HomePage() {
  const { symbol, switchSymbol } = useCommunityContext();
  const token = useCommunityToken(symbol);
  const identity = useMemberIdentity();
  const phase = useCurrentPhase();
  const book = addressBookStatus();

  useEffect(() => {
    document.title =
      token.name === copy.brand.wordmark
        ? copy.brand.wordmark
        : `${token.name} · ${copy.brand.wordmark}`;
  }, [token.name]);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-strong">
          {copy.home.heroKicker}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{token.name}</h1>
        <p className="mt-1 text-sm text-muted">{copy.brand.eyebrow}</p>
        <p className="mt-3 text-sm leading-6 text-foreground/90">{copy.home.heroBody}</p>
        {token.status === 'ready' && token.symbol !== token.name ? (
          <p className="mt-2 font-mono text-xs text-muted">${token.symbol}</p>
        ) : null}
      </section>

      {token.status === 'unknown' ? (
        <Card className="border-warning/30 bg-warning-soft/40">
          <CardTitle>{copy.community.unknownTitle}</CardTitle>
          <CardDescription>{copy.community.unknownDescription(symbol)}</CardDescription>
          <div className="mt-4">
            <Button onClick={() => switchSymbol(DEFAULT_SYMBOL)}>
              {copy.community.unknownAction}
            </Button>
          </div>
        </Card>
      ) : null}

      {token.status === 'error' ? (
        <Card>
          <CardTitle>{copy.community.addressLookupFailed}</CardTitle>
          <CardDescription>{copy.errors.network}</CardDescription>
          <div className="mt-4">
            <Button
              variant="secondary"
              leadingIcon={<RefreshCw className="h-4 w-4" />}
              onClick={token.refetch}
            >
              {copy.common.retry}
            </Button>
          </div>
        </Card>
      ) : null}

      <IdentityWelcome
        identity={identity}
        connectAction={<ConnectWalletButton />}
        onRetry={identity.refetch}
      />

      <section aria-labelledby="quick-actions-title">
        <div className="mb-3">
          <h2 id="quick-actions-title" className="text-sm font-semibold text-foreground">
            {copy.home.quickTitle}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">{copy.home.quickSubtitle}</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.key}
              to={action.to}
              className="group flex flex-col justify-between gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-sm transition-colors hover:border-brand/30 hover:bg-brand-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{action.title}</p>
                <p className="mt-1 text-[11px] leading-4 text-muted">{action.body}</p>
              </div>
              <ArrowRight
                className="h-4 w-4 self-end text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-strong"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="explain-title">
        <h2 id="explain-title" className="mb-3 text-sm font-semibold text-foreground">
          {copy.home.explainTitle}
        </h2>
        <div className="space-y-2.5">
          {copy.home.explainItems.map((item) => (
            <div key={item.title} className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <details className="group rounded-2xl border border-line bg-surface/70 p-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:hidden">
          <span className="inline-flex items-center gap-2">
            {copy.home.advancedSummary}
            <span className="text-xs font-normal text-muted group-open:hidden">＋</span>
            <span className="hidden text-xs font-normal text-muted group-open:inline">－</span>
          </span>
        </summary>
        <dl className="mt-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{copy.home.advancedVariant}</dt>
            <dd className="font-mono">{variantLabel(APP_ENV.variant)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{copy.home.advancedChain}</dt>
            <dd className="font-mono">{NETWORK.chainId}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{copy.home.advancedPhase}</dt>
            <dd className="font-mono">
              {phase.status === 'ready' ? (
                formatPhase(phase.phase)
              ) : phase.status === 'loading' ? (
                <Skeleton className="h-3 w-10" />
              ) : phase.status === 'error' ? (
                copy.common.readFailed
              ) : (
                copy.common.notConfigured
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{copy.home.advancedAddressBook}</dt>
            <dd>
              <Badge tone={book.isConfigured ? 'success' : 'warning'}>
                {book.isConfigured ? copy.home.statusConfigured : copy.home.statusNotConfigured}
              </Badge>
              <span className="ml-2 font-mono text-[11px] text-muted">
                {copy.home.statusCount(book.configured, book.total)}
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{copy.home.advancedBuild}</dt>
            <dd className="font-mono">{formatBuildId(BUILD_ID)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{copy.common.testnet}</dt>
            <dd>{NETWORK.testnet ? copy.banners.testnet : copy.common.unknown}</dd>
          </div>
        </dl>
        {token.status === 'ready' && token.address !== undefined ? (
          <p className="mt-4 break-all rounded-xl bg-slate-50 p-2.5 font-mono text-[10px] leading-4 text-muted">
            tokenAddress: {token.address}
          </p>
        ) : null}
        {configuredAddress('phase') === undefined ? (
          <p className="mt-3 text-[11px] leading-5 text-muted">{copy.home.advancedNoPhase}</p>
        ) : null}
      </details>
    </div>
  );
}
