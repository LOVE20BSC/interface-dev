import { ArrowRight, ArrowUpLeft, RefreshCw } from '@/shared/ui/icons';
import { lazy, Suspense, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { BUILD_ID } from '@/config/build-id.generated';
import { APP_ENV } from '@/config/env';
import { BRAND_DOCS_URL, DEFAULT_SYMBOL, NETWORK, configuredAddress } from '@/config/networks';
import { variantLabel } from '@/shared/lib/variant-label';
import { copy } from '@/shared/config/copy';
import { formatAmount, formatBuildId, UNKNOWN } from '@/shared/lib/format';
import { Skeleton } from '@/shared/ui/skeleton';
import { useFirstToken } from '@/entities/community-token/model/use-first-token';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { IdentityWelcome } from '@/features/select-identity/ui/identity-welcome';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { TechnicalDetails } from '@/widgets/contract-addresses/technical-details';

// The snapshot + Airdrop ABI live in a separate chunk: they must never block the
// identity area (UX spec §3.1 "快照加载与资格卡显隐").
const AirdropEligibilitySection = lazy(async () => {
  const module = await import('@/features/claim-airdrop/ui/airdrop-eligibility-section');
  return { default: module.AirdropEligibilitySection };
});

const TEXT_LINK =
  'inline-flex items-center text-sm font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40';

function queryFor(pathname: string, symbol: string) {
  return { pathname, search: `?symbol=${encodeURIComponent(symbol)}` } as const;
}

export function HomePage() {
  const { address: account } = useAccount();
  const identity = useMemberIdentity();
  const firstToken = useFirstToken();
  const { symbol, fromUrl, switchSymbol } = useCommunityContext();

  // §2.1: the URL seed comes from the chain's symbol(), not a frontend constant.
  useEffect(() => {
    if (fromUrl) return;
    if (firstToken.symbol !== undefined && firstToken.symbol !== symbol) {
      switchSymbol(firstToken.symbol);
    }
  }, [firstToken.symbol, fromUrl, symbol, switchSymbol]);

  const displaySymbol = firstToken.symbol ?? DEFAULT_SYMBOL;
  const balanceText =
    account === undefined
      ? UNKNOWN
      : firstToken.status === 'ready' &&
          firstToken.balance !== undefined &&
          firstToken.decimals !== undefined
        ? formatAmount(firstToken.balance, firstToken.decimals, 2)
        : UNKNOWN;

  return (
    <div className="space-y-5">
      <IdentityWelcome
        identity={identity}
        connectAction={<ConnectWalletButton />}
        onRetry={identity.refetch}
      />

      {account !== undefined ? (
        <Suspense fallback={null}>
          <AirdropEligibilitySection />
        </Suspense>
      ) : null}

      <section
        aria-label={copy.home.balanceLabel(displaySymbol)}
        className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5"
      >
        <div className="min-w-0">
          <p className="text-xs text-muted">{copy.home.balanceLabel(displaySymbol)}</p>
          {account !== undefined && firstToken.status === 'loading' ? (
            <Skeleton className="mt-1.5 h-5 w-24" />
          ) : account !== undefined && firstToken.status === 'error' ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              {copy.home.balanceError}
              <button
                type="button"
                onClick={firstToken.refetch}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong underline-offset-4 hover:underline"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                {copy.common.retry}
              </button>
            </p>
          ) : (
            <p className="mt-0.5 truncate font-mono text-lg font-semibold text-foreground">
              {balanceText}
            </p>
          )}
        </div>
        <Link
          to={{ pathname: '/swap', search: `?symbol=${encodeURIComponent(displaySymbol)}` }}
          className={TEXT_LINK}
        >
          {copy.home.swap}
        </Link>
      </section>

      <nav
        aria-label={copy.home.entriesLabel}
        className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface"
      >
        <Link
          to={queryFor('/my-nft', symbol)}
          className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-brand-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
        >
          {copy.home.entries.myNft.title}
          <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        </Link>
        <Link
          to={queryFor('/airdrop', symbol)}
          className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-brand-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
        >
          {copy.home.entries.airdrop.title}
          <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        </Link>
        <Link
          to={queryFor('/swap', symbol)}
          className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-brand-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
        >
          {copy.home.entries.swap.title}
          <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        </Link>
      </nav>
      <footer className="space-y-3 border-t border-line pt-4">
        <a
          href={BRAND_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          {copy.home.docs}
          <ArrowUpLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </a>

        <TechnicalDetails
          entries={[
            { label: displaySymbol, address: firstToken.address },
            { label: 'MemberNFT', address: configuredAddress('memberNFT') },
            { label: 'Airdrop', address: configuredAddress('airdrop') },
            { label: 'Router', address: configuredAddress('router') },
            { label: 'Pair', address: configuredAddress('pair') },
          ]}
          meta={copy.home.buildMeta(
            formatBuildId(BUILD_ID),
            variantLabel(APP_ENV.variant),
            NETWORK.chainId,
          )}
        />
      </footer>
    </div>
  );
}
