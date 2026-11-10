import { ArrowRight, Home } from '@/shared/ui/icons';
import { Link } from 'react-router-dom';
import { copy } from '@/shared/config/copy';
import { buttonStyles } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';

export type PlaceholderKey = 'gov' | 'act' | 'group' | 'me';

export interface PlaceholderPageProps {
  readonly page: PlaceholderKey;
  /** Extra text link, currently only used by 我的 → 我的 NFT. */
  readonly extraLink?: { readonly to: string; readonly label: string };
}

/** M0 placeholder pages are not blank: label + what/why + a way home. */
export function PlaceholderPage({ page, extraLink }: PlaceholderPageProps) {
  const content = copy.placeholders[page];
  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{content.title}</h1>
        <Badge tone="warning">{copy.placeholders.badge}</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">{content.body}</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Link to="/" className={buttonStyles('primary', 'md', 'w-full sm:w-auto')}>
          <Home className="h-4 w-4" aria-hidden="true" />
          {copy.placeholders.nextHome}
        </Link>
        {extraLink !== undefined ? (
          <Link to={extraLink.to} className={buttonStyles('secondary', 'md', 'w-full sm:w-auto')}>
            {extraLink.label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
