import { Button } from '@/shared/ui/button';
import { Sheet } from '@/shared/ui/sheet';
import { copy } from '@/shared/config/copy-pages';

export interface BuildVersionBannerProps {
  readonly localBuildId: string;
  readonly remoteBuildId: string | null;
  readonly reloading: boolean;
  readonly onReload: () => void;
}

/** Blocking sheet shown only when the deployed build-id.json disagrees with this bundle. */
export function BuildVersionBanner({
  localBuildId,
  remoteBuildId,
  reloading,
  onReload,
}: BuildVersionBannerProps) {
  return (
    <Sheet
      open
      onOpenChange={() => {
        // Blocking on purpose: reload is the only correct action for a stale shell.
      }}
      title={copy.banners.buildMismatchTitle}
      description={copy.banners.buildMismatchBody}
      dismissible={false}
    >
      <div className="flex flex-col gap-2">
        <p className="rounded-2xl bg-slate-50 p-3 font-mono text-xs leading-5 text-muted">
          {copy.advanced.buildId}: {localBuildId}
          {remoteBuildId !== null ? ` → ${remoteBuildId}` : ''}
        </p>
        <Button loading={reloading} onClick={onReload}>
          {copy.banners.buildMismatchAction}
        </Button>
      </div>
    </Sheet>
  );
}
