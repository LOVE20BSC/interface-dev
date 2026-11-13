import { ArrowLeft } from '@/shared/ui/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { copy } from '@/shared/config/copy';
import { pageTitleFor } from '@/app/navigation/navigation';
import { useCommunityDisplay } from '@/entities/community-token/model/use-community-display';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import { ConnectPill } from '@/widgets/connect-pill/connect-pill';

function canGoBack(): boolean {
  const state = window.history.state as { idx?: unknown } | null;
  return typeof state?.idx === 'number' && state.idx > 0;
}

/**
 * Sticky page header.
 *
 * Mobile home (<md) shows the community wordmark only while disconnected: once
 * the wallet is connected (or on the wrong chain) the top-right pill is the
 * only community-name position (owner decision 2026-11-11). Desktop home keeps
 * the 「首页」 label — the sidebar owns the desktop wordmark — and secondary
 * pages keep back + title + the one connect pill.
 */
export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';
  const title = pageTitleFor(location.pathname);
  const wallet = useWalletConnection();
  const { symbol } = useCommunityContext();
  const wordmark = useCommunityDisplay(symbol).symbol;

  const goBack = () => {
    if (canGoBack()) navigate(-1);
    else navigate('/');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex min-h-14 w-full max-w-2xl items-center gap-1.5 px-4 pt-[env(safe-area-inset-top)]">
        {isHome ? (
          <div className="flex min-w-0 flex-1 items-center">
            <span className="hidden text-sm font-medium text-muted md:inline">{copy.nav.home}</span>
            {!wallet.isConnected ? (
              <span
                data-testid="home-wordmark"
                className="min-w-0 truncate text-sm font-semibold text-foreground md:hidden"
              >
                {wordmark}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button
              type="button"
              onClick={goBack}
              aria-label={copy.header.backAria}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-foreground hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <h1 className="truncate text-base font-semibold">
              {title ?? copy.brand.protocolLabel}
            </h1>
          </div>
        )}
        <div className="ml-auto flex min-w-0 items-center justify-end">
          <ConnectPill />
        </div>
      </div>
    </header>
  );
}
