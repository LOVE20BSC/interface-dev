import { copy } from '@/shared/config/copy-pages';

export interface AirdropRulesProps {
  readonly symbol: string | undefined;
}

/**
 * Low-weight rules fold (UX spec §3.4 block 3): why the distributed token is the
 * genesis token and where the share comes from. Why the amount changes already
 * sits directly under the estimate, so it is not repeated here, and the contract
 * address now lives on /about (§3.8). It is a <details> element, not a primary
 * surface, so it never competes with the CTA.
 */
export function AirdropRules({ symbol }: AirdropRulesProps) {
  return (
    <details className="rounded-2xl border border-line bg-surface/70 p-3">
      <summary className="cursor-pointer list-none text-xs font-medium text-foreground marker:hidden">
        {copy.airdrop.rules.summary}
      </summary>
      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted">
        {symbol !== undefined ? <li>{copy.airdrop.rules.genesis(symbol)}</li> : null}
        <li>{copy.airdrop.rules.snapshot}</li>
      </ul>
    </details>
  );
}
