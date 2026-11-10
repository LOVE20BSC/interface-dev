import { Loader2 } from '@/shared/ui/icons';
import { cn } from '@/shared/lib/cn';

export function Skeleton({ className }: { readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse rounded-lg bg-slate-200/70', className)}
    />
  );
}

export function Spinner({
  className,
  label,
}: {
  readonly className?: string;
  readonly label?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label !== undefined ? <span>{label}</span> : null}
    </span>
  );
}
