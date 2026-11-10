import { ArrowRight, RefreshCw, ShieldCheck } from '@/shared/ui/icons';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import type { MemberIdentityState } from '@/entities/member-identity/model/use-member-identity';

export interface IdentityWelcomeProps {
  readonly identity: MemberIdentityState;
  readonly connectAction: ReactNode;
  readonly onRetry: () => void;
}

/**
 * Identity-first first screen (ADR-0003 §4):
 * disconnected → welcome/identity → no identity → mint.
 * Every branch has a next step; loading uses skeletons, never 0 or ''.
 */
export function IdentityWelcome({ identity, connectAction, onRetry }: IdentityWelcomeProps) {
  if (identity.status === 'disconnected') {
    return (
      <Card>
        <CardTitle>{copy.identity.disconnectedTitle}</CardTitle>
        <CardDescription>{copy.identity.disconnectedBody}</CardDescription>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="[&>button]:w-full sm:[&>button]:w-auto">{connectAction}</div>
          <Link to="/my-nft" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
            {copy.home.secondaryDisconnected}
          </Link>
        </div>
      </Card>
    );
  }

  if (identity.status === 'unconfigured') {
    return (
      <Card>
        <CardTitle>{copy.identity.unconfiguredTitle}</CardTitle>
        <CardDescription>{copy.identity.unconfiguredBody}</CardDescription>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            leadingIcon={<RefreshCw className="h-4 w-4" />}
            onClick={onRetry}
          >
            {copy.common.refresh}
          </Button>
          <Link to="/my-nft" className={buttonStyles('ghost', 'md', 'w-full sm:w-auto')}>
            {copy.identity.myNftTitle}
          </Link>
        </div>
      </Card>
    );
  }

  if (identity.status === 'loading') {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <p className="mt-4 text-sm text-muted">{copy.identity.loadingBody}</p>
      </Card>
    );
  }

  if (identity.status === 'error') {
    return (
      <Card>
        <CardTitle>{copy.identity.errorTitle}</CardTitle>
        <CardDescription>{copy.identity.errorBody}</CardDescription>
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            leadingIcon={<RefreshCw className="h-4 w-4" />}
            onClick={onRetry}
          >
            {copy.common.retry}
          </Button>
        </div>
      </Card>
    );
  }

  if (identity.status === 'empty') {
    return (
      <Card>
        <CardTitle>{copy.identity.emptyTitle}</CardTitle>
        <CardDescription>{copy.identity.emptyBody}</CardDescription>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link to="/mint" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
            {copy.identity.emptyMint}
          </Link>
          <Link to="/my-nft" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
            {copy.identity.myNftTitle}
          </Link>
        </div>
      </Card>
    );
  }

  if (identity.status === 'needs-selection') {
    return (
      <Card>
        {identity.isInvalidated ? (
          <div className="mb-4 rounded-2xl border border-warning/20 bg-warning-soft px-3 py-2 text-sm text-warning">
            {copy.identity.invalidatedBody}
          </div>
        ) : null}
        <CardTitle>{copy.identity.chooseTitle}</CardTitle>
        <CardDescription>{copy.identity.chooseBody}</CardDescription>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link to="/my-nft" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
            {copy.identity.chooseAction}
          </Link>
        </div>
      </Card>
    );
  }

  if (identity.selected === null) {
    // Defensive: status 'ready' always has a selected identity.
    return (
      <Card>
        <CardTitle>{copy.identity.chooseTitle}</CardTitle>
        <CardDescription>{copy.identity.chooseBody}</CardDescription>
        <div className="mt-4">
          <Link to="/my-nft" className={buttonStyles('primary', 'md')}>
            {copy.identity.chooseAction}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-strong via-brand to-indigo-600 p-5 text-white shadow-soft">
      <div className="flex items-center gap-2 text-xs font-medium text-white/75">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        {copy.identity.selectedLabel}
      </div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">
        {copy.identity.welcome(identity.selected.name)}
      </h2>
      <p className="mt-1 font-mono text-sm text-white/80">
        {copy.identity.memberId(identity.selected.tokenId.toString())}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          to="/my-nft"
          className={buttonStyles(
            'secondary',
            'md',
            'border-white/20 bg-white/10 text-white hover:bg-white/20',
          )}
        >
          {copy.identity.myNftTitle}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          to="/mint"
          className={buttonStyles(
            'ghost',
            'md',
            'text-white/85 hover:bg-white/10 hover:text-white',
          )}
        >
          {copy.identity.mintAnother}
        </Link>
      </div>
    </section>
  );
}
