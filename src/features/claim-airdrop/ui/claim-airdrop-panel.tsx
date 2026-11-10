import { Gift } from '@/shared/ui/icons';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy';
import { buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';

export interface ClaimAirdropPanelProps {
  readonly isConnected: boolean;
  readonly connectAction: ReactNode;
}

/** Airdrop claim shell. Eligibility is never faked or defaulted to 0. */
export function ClaimAirdropPanel({ isConnected, connectAction }: ClaimAirdropPanelProps) {
  const isDeployed = configuredAddress('airdrop') !== undefined;

  if (!isDeployed) {
    return (
      <Card>
        <CardTitle>{copy.pages.airdrop.notDeployedTitle}</CardTitle>
        <CardDescription>{copy.pages.airdrop.notDeployedBody}</CardDescription>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link to="/" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
            {copy.pages.airdrop.notDeployedNext}
          </Link>
          <Link to="/swap" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
            {copy.pages.swap.title}
          </Link>
        </div>
      </Card>
    );
  }

  if (!isConnected) {
    return (
      <Card>
        <CardTitle>{copy.pages.airdrop.connectTitle}</CardTitle>
        <CardDescription>{copy.pages.airdrop.connectBody}</CardDescription>
        <div className="mt-4 [&>button]:w-full sm:[&>button]:w-auto">{connectAction}</div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong">
          <Gift className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <CardTitle>{copy.pages.airdrop.scaffoldTitle}</CardTitle>
          <CardDescription>{copy.pages.airdrop.scaffoldBody}</CardDescription>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link to="/swap" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
          {copy.pages.airdrop.scaffoldNext}
        </Link>
        <Link to="/" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
          {copy.common.home}
        </Link>
      </div>
    </Card>
  );
}
