import { LogOut } from '@/shared/ui/icons';
import { Link } from 'react-router-dom';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy';
import { formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { CopyableAddress } from '@/shared/ui/copyable-address';
import { Separator } from '@/shared/ui/separator';
import { Skeleton } from '@/shared/ui/skeleton';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';
import {
  useCommunityBalance,
  useNativeBalance,
} from '@/entities/community-token/model/use-community-balance';
import type { MemberIdentityState } from '@/entities/member-identity/model/use-member-identity';

export interface WalletMenuContentProps {
  readonly address: `0x${string}`;
  readonly symbol: string;
  readonly identity: MemberIdentityState;
  readonly onDisconnect: () => void;
  readonly onNavigate: () => void;
}

interface IdentityRow {
  readonly title: string;
  readonly subtitle: string | null;
  readonly action: string | null;
  readonly href: string | null;
  readonly isReady: boolean;
}

/**
 * One row, derived only from the revalidated state (ADR-0003 §2). A cached
 * selection (`identity.selected`) is never a fact on its own: while loading,
 * error or unconfigured it must not leak a name, an id or a link to the NFT
 * page.
 */
function identityRow(identity: MemberIdentityState): IdentityRow {
  switch (identity.status) {
    case 'ready':
      if (identity.selected === null) {
        return {
          title: copy.wallet.noIdentitySelected,
          subtitle: null,
          action: copy.wallet.goSelect,
          href: '/my-nft',
          isReady: false,
        };
      }
      return {
        title: identity.selected.name ?? copy.common.unknown,
        subtitle: copy.identity.memberId(identity.selected.tokenId.toString()),
        action: copy.wallet.viewNft,
        href: '/my-nft',
        isReady: true,
      };
    case 'loading':
      return {
        title: copy.common.loading,
        subtitle: null,
        action: null,
        href: null,
        isReady: false,
      };
    case 'error':
      return {
        title: copy.wallet.identityUnavailable,
        subtitle: copy.wallet.identityUnavailableBody,
        action: null,
        href: null,
        isReady: false,
      };
    case 'unconfigured':
      return {
        title: copy.wallet.identityUnconfigured,
        subtitle: null,
        action: null,
        href: null,
        isReady: false,
      };
    case 'empty':
      return {
        title: copy.wallet.noIdentity,
        subtitle: null,
        action: copy.wallet.goMint,
        href: '/mint',
        isReady: false,
      };
    case 'disconnected':
    case 'needs-selection':
      return {
        title: copy.wallet.noIdentitySelected,
        subtitle: null,
        action: identity.status === 'needs-selection' ? copy.wallet.goSelect : null,
        href: identity.status === 'needs-selection' ? '/my-nft' : null,
        isReady: false,
      };
  }
}

function BalanceValue({
  status,
  display,
}: {
  readonly status: 'loading' | 'ready' | 'unavailable' | 'error';
  readonly display: string;
}) {
  if (status === 'loading') return <Skeleton className="h-4 w-16" />;
  if (status === 'unavailable') {
    return <span className="text-xs text-muted">{copy.common.notConfigured}</span>;
  }
  if (status === 'error') {
    return <span className="text-xs text-muted">{copy.common.readFailed}</span>;
  }
  return <span className="font-mono text-sm font-medium text-foreground">{display}</span>;
}

export function WalletMenuContent({
  address,
  symbol,
  identity,
  onDisconnect,
  onNavigate,
}: WalletMenuContentProps) {
  const token = useCommunityToken(symbol);
  const tokenBalance = useCommunityBalance(token.address, token.decimals);
  const nativeBalance = useNativeBalance(NETWORK.nativeCurrency.symbol);

  const row = identityRow(identity);
  const rowClass = cn(
    'flex items-center gap-3 rounded-xl px-2.5 py-2.5',
    row.href !== null &&
      'hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
  );
  const rowBody = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted">{copy.wallet.identityLabel}</p>
        <p
          className={cn(
            'truncate text-sm font-medium',
            row.isReady ? 'text-foreground' : 'text-muted',
          )}
        >
          {row.title}
        </p>
        {row.subtitle !== null ? (
          <p
            className={cn(
              'text-[11px] leading-4 text-muted',
              row.isReady ? 'font-mono' : undefined,
            )}
          >
            {row.subtitle}
          </p>
        ) : null}
      </div>
      {row.action !== null ? (
        <Badge tone={row.isReady ? 'brand' : 'neutral'}>{row.action}</Badge>
      ) : null}
    </>
  );

  return (
    <div>
      <div className="px-2.5 pt-1">
        <span className="text-xs font-medium text-muted">{copy.wallet.addressLabel}</span>
        <CopyableAddress
          address={address}
          label={copy.wallet.addressLabel}
          display="full"
          testId="wallet-menu-address"
          className="mt-1 text-foreground"
        />
      </div>

      <Separator className="my-2" />

      {row.href !== null ? (
        <Link to={row.href} onClick={onNavigate} className={rowClass}>
          {rowBody}
        </Link>
      ) : (
        <div className={rowClass} aria-busy={identity.status === 'loading'}>
          {rowBody}
        </div>
      )}

      <Separator className="my-2" />

      <dl className="space-y-2.5 px-2.5 py-1">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-xs text-muted">{copy.wallet.tokenBalanceLabel(token.symbol)}</dt>
          <dd>
            <BalanceValue
              status={
                tokenBalance.status === 'ready'
                  ? 'ready'
                  : tokenBalance.status === 'loading'
                    ? 'loading'
                    : tokenBalance.status === 'unconfigured'
                      ? 'unavailable'
                      : 'error'
              }
              display={
                tokenBalance.value !== undefined && tokenBalance.decimals !== undefined
                  ? formatTokenAmount(tokenBalance.value, tokenBalance.decimals)
                  : UNKNOWN
              }
            />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-xs text-muted">
            {copy.wallet.nativeBalanceLabel(nativeBalance.symbol)}
          </dt>
          <dd>
            <BalanceValue
              status={
                nativeBalance.status === 'ready'
                  ? 'ready'
                  : nativeBalance.status === 'loading'
                    ? 'loading'
                    : 'error'
              }
              display={
                nativeBalance.value !== undefined && nativeBalance.decimals !== undefined
                  ? formatTokenAmount(nativeBalance.value, nativeBalance.decimals)
                  : UNKNOWN
              }
            />
          </dd>
        </div>
      </dl>
      <p className="px-2.5 pt-1 text-[11px] text-muted">{copy.wallet.nativeFeeNote}</p>

      <Separator className="my-2" />

      <Button
        variant="ghost"
        className="w-full justify-start text-danger-strong hover:bg-danger-soft hover:text-danger-strong"
        leadingIcon={<LogOut className="h-4 w-4" aria-hidden="true" />}
        onClick={() => {
          onNavigate();
          onDisconnect();
        }}
      >
        {copy.wallet.disconnect}
      </Button>

      <p className="mt-2 border-t border-line px-2.5 pt-2.5 text-[11px] leading-5 text-muted">
        {copy.wallet.footer}
      </p>
    </div>
  );
}
