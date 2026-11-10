import type { MemberIdentityState } from '@/entities/member-identity/model/use-member-identity';
import { copy } from '@/shared/config/copy';
import { CommunityMenuContent } from '@/widgets/connect-pill/community-menu-content';
import { MenuLayer } from '@/widgets/connect-pill/menu-layer';
import { WalletMenuContent } from '@/widgets/connect-pill/wallet-menu-content';

export type ConnectPillMenu = 'community' | 'wallet';

export interface ConnectPillMenusProps {
  readonly openMenu: ConnectPillMenu;
  readonly onClose: () => void;
  readonly communityAnchor: HTMLElement | null;
  readonly walletAnchor: HTMLElement | null;
  readonly symbol: string;
  readonly onSwitchSymbol: (symbol: string) => void;
  readonly address: `0x${string}`;
  readonly identity: MemberIdentityState;
  readonly onDisconnect: () => void;
}

/**
 * Lazy overlay graph: Radix Popover/Dialog, Floating UI, recent-community cache
 * reads and balance rows all load on first menu interaction, not on first paint.
 */
export function ConnectPillMenus({
  openMenu,
  onClose,
  communityAnchor,
  walletAnchor,
  symbol,
  onSwitchSymbol,
  address,
  identity,
  onDisconnect,
}: ConnectPillMenusProps) {
  if (openMenu === 'community') {
    return (
      <MenuLayer
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={copy.community.menuTitle}
        description={copy.community.menuDescription}
        anchor={communityAnchor}
        align="start"
      >
        <CommunityMenuContent
          currentSymbol={symbol}
          onSwitch={onSwitchSymbol}
          onNavigate={onClose}
        />
      </MenuLayer>
    );
  }

  return (
    <MenuLayer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.wallet.menuTitle}
      description={copy.wallet.menuDescription}
      anchor={walletAnchor}
    >
      <WalletMenuContent
        address={address}
        symbol={symbol}
        identity={identity}
        onDisconnect={onDisconnect}
        onNavigate={onClose}
      />
    </MenuLayer>
  );
}
