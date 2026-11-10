import { Check, RefreshCw } from '@/shared/ui/icons';
import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy';
import { Button, buttonStyles } from '@/shared/ui/button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { IdentityCard } from '@/entities/member-identity/ui/identity-card';
import type { MemberIdentityState } from '@/entities/member-identity/model/use-member-identity';

export interface IdentityListProps {
  readonly identity: MemberIdentityState;
  readonly onRetry: () => void;
}

/** The "我的 NFT" read model: enumerate identities and choose the current one. */
export function IdentityList({ identity, onRetry }: IdentityListProps) {
  if (identity.status === 'loading') {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-[76px] w-full rounded-2xl" />
        <Skeleton className="h-[76px] w-full rounded-2xl" />
      </div>
    );
  }

  if (identity.status === 'error') {
    return (
      <Card>
        <CardTitle>{copy.identity.errorTitle}</CardTitle>
        <CardDescription>{copy.identity.errorBody}</CardDescription>
        <div className="mt-4">
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
          <Link to="/" className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
            {copy.common.home}
          </Link>
        </div>
      </Card>
    );
  }

  if (identity.status === 'needs-selection' || identity.status === 'ready') {
    return (
      <div>
        {identity.isInvalidated ? (
          <div className="mb-3 rounded-2xl border border-warning/20 bg-warning-soft px-3 py-2 text-sm text-warning">
            {copy.identity.invalidatedBody}
          </div>
        ) : null}
        <h2 className="mb-1 text-sm font-semibold text-foreground">{copy.identity.listTitle}</h2>
        <p className="mb-3 text-xs text-muted">{copy.identity.chooseBody}</p>
        <ul className="space-y-2">
          {identity.identities.map((entry) => {
            const selected = identity.selected?.tokenId === entry.tokenId;
            return (
              <li key={entry.tokenId.toString()}>
                <IdentityCard
                  identity={entry}
                  selected={selected}
                  action={
                    selected ? (
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
                        <Check className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">{copy.identity.selectedAction}</span>
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => identity.select(entry.tokenId)}
                      >
                        {copy.identity.selectAction}
                      </Button>
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
        {identity.isTruncated ? (
          <p className="mt-3 text-xs leading-5 text-muted">{copy.identity.truncated}</p>
        ) : null}
        <div className="mt-5">
          <Link to="/mint" className={buttonStyles('secondary', 'md')}>
            {copy.identity.mintAnother}
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
