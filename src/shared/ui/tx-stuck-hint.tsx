import { AlertTriangle } from '@/shared/ui/icons';
import { copy } from '@/shared/config/copy-pages';
import { shortenAddress } from '@/shared/lib/format';
import type { TxWatch } from '@/shared/model/use-tx-watch';

export interface TxStuckHintProps {
  readonly watch: TxWatch;
}

/**
 * Pure stuck-state hint (owner 2026-11-23, Q1123-4): no actions.
 * The watcher auto-updates this into a receipt/failure once the transaction
 * settles; there is deliberately no action button.
 */
export function TxStuckHint({ watch }: TxStuckHintProps) {
  const hash = watch.hash;
  if (hash === null || watch.status === 'wallet' || watch.status === 'idle') return null;
  if (watch.status === 'confirmed' || watch.status === 'reverted') return null;

  const shortHash = shortenAddress(hash, 10, 8);

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
      </p>
    );
  }

  return (
    <div
      role="alert"
      data-testid="tx-watch-recovery"
      // 卡住态有四种内部成因（slow / dropped / replaced / nonceGap），用户看到的文案
      // 相同；这个属性不改视觉，只让测试能断言"到底是哪一种"（2026-11-27 加）。
      data-status={watch.status}
      className="rounded-2xl border border-warning/20 bg-warning-soft/50 p-3"
    >
      <p className="flex items-start gap-1.5 text-sm font-semibold leading-6 text-warning">
        <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{copy.txWatch.stuck.title}</span>
      </p>
      <p className="mt-1 text-sm leading-6 text-foreground/80">{copy.txWatch.stuck.body}</p>
      <p className="mt-2 font-mono text-[11px] leading-4 text-muted">{shortHash}</p>
    </div>
  );
}
