import { cn } from '@/shared/lib/cn';

export function Separator({ className }: { readonly className?: string }) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn('h-px w-full bg-line', className)}
    />
  );
}
