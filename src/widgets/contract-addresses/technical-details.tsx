import type { ReactNode } from 'react';
import { explorerAddressUrl, type HexAddress } from '@/config/networks';
import { copy } from '@/shared/config/copy';
import { cn } from '@/shared/lib/cn';

export interface TechnicalAddressEntry {
  readonly label: string;
  readonly address: HexAddress | undefined;
}

export interface TechnicalDetailsProps {
  readonly entries: readonly TechnicalAddressEntry[];
  readonly summary?: string;
  readonly meta?: ReactNode;
  readonly className?: string;
}

/**
 * Advanced disclosure shared by the home footer and 我的 NFT.
 * Addresses are not thrown at the user on the default screen; contract links exist
 * only when the environment package provides a block explorer (never for anvil).
 */
export function TechnicalDetails({
  entries,
  summary = copy.home.technical,
  meta,
  className,
}: TechnicalDetailsProps) {
  return (
    <details className={cn('group rounded-2xl border border-line bg-surface/70 p-4', className)}>
      <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:hidden">
        <span className="inline-flex items-center gap-2">
          {summary}
          <span className="text-xs font-normal text-muted group-open:hidden" aria-hidden="true">
            ＋
          </span>
          <span
            className="hidden text-xs font-normal text-muted group-open:inline"
            aria-hidden="true"
          >
            －
          </span>
        </span>
      </summary>
      {meta !== undefined ? <div className="mt-3 text-xs leading-5 text-muted">{meta}</div> : null}
      <dl className="mt-3 space-y-2.5">
        {entries.map((entry) => {
          const href = entry.address !== undefined ? explorerAddressUrl(entry.address) : null;
          return (
            <div key={entry.label} className="flex items-start justify-between gap-3 text-xs">
              <dt className="shrink-0 text-muted">{entry.label}</dt>
              <dd className="min-w-0 break-all text-right font-mono text-[11px] leading-5">
                {entry.address === undefined ? (
                  <span className="font-sans text-muted">{copy.common.notConfigured}</span>
                ) : href === null ? (
                  <span className="text-foreground">{entry.address}</span>
                ) : (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-strong underline-offset-4 hover:underline"
                  >
                    {entry.address}
                  </a>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}
