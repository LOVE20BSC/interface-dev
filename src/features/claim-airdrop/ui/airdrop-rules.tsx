import { copy } from '@/shared/config/copy-pages';

/**
 * Rules fold (UX spec §3.4 block 3): who is eligible and where the share comes
 * from. Owner 2026-11-17: it is expanded by default and carries the full
 * eligibility paragraph verbatim, with the burn-activity URL as the paragraph's
 * closing link. It stays a <details> element, so the reader can still fold it
 * away instead of it competing with the CTA.
 */
export function AirdropRules() {
  return (
    <details
      open
      data-testid="airdrop-rules"
      className="rounded-2xl border border-line bg-surface/70 p-3"
    >
      <summary className="cursor-pointer list-none text-xs font-medium text-foreground marker:hidden">
        {copy.airdrop.rules.summary}
      </summary>
      <p className="mt-2 text-xs leading-5 text-muted">
        {copy.airdrop.rules.body}
        <a
          href={copy.airdrop.rules.link}
          target="_blank"
          rel="noreferrer"
          className="break-all font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {copy.airdrop.rules.link}
        </a>
      </p>
    </details>
  );
}
