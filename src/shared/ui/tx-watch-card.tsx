import { AlertTriangle, RefreshCw } from '@/shared/ui/icons';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
import { shortenAddress } from '@/shared/lib/format';
import type { TxWatch } from '@/shared/model/use-tx-watch';
import { Button } from '@/shared/ui/button';

export interface TxWatchCardProps {
  readonly watch: TxWatch;
  /**
   * Re-sends the same action with an explicitly correct nonce, so a wallet that
   * cached a stale nonce heals itself. Omit when the page has no way to rebuild
   * the call (the card then still offers 重新查询 and the explorer link).
   */
  readonly onResubmit?: (() => void) | undefined;
}

/**
 * The no-dead-end surface for a submitted transaction (UX spec §4.2).
 *
 * - inside the deadline: a calm pending note with the hash, 「约 X 秒」 and a
 *   manual 「重新查询」 — the primary CTA may stay disabled, but there is a way out;
 * - after the deadline (`slow`/`dropped`) or on `nonceGap`/`replaced`: a
 *   `role="alert"` card with the result, the next step and the explorer link
 *   (only when the environment package provides one; anvil does not).
 *
 * Copy comes from `shared/config/copy-pages.ts`; this component never renders a
 * raw hex error, revert selector, gas or nonce value.
 */
export function TxWatchCard({ watch, onResubmit }: TxWatchCardProps) {
  const hash = watch.hash;
  if (hash === null) return null;
  if (watch.status === 'wallet' || watch.status === 'idle') return null;
  if (watch.status === 'confirmed' || watch.status === 'reverted') return null;

  const shortHash = shortenAddress(hash, 10, 8);
  const explorerUrl =
    NETWORK.blockExplorerUrl !== null ? `${NETWORK.blockExplorerUrl}/tx/${hash}` : null;

  if (watch.status === 'pending') {
    return (
      <p
        data-testid="tx-watch-pending"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-muted"
      >
        <span>{copy.txWatch.pending.submitted}</span>
        <span className="font-mono text-[11px]">{shortHash}</span>
        {watch.remainingSeconds > 0 ? (
          <span>{copy.txWatch.pending.remaining(watch.remainingSeconds.toString())}</span>
        ) : null}
        <button
          type="button"
          onClick={watch.refresh}
          className="font-medium text-brand-strong underline underline-offset-4"
        >
          {copy.txWatch.pending.refresh}
        </button>
      </p>
    );
  }

  return (
    <div
      role="alert"
      data-testid="tx-watch-recovery"
      className="rounded-2xl border border-warning/20 bg-warning-soft/50 p-3"
    >
      <p className="flex items-start gap-1.5 text-sm font-semibold leading-6 text-warning">
        <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{copy.txWatch.titles[watch.status]}</span>
      </p>
      <p className="mt-1 text-sm leading-6 text-foreground/80">
        {copy.txWatch.bodies[watch.status]}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {onResubmit !== undefined ? (
          <Button variant="primary" size="sm" onClick={onResubmit}>
            {copy.txWatch.actions.resubmit}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          onClick={watch.refresh}
          leadingIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          {copy.txWatch.actions.refresh}
        </Button>
        {explorerUrl !== null ? (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-brand-strong underline-offset-4 hover:underline"
          >
            {copy.txWatch.actions.explorer}
          </a>
        ) : null}
      </div>
      <p className="mt-2 font-mono text-[11px] leading-4 text-muted">{shortHash}</p>
    </div>
  );
}
