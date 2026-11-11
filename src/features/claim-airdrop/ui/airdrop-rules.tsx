import { copy } from '@/shared/config/copy-pages';
import type { HexAddress } from '@/config/networks';

export interface AirdropRulesProps {
  readonly symbol: string | undefined;
  readonly airdropAddress: HexAddress | undefined;
}

/**
 * Low-weight rules fold (UX spec §3.4 block 3): why the distributed token is the
 * genesis token, where the share comes from, and the contract address. Why the
 * amount changes already sits directly under the estimate, so it is not repeated
 * here. It is a <details> element, not a primary surface, so it never competes
 * with the CTA.
 */
export function AirdropRules({ symbol, airdropAddress }: AirdropRulesProps) {
  return (
    <details className="rounded-2xl border border-line bg-surface/70 p-3">
      <summary className="cursor-pointer list-none text-xs font-medium text-foreground marker:hidden">
        {copy.airdrop.rules.summary}
      </summary>
      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted">
        {symbol !== undefined ? <li>{copy.airdrop.rules.genesis(symbol)}</li> : null}
        <li>{copy.airdrop.rules.snapshot}</li>
        {airdropAddress !== undefined ? (
          <li className="flex flex-col gap-0.5">
            <span>{copy.airdrop.rules.contract}</span>
            <span className="break-all font-mono text-[11px] leading-4">{airdropAddress}</span>
          </li>
        ) : null}
      </ul>
    </details>
  );
}
