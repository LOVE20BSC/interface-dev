import { ChevronDown, Loader2 } from '@/shared/ui/icons';
import { lazy, Suspense, useState } from 'react';
import { copy } from '@/shared/config/copy';
import { shortenAddress } from '@/shared/lib/format';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import { useMemberIdentity } from '@/entities/member-identity/model/use-member-identity';
import { ConnectWalletButton } from '@/features/connect-wallet/ui/connect-wallet-button';
import { WrongNetworkButton } from '@/features/connect-wallet/ui/wrong-network-button';
import { useWalletConnection } from '@/features/connect-wallet/model/use-wallet-connection';
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
  const wallet = useWalletConnection();
  const { symbol, switchSymbol } = useCommunityContext();
  const token = useCommunityToken(symbol);
  const identity = useMemberIdentity();
  const [openMenu, setOpenMenu] = useState<ConnectPillMenu | null>(null);
  const [communityAnchor, setCommunityAnchor] = useState<HTMLButtonElement | null>(null);
  const [walletAnchor, setWalletAnchor] = useState<HTMLButtonElement | null>(null);

  if (!wallet.isConnected) return <ConnectWalletButton />;
  if (wallet.isWrongChain) return <WrongNetworkButton />;
  if (wallet.address === undefined) return null;
  const address = wallet.address;

  const identityLabel =
    identity.status === 'loading'
      ? copy.wallet.identityReading
      : identity.selected !== null
        ? identity.selected.name
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
    <div className="inline-flex h-12 items-stretch overflow-hidden rounded-2xl border border-line bg-surface/85 shadow-sm backdrop-blur">
      <button
        ref={setCommunityAnchor}
        type="button"
        onClick={() => toggleMenu('community')}
        onPointerEnter={preloadMenus}
        onFocus={preloadMenus}
        aria-label={copy.community.chipAria(token.symbol)}
        aria-expanded={openMenu === 'community'}
        aria-haspopup="dialog"
        title={copy.community.menuTitle}
        className="flex min-w-0 items-center gap-1 pl-3 pr-2 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
      >
        <span className="max-w-[96px] truncate font-mono text-[13px] font-semibold text-foreground">
          {token.symbol}
        </span>
        {token.isMetadataLoading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
        )}
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
        className="grid min-w-[132px] grid-cols-[minmax(0,1fr)_14px] grid-rows-2 items-center gap-x-1.5 px-2.5 py-1.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
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
            token={token}
            identity={identity}
            onDisconnect={wallet.disconnect}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
