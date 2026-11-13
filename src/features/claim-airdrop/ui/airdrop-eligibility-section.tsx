import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy';
import { buttonStyles } from '@/shared/ui/button';
import { useAirdropEligibility } from '@/entities/airdrop/model/use-airdrop-eligibility';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';

/**
 * Home eligibility card (UX spec §3.1 block 2).
 *
 * It renders only when the wallet is actually eligible: snapshot entry exists,
 * not claimed, and claimableAmount > 0. Nothing is reserved for it while the
 * snapshot loads, and there is no "not eligible" copy. A failed read or a
 * merkle-root mismatch shows one neutral retry line instead of the card.
 */
export function AirdropEligibilitySection() {
  const eligibility = useAirdropEligibility();
  const { symbol } = useCommunityContext();

  if (eligibility.status === 'eligible') {
    return (
      <section
        aria-labelledby="airdrop-eligibility-title"
        className="rounded-3xl border border-brand/25 bg-gradient-to-br from-brand-soft/70 to-surface p-5 shadow-soft"
      >
        <h2
          id="airdrop-eligibility-title"
          className="text-lg font-semibold leading-7 tracking-tight text-foreground"
        >
          {copy.home.eligibilityTitle}
        </h2>
        <Link
          to={{ pathname: '/airdrop', search: `?symbol=${encodeURIComponent(symbol)}` }}
          className={buttonStyles('primary', 'md', 'mt-4 w-full')}
        >
          {copy.home.mintAirdrop}
        </Link>
      </section>
    );
  }

  if (eligibility.status === 'error' || eligibility.status === 'mismatch') {
    return (
      <p className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-xs leading-5 text-muted">
        <span>{copy.home.eligibilityUnavailable}</span>
        <button
          type="button"
          onClick={eligibility.refetch}
          className="shrink-0 font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {copy.common.retry}
        </button>
      </p>
    );
  }

  return null;
}
