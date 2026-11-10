import { ArrowDownUp, Info } from '@/shared/ui/icons';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy';
import { buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';

export interface SwapTokenPanelProps {
  readonly isConnected: boolean;
  readonly connectAction: ReactNode;
}

/** Buy-only swap shell. No quote, no reserve numbers, no placeholder 0. */
export function SwapTokenPanel({ isConnected, connectAction }: SwapTokenPanelProps) {
  const isDeployed =
    configuredAddress('router') !== undefined && configuredAddress('tokenAddress') !== undefined;

  if (!isDeployed) {
    return (
      <Card>
        <CardTitle>{copy.pages.swap.notDeployedTitle}</CardTitle>
        <CardDescription>{copy.pages.swap.notDeployedBody}</CardDescription>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link to="/" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
            {copy.pages.swap.notDeployedNext}
          </Link>
          <Link to="/airdrop" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
            {copy.pages.airdrop.title}
          </Link>
        </div>
      </Card>
    );
  }

  if (!isConnected) {
    return (
      <Card>
        <CardTitle>{copy.pages.swap.connectTitle}</CardTitle>
        <CardDescription>{copy.pages.swap.connectBody}</CardDescription>
        <div className="mt-4 [&>button]:w-full sm:[&>button]:w-auto">{connectAction}</div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong">
          <ArrowDownUp className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <CardTitle>{copy.pages.swap.scaffoldTitle}</CardTitle>
          <CardDescription>{copy.pages.swap.scaffoldBody}</CardDescription>
        </div>
      </div>
      <p className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {copy.pages.swap.buyOnly}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link to="/airdrop" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
          {copy.pages.swap.scaffoldNext}
        </Link>
        <Link to="/" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
          {copy.common.home}
        </Link>
      </div>
    </Card>
  );
}
