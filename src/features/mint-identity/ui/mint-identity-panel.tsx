import { Coins, RefreshCw } from '@/shared/ui/icons';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { configuredAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import type { MemberIdentityState } from '@/entities/member-identity/model/use-member-identity';

export interface MintIdentityPanelProps {
  readonly identity: MemberIdentityState;
  readonly connectAction: ReactNode;
  readonly onRetry: () => void;
}

/**
 * M0 mint shell. It never invents a price: while the address book is empty it
 * says 未配置; once configured but before the data layer lands it says 待接入
 * and points at the next useful page.
 */
export function MintIdentityPanel({ identity, connectAction, onRetry }: MintIdentityPanelProps) {
  const mintAddress = configuredAddress('mint');
  const tokenAddress = configuredAddress('tokenAddress');
  const isDeployed = mintAddress !== undefined && tokenAddress !== undefined;

  if (!isDeployed) {
    return (
      <Card>
        <CardTitle>{copy.pages.mint.notDeployedTitle}</CardTitle>
        <CardDescription>{copy.pages.mint.notDeployedBody}</CardDescription>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link to="/" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
            {copy.pages.mint.notDeployedNext}
          </Link>
          <Link to="/my-nft" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
            {copy.pages.myNft.title}
          </Link>
        </div>
      </Card>
    );
  }

  if (identity.status === 'disconnected') {
    return (
      <Card>
        <CardTitle>{copy.pages.mint.connectTitle}</CardTitle>
        <CardDescription>{copy.pages.mint.connectBody}</CardDescription>
        <div className="mt-4 [&>button]:w-full sm:[&>button]:w-auto">{connectAction}</div>
      </Card>
    );
  }

  if (identity.status === 'unconfigured') {
    return (
      <Card>
        <CardTitle>{copy.pages.mint.notDeployedTitle}</CardTitle>
        <CardDescription>{copy.pages.mint.notDeployedBody}</CardDescription>
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            leadingIcon={<RefreshCw className="h-4 w-4" />}
            onClick={onRetry}
          >
            {copy.common.refresh}
          </Button>
          <Link to="/" className={buttonStyles('ghost', 'md')}>
            {copy.common.home}
          </Link>
        </div>
      </Card>
    );
  }

  if (identity.status === 'loading') {
    return (
      <Card>
        <CardTitle>{copy.identity.loadingTitle}</CardTitle>
        <CardDescription>{copy.identity.loadingBody}</CardDescription>
      </Card>
    );
  }

  if (identity.status === 'ready' || identity.status === 'needs-selection') {
    return (
      <Card>
        <CardTitle>{copy.pages.mint.haveIdentity}</CardTitle>
        <div className="mt-4">
          <Link to="/my-nft" className={buttonStyles('primary', 'md')}>
            {copy.pages.mint.haveIdentityNext}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong">
          <Coins className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <CardTitle>{copy.pages.mint.scaffoldTitle}</CardTitle>
          <CardDescription>{copy.pages.mint.scaffoldBody}</CardDescription>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link to="/my-nft" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
          {copy.pages.mint.scaffoldNext}
        </Link>
        <Link to="/airdrop" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
          {copy.pages.airdrop.title}
        </Link>
      </div>
    </Card>
  );
}
