import { RefreshCw } from '@/shared/ui/icons';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import type { MemberIdentityState } from '@/entities/member-identity/model/use-member-identity';

export interface IdentityWelcomeProps {
  readonly identity: MemberIdentityState;
  readonly connectAction: ReactNode;
  readonly onRetry: () => void;
}

const TEXT_LINK =
  'inline-flex items-center text-sm font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40';

function InvalidatedNotice() {
  return (
    <p className="mb-3 rounded-xl border border-line bg-slate-50 px-3 py-2 text-xs leading-5 text-muted">
      {copy.home.identityInvalidated}
    </p>
  );
}

/**
 * First-screen identity area (UX spec §3.1):
 * disconnected → intro + connect; no identity → 你还没有身份 + 去我的 NFT;
 * has identity → greeting + #id + 切换身份. Only the connect action may be solid.
 */
export function IdentityWelcome({ identity, connectAction, onRetry }: IdentityWelcomeProps) {
  if (identity.status === 'disconnected') {
    return (
      <Card>
        <h2 className="text-base font-semibold text-foreground">
          {copy.identity.disconnectedTitle}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">{copy.home.identityIntro}</p>
        <div className="mt-4 [&>button]:w-full sm:[&>button]:w-auto">{connectAction}</div>
      </Card>
    );
  }

  if (identity.status === 'loading') {
    return (
      <Card aria-busy="true">
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </Card>
    );
  }

  if (identity.status === 'error' || identity.status === 'unconfigured') {
    return (
      <Card>
        <h2 className="text-base font-semibold text-foreground">{copy.home.errorTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {identity.status === 'unconfigured'
            ? copy.identity.unconfiguredBody
            : copy.home.errorBody}
        </p>
        <div className="mt-4">
          <Button
            variant="secondary"
            leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
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
        {identity.isInvalidated ? <InvalidatedNotice /> : null}
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {copy.home.noIdentity}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">{copy.identity.emptyBody}</p>
        <div className="mt-4">
          <Link to="/my-nft" className={TEXT_LINK}>
            {copy.home.goMyNft}
          </Link>
        </div>
      </Card>
    );
  }

  if (identity.status === 'needs-selection') {
    return (
      <Card>
        {identity.isInvalidated ? <InvalidatedNotice /> : null}
        <h2 className="text-base font-semibold text-foreground">{copy.home.chooseIdentityTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{copy.home.chooseIdentityBody}</p>
        <div className="mt-4">
          <Link to="/my-nft" className={TEXT_LINK}>
            {copy.home.goMyNft}
          </Link>
        </div>
      </Card>
    );
  }

  if (identity.selected === null) {
    return (
      <Card>
        <h2 className="text-base font-semibold text-foreground">{copy.home.chooseIdentityTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{copy.home.chooseIdentityBody}</p>
        <div className="mt-4">
          <Link to="/my-nft" className={TEXT_LINK}>
            {copy.home.goMyNft}
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
      {identity.isInvalidated ? <InvalidatedNotice /> : null}
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        {copy.identity.selectedLabel}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {identity.selected.name !== null
          ? copy.home.greeting(identity.selected.name)
          : copy.home.greetingNoName}
      </h2>
      <p className="mt-1 font-mono text-sm text-muted">
        {copy.identity.memberId(identity.selected.tokenId.toString())}
      </p>
      <div className="mt-4">
        <Link to="/my-nft" className={TEXT_LINK}>
          {copy.home.switchIdentity}
        </Link>
      </div>
    </section>
  );
}
