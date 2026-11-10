import { ArrowLeft } from '@/shared/ui/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { copy } from '@/shared/config/copy';
import { pageTitleFor } from '@/app/navigation/navigation';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { ConnectPill } from '@/widgets/connect-pill/connect-pill';

function canGoBack(): boolean {
  const state = window.history.state as { idx?: unknown } | null;
  return typeof state?.idx === 'number' && state.idx > 0;
}

/**
 * Home wordmark = the current community's on-chain symbol(), with the protocol
 * label only while that metadata is unavailable (§1.3). The fallback is what
 * keeps first paint stable; long symbols truncate instead of moving the pill.
 */
function HomeWordmark() {
  const { symbol } = useCommunityContext();
  const community = useCommunityToken(symbol);
  const wordmark =
    community.address !== undefined && !community.isMetadataLoading
      ? community.symbol
      : copy.brand.protocolLabel;

  return (
    <Link
      to="/"
      aria-label={copy.header.brandAria(wordmark)}
      className="flex min-w-0 shrink-0 items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 md:hidden"
    >
      <span className="max-w-[9rem] truncate text-base font-semibold tracking-tight">
        {wordmark}
      </span>
    </Link>
  );
}

/**
 * Sticky page header. Home shows the wordmark; every other page shows a real
 * back control (deep links included) plus the title and the one connect pill.
 */
export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';
  const title = pageTitleFor(location.pathname);

  const goBack = () => {
    if (canGoBack()) navigate(-1);
    else navigate('/');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex min-h-14 w-full max-w-2xl items-center gap-2 px-4 pt-[env(safe-area-inset-top)]">
        {isHome ? (
          <>
            <HomeWordmark />
            <span className="hidden text-sm font-medium text-muted md:inline">{copy.nav.home}</span>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button
              type="button"
              onClick={goBack}
              aria-label={copy.header.backAria}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-foreground hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <h1 className="truncate text-base font-semibold">{title ?? copy.brand.wordmark}</h1>
          </div>
        )}
        <div className="ml-auto flex min-w-0 shrink-0 items-center justify-end">
          <ConnectPill />
        </div>
      </div>
    </header>
  );
}
