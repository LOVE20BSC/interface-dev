import { ArrowUpLeft } from '@/shared/ui/icons';
import { lazy, Suspense, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { BUILD_ID } from '@/config/build-id.generated';
import { APP_ENV } from '@/config/env';
import { BRAND_DOCS_URL, NETWORK, configuredAddress } from '@/config/networks';
import { variantLabel } from '@/shared/lib/variant-label';
import { copy } from '@/shared/config/copy';
import { formatBuildId, formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { useCommunityBalance } from '@/entities/community-token/model/use-community-balance';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { TechnicalDetails } from '@/widgets/contract-addresses/technical-details';

/**
 * 首页 = 提醒流 (UX spec §3.1, owner 2026-11-11): only what needs the user's
 * attention is on the page. Navigation lives in /apps; identity and balance
 * details live in 我的 (§3.7); home keeps a single thin line into 我的.
 */

// The snapshot + Airdrop ABI live in a separate chunk: they must never block
// the thin line or the no-identity reminder (UX spec §3.1 "快照加载与资格卡显隐").
const AirdropReminder = lazy(async () => {
  const module = await import('@/pages/home/airdrop-reminder');
  return { default: module.AirdropReminder };
});

/** Whether the lazy airdrop chunk found a reminder card. */
export type AirdropReminderStatus = 'pending' | 'eligible' | 'other';

export function HomePage() {
  const { address: account } = useAccount();
  const identity = useMemberIdentity();
  const { symbol } = useCommunityContext();
  const token = useCommunityToken(symbol);
  const balance = useCommunityBalance(token.address, token.decimals);
  const { search } = useLocation();
  const [airdropStatus, setAirdropStatus] = useState<AirdropReminderStatus>('pending');

  const toMe = { pathname: '/me', search } as const;

  // Thin line left: current identity name, 还没有身份 when settled without a
  // current identity, — while unknown (never invent a name).
  const identityName =
    identity.selected?.name ??
    (identity.status === 'empty' || identity.status === 'needs-selection'
      ? copy.home.thinLineNoIdentity
      : UNKNOWN);

  const amountText =
    balance.status === 'ready' ? formatTokenAmount(balance.value, balance.decimals) : UNKNOWN;
  const balanceText = amountText === UNKNOWN ? UNKNOWN : `${amountText} ${token.symbol}`;

  const connected = account !== undefined;
  const needsIdentityCard = connected && identity.status === 'empty';
  const needsSelectionCard = connected && identity.status === 'needs-selection';
  const identitySettled =
    identity.status === 'empty' ||
    identity.status === 'ready' ||
    identity.status === 'needs-selection';

  // TODO(owner 2026-11-11, 未确认交易提醒): there is no shared pending-tx read
  // model today — mintTask / airdropClaim / swapReceipt each persist their own
  // flow record with different shapes. Do not fake a count until a single
  // persisted pending-tx helper exists (see docs/product/m0-ux-spec.md §3.1).

  return (
    <div className="space-y-4">
      {account === undefined ? (
        <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
          <h2 className="text-base font-semibold text-foreground">
            {copy.identity.disconnectedTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">{copy.home.identityIntro}</p>
          <div className="mt-4 [&>button]:w-full sm:[&>button]:w-auto">
            <ConnectWalletButton />
          </div>
        </section>
      ) : null}

      {/* Thin line: always visible, one row, whole row → /me, no card chrome. */}
      <Link
        to={toMe}
        data-testid="home-thin-line"
        className="flex w-full min-w-0 items-center justify-between gap-3 py-1 text-sm text-muted underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <span className="min-w-0 flex-1 truncate">{identityName}</span>
        <span className="shrink-0 whitespace-nowrap font-mono text-xs">{balanceText}</span>
      </Link>

      {needsIdentityCard ? (
        <section
          aria-labelledby="home-reminder-identity"
          className="rounded-2xl border border-line bg-surface p-4"
        >
          <h2 id="home-reminder-identity" className="text-base font-semibold text-foreground">
            {copy.home.reminderNoIdentityTitle}
          </h2>
          <Link
            to={{ pathname: '/mint', search }}
            className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-brand px-4 text-sm font-medium text-white shadow-soft transition-colors hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
          >
            {copy.home.mintIdentity}
          </Link>
        </section>
      ) : null}

      {needsSelectionCard ? (
        <section
          aria-labelledby="home-reminder-choose-identity"
          className="rounded-2xl border border-line bg-surface p-4"
        >
          <h2
            id="home-reminder-choose-identity"
            className="text-base font-semibold text-foreground"
          >
            {copy.home.reminderNeedsSelectionTitle}
          </h2>
          <Link
            to={{ pathname: '/my-nft', search }}
            className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-brand px-4 text-sm font-medium text-white shadow-soft transition-colors hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
          >
            {copy.home.chooseIdentity}
          </Link>
        </section>
      ) : null}

      {connected ? (
        <Suspense fallback={null}>
          <AirdropReminder
            primary={!needsIdentityCard && !needsSelectionCard}
            onStatusChange={setAirdropStatus}
            search={search}
          />
        </Suspense>
      ) : null}

      {connected &&
      identitySettled &&
      !needsIdentityCard &&
      !needsSelectionCard &&
      airdropStatus === 'other' ? (
        <p className="text-sm leading-6 text-muted">{copy.home.nothingToDo}</p>
      ) : null}

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
            { label: token.symbol, address: token.address },
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
