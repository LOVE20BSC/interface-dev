import { copy } from '@/shared/config/copy';
import { Skeleton } from '@/shared/ui/skeleton';

/**
 * Route-level skeleton shown while a lazy page chunk loads. It mirrors the
 * header + first card + secondary card rhythm of secondary pages so the fallback
 * does not jump when the page arrives. No spinner, no full-screen flash.
 */
export function RouteFallback() {
  return (
    <div aria-busy="true" className="min-h-[55vh] space-y-3">
      <span className="sr-only" role="status">
        {copy.common.loading}
      </span>
      <Skeleton className="h-5 w-28" />
      <div className="rounded-3xl border border-line bg-surface p-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-3/5" />
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-5 w-36" />
      </div>
    </div>
  );
}
