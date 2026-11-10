import { Link } from 'react-router-dom';
import { AlertTriangle, Gift } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy';
import { formatAmount } from '@/shared/lib/format';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import type { AirdropEligibility } from '@/entities/airdrop/model/use-airdrop-eligibility';

export interface MintFundsBranchProps {
  readonly eligibility: AirdropEligibility;
  readonly paymentSymbol: string;
  readonly paymentDecimals: number | undefined;
  readonly airdropHref: string;
  readonly swapHref: string;
}

/**
 * The one fork when the wallet cannot afford the mint (UX spec §3.3).
 *
 * Both destinations are pinned to the genesis/payment token, never the current
 * community: buying a child token would not pay for the mint (CI-005).
 */
export function MintFundsBranch({
  eligibility,
  paymentSymbol,
  paymentDecimals,
  airdropHref,
  swapHref,
}: MintFundsBranchProps) {
  if (eligibility.status === 'loading' || eligibility.status === 'disconnected') {
    return (
      <Card className="border-warning/25 bg-warning-soft/30" aria-busy="true">
        <p className="text-sm text-muted">{copy.mintIdentity.branch.checking}</p>
        <Skeleton className="mt-3 h-11 w-full rounded-2xl" />
      </Card>
    );
  }

  if (eligibility.status === 'eligible') {
    const amount =
      eligibility.claimableAmount !== undefined && paymentDecimals !== undefined
        ? formatAmount(eligibility.claimableAmount, paymentDecimals, 2)
        : undefined;

    return (
      <Card className="border-brand/25 bg-brand-soft/30">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong">
            <Gift className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm leading-6 text-foreground">
            {copy.mintIdentity.branch.airdrop(amount, paymentSymbol)}
          </p>
        </div>
        <Link to={airdropHref} className={buttonStyles('primary', 'lg', 'mt-4 w-full')}>
          {copy.mintIdentity.branch.airdropCta}
        </Link>
      </Card>
    );
  }

  if (eligibility.status === 'error' || eligibility.status === 'mismatch') {
    return (
      <Card className="border-warning/25 bg-warning-soft/30">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-warning-soft text-warning">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm leading-6 text-foreground">{copy.mintIdentity.branch.unknown}</p>
        </div>
        <div className="mt-4 space-y-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => eligibility.refetch()}
          >
            {copy.mintIdentity.branch.retry}
          </Button>
          <Link
            to={swapHref}
            className={buttonStyles('ghost', 'md', 'w-full text-muted hover:text-foreground')}
          >
            {copy.mintIdentity.branch.swapFirst}
          </Link>
        </div>
      </Card>
    );
  }

  // ineligible, unavailable or an unconfigured airdrop contract: buying the
  // payment token is the only working path.
  return (
    <Card className="border-warning/25 bg-warning-soft/30">
      <p className="text-sm leading-6 text-foreground">
        {copy.mintIdentity.branch.swap(paymentSymbol)}
      </p>
      <Link to={swapHref} className={buttonStyles('primary', 'lg', 'mt-4 w-full')}>
        {copy.mintIdentity.branch.swapCta}
      </Link>
    </Card>
  );
}
