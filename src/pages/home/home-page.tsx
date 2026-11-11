import { lazy, Suspense } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { copy } from '@/shared/config/copy';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';

/**
 * 首页 = 问候 + 提醒流 (UX spec §3.1, owner 2026-11-12): the page opens with a
 * greeting that names the current identity NFT, then only what needs the user's
 * attention. Navigation lives in /apps; identity and balance details live in 我的
 * (§3.7); docs and every contract address live in /about (§3.8). With nothing to
 * do the page is just the greeting, with no footer and no filler line.
 */

// The snapshot + Airdrop ABI live in a separate chunk: they must never block
// the greeting or the no-identity reminder (UX spec §3.1 "快照加载与资格卡显隐").
const AirdropReminder = lazy(async () => {
  const module = await import('@/pages/home/airdrop-reminder');
  return { default: module.AirdropReminder };
});

export function HomePage() {
  const { address: account } = useAccount();
  const identity = useMemberIdentity();
  const { search } = useLocation();

  const selectedName = identity.selected?.name;
  // Greeting states: connected + identity → 你好，{memberName}; otherwise 你好
  // (connected without an identity, still loading, or not connected at all).
  const greeting =
    selectedName !== null && selectedName !== undefined
      ? copy.home.greeting(selectedName)
      : copy.home.greetingNoName;

  const connected = account !== undefined;
  const needsIdentityCard = connected && identity.status === 'empty';
  const needsSelectionCard = connected && identity.status === 'needs-selection';

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

      {/* The page h1: a greeting, never a link. One line, truncating. */}
      <h1
        data-testid="home-greeting"
        className="truncate text-2xl font-semibold tracking-tight text-foreground"
      >
        {greeting}
      </h1>

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
          <AirdropReminder primary={!needsIdentityCard && !needsSelectionCard} search={search} />
        </Suspense>
      ) : null}
    </div>
  );
}
