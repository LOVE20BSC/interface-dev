import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/cn';
import { copy } from '@/shared/config/copy';
import type { MemberIdentity } from '@/entities/member-identity/model/use-member-identities';

export interface IdentityPillProps {
  readonly identity: MemberIdentity;
  readonly current?: boolean;
  readonly className?: string;
}

/** Read-only identity summary: memberName + #memberId. Never tokenURI, never an image. */
export function IdentityPill({ identity, current = false, className }: IdentityPillProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5',
        className,
      )}
    >
      <span className="truncate text-sm font-semibold text-foreground">
        {identity.name ?? copy.common.unknown}
      </span>
      <span className="shrink-0 font-mono text-xs text-muted">
        {copy.identity.memberId(identity.tokenId.toString())}
      </span>
      {current ? <Badge tone="brand">{copy.identity.selectedBadge}</Badge> : null}
    </span>
  );
}
