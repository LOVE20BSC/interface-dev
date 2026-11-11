import { ChevronDown } from '@/shared/ui/icons';
import { lazy, Suspense, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { copy } from '@/shared/config/copy';
import { shortenAddress } from '@/shared/lib/format';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { WrongNetworkButton } from '@/features/connect-wallet/ui/wrong-network-button';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
import { useCommunityDisplay } from '@/entities/community-token/model/use-community-display';
import { useCommunityContext } from '@/features/switch-community/model/use-community-context';
import type { ConnectPillMenu } from '@/widgets/connect-pill/connect-pill-menus';

const loadMenus = () => import('@/widgets/connect-pill/connect-pill-menus');

// Overlay code (Radix Popover/Dialog, Floating UI, balance rows) is deferred
// until the first menu interaction. Trigger buttons stay in the eager shell.
const ConnectPillMenus = lazy(async () => {
  const module = await loadMenus();
  return { default: module.ConnectPillMenus };
});

const preloadMenus = () => {
  void loadMenus();
};

/**
 * The single top-right entry for account, community and identity (ADR-0003 §1).
 * It renders exactly three states — disconnected / wrong chain / connected pill —
 * and the connected pill has two independent triggers.
 */
export function ConnectPill() {
  const location = useLocation();
  const isCompactViewport = useMediaQuery('(max-width: 479px)');
  const compactChip = location.pathname !== '/' && isCompactViewport;
  const wallet = useWalletConnection();
  const { symbol, switchSymbol } = useCommunityContext();
  const chipSymbol = useCommunityDisplay(symbol).symbol;
  const identity = useMemberIdentity();
  const [openMenu, setOpenMenu] = useState<ConnectPillMenu | null>(null);
  const [communityAnchor, setCommunityAnchor] = useState<HTMLButtonElement | null>(null);
  const [walletAnchor, setWalletAnchor] = useState<HTMLButtonElement | null>(null);

  if (!wallet.isConnected) {
    return <ConnectWalletButton variant="secondary" className="rounded-full" />;
  }
  if (wallet.isWrongChain) return <WrongNetworkButton />;
  if (wallet.address === undefined) return null;
  const address = wallet.address;

  const identityLabel =
    identity.status === 'loading'
      ? copy.wallet.identityReading
      : identity.selected !== null
        ? (identity.selected.name ?? copy.common.unknown)
        : identity.status === 'unconfigured'
          ? copy.wallet.identityNotDeployed
          : identity.status === 'empty'
            ? copy.wallet.noIdentity
            : copy.wallet.noIdentitySelected;

  const closeMenu = () => {
    const activeTrigger = openMenu === 'wallet' ? walletAnchor : communityAnchor;
    setOpenMenu(null);
    activeTrigger?.focus();
  };

  const toggleMenu = (menu: ConnectPillMenu) => {
    preloadMenus();
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  return (
    <div className="inline-flex h-12 max-w-full min-w-0 items-stretch overflow-hidden rounded-2xl border border-line bg-surface/85 shadow-sm backdrop-blur">
      <button
        ref={setCommunityAnchor}
        type="button"
        onClick={() => toggleMenu('community')}
        onPointerEnter={preloadMenus}
        onFocus={preloadMenus}
        aria-label={copy.community.chipAria(chipSymbol)}
        aria-expanded={openMenu === 'community'}
        aria-haspopup="dialog"
        title={copy.community.menuTitle}
        className="flex min-w-0 items-center gap-1 pl-2 pr-1.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 md:pl-3 md:pr-2"
      >
        {compactChip ? (
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft font-mono text-xs font-semibold text-brand-strong"
          >
            {chipSymbol.slice(0, 1)}
          </span>
        ) : (
          <span className="max-w-[96px] truncate font-mono text-[13px] font-semibold text-foreground">
            {chipSymbol}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
      </button>

      <span className="my-2 w-px shrink-0 bg-line" aria-hidden="true" />

      <button
        ref={setWalletAnchor}
        type="button"
        onClick={() => toggleMenu('wallet')}
        onPointerEnter={preloadMenus}
        onFocus={preloadMenus}
        aria-label={copy.wallet.walletMenuAria}
        aria-expanded={openMenu === 'wallet'}
        aria-haspopup="dialog"
        className="grid w-[108px] grid-cols-[minmax(0,1fr)_14px] grid-rows-2 items-center gap-x-1 px-2 py-1.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 min-[390px]:w-[132px] md:w-[176px] md:gap-x-1.5 md:px-2.5"
      >
        <span className="truncate font-mono text-[13px] leading-4 text-foreground">
          {shortenAddress(address)}
        </span>
        <span className="truncate text-[11px] leading-4 text-muted">{identityLabel}</span>
        <ChevronDown
          className="col-start-2 row-span-2 row-start-1 h-3.5 w-3.5 justify-self-end text-muted"
          aria-hidden="true"
        />
      </button>

      {openMenu !== null ? (
        <Suspense fallback={null}>
          <ConnectPillMenus
            openMenu={openMenu}
            onClose={closeMenu}
            communityAnchor={communityAnchor}
            walletAnchor={walletAnchor}
            symbol={symbol}
            onSwitchSymbol={switchSymbol}
            address={address}
            identity={identity}
            onDisconnect={wallet.disconnect}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
