import type { ReactNode } from 'react';
import { copy } from '@/shared/config/copy';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import type { MemberIdentity } from '@/entities/member-identity/model/use-member-identity';

const AVATAR_GRADIENTS = [
  'from-sky-500 to-blue-600',
  'from-violet-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
] as const;

function gradientFor(tokenId: bigint): string {
  const text = tokenId.toString();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 997;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length] ?? AVATAR_GRADIENTS[0];
}

export interface IdentityCardProps {
  readonly identity: MemberIdentity;
  readonly selected?: boolean;
  readonly action?: ReactNode;
}

/** Deterministic local avatar: no tokenURI, no third-party image host. */
export function IdentityCard({ identity, selected = false, action }: IdentityCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border bg-surface p-3 transition-colors',
        selected ? 'border-brand/40 bg-brand-soft/30' : 'border-line',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-base font-semibold text-white shadow-sm',
          gradientFor(identity.tokenId),
        )}
      >
        {identity.name.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{identity.name}</p>
        <p className="mt-0.5 font-mono text-xs text-muted">
          {copy.identity.memberId(identity.tokenId.toString())}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {selected ? <Badge tone="brand">{copy.identity.selectedBadge}</Badge> : null}
        {action}
      </div>
    </div>
  );
}
