import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly secondary?: ReactNode;
  readonly icon?: ReactNode;
  readonly className?: string;
}

/** Every empty state must offer a next step (UX spec B-11). */
export function EmptyState({
  title,
  description,
  action,
  secondary,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-dashed border-line bg-surface/70 px-5 py-8 text-center',
        className,
      )}
    >
      {icon !== undefined ? (
        <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong">
          {icon}
        </span>
      ) : null}
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{description}</p>
      {action !== undefined || secondary !== undefined ? (
        <div className="mt-5 flex flex-col items-stretch justify-center gap-2 sm:flex-row">
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
