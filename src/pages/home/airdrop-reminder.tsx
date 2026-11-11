import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy';
import { buttonStyles } from '@/shared/ui/button';
import { formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { useAirdropEligibility } from '@/entities/airdrop/model/use-airdrop-eligibility';
import { useFirstToken } from '@/entities/community-token/model/use-first-token';

export interface AirdropReminderProps {
  /** False when the no-identity card already owns the screen's one filled button. */
  readonly primary: boolean;
  readonly search: string;
}

/**
 * Reminder card 2 (UX spec §3.1): only rendered when the wallet is actually
 * eligible and unclaimed. The amount is the on-chain claimableAmount; when it
 * (or the genesis symbol/decimals) is unknown the sentence drops the amount
 * clause instead of printing 「—」 inside a sentence.
 *
 * This module is a lazy chunk: the snapshot document and Airdrop ABI must never
 * enter the first-screen bundle.
 */
export function AirdropReminder({ primary, search }: AirdropReminderProps) {
  const eligibility = useAirdropEligibility();
  const firstToken = useFirstToken();

  if (eligibility.status !== 'eligible') return null;

  const amount =
    eligibility.claimableAmount !== undefined &&
    firstToken.symbol !== undefined &&
    firstToken.decimals !== undefined
      ? formatTokenAmount(eligibility.claimableAmount, firstToken.decimals)
      : UNKNOWN;
  const title =
    amount === UNKNOWN || firstToken.symbol === undefined
      ? copy.home.reminderAirdrop
      : copy.home.reminderAirdropWithAmount(amount, firstToken.symbol);

  return (
    <section
      aria-labelledby="home-reminder-airdrop"
      className="rounded-2xl border border-brand/25 bg-brand-soft/30 p-4"
    >
      <h2 id="home-reminder-airdrop" className="text-base font-semibold leading-6 text-foreground">
        {title}
      </h2>
      <Link
        to={{ pathname: '/airdrop', search }}
        className={buttonStyles(primary ? 'primary' : 'secondary', 'md', 'mt-3 w-full')}
      >
        {copy.home.mintAirdrop}
      </Link>
    </section>
  );
}
