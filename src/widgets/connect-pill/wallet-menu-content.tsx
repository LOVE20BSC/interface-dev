import { Check, Copy, LogOut } from '@/shared/ui/icons';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy';
import { copyText } from '@/shared/lib/clipboard';
import { formatTokenAmount, UNKNOWN } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
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
  const [copied, setCopied] = useState(false);
  const token = useCommunityToken(symbol);
  const tokenBalance = useCommunityBalance(token.address, token.decimals);
  const nativeBalance = useNativeBalance(NETWORK.nativeCurrency.symbol);

  const handleCopy = async () => {
    const ok = await copyText(address);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 2000);
  };

  const identitySelected = identity.selected !== null;
  const identityTitle = identitySelected
    ? identity.selected.name
    : identity.status === 'loading'
      ? copy.wallet.identityReading
      : identity.status === 'unconfigured'
        ? copy.wallet.identityNotDeployed
        : identity.status === 'empty'
          ? copy.wallet.noIdentity
          : copy.wallet.noIdentitySelected;

  const identitySubtitle =
    identitySelected && identity.selected !== null
      ? copy.identity.memberId(identity.selected.tokenId.toString())
      : null;

  const identityAction = identitySelected
    ? copy.wallet.viewNft
    : identity.status === 'empty'
      ? copy.wallet.goMint
      : copy.wallet.goSelect;

  const identityHref = identity.status === 'empty' && !identitySelected ? '/mint' : '/my-nft';

  return (
    <div>
      <div className="flex items-start justify-between gap-3 px-2.5 pt-1">
        <span className="text-xs font-medium text-muted">{copy.wallet.addressLabel}</span>
        <Button
          size="sm"
          variant="ghost"
          className="-my-1 -mr-1 h-8 px-2 text-xs"
          onClick={() => {
            void handleCopy();
          }}
          leadingIcon={
            copied ? (
              <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )
          }
          aria-label={copied ? copy.wallet.copiedAddressAria : copy.wallet.copyAddressAria}
        >
          {copied ? copy.common.copied : copy.common.copy}
        </Button>
      </div>
      <p className="mt-1 break-all px-2.5 font-mono text-xs leading-5 text-foreground">{address}</p>

      <Separator className="my-2" />

      <Link
        to={identityHref}
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted">{copy.wallet.identityLabel}</p>
          <p
            className={cn(
              'truncate text-sm font-medium',
              identitySelected ? 'text-foreground' : 'text-muted',
            )}
          >
            {identityTitle}
          </p>
          {identitySubtitle !== null ? (
            <p className="font-mono text-[11px] text-muted">{identitySubtitle}</p>
          ) : null}
        </div>
        {identity.status === 'loading' ? (
          <Skeleton className="h-3 w-12" />
        ) : (
          <Badge tone={identitySelected ? 'brand' : 'neutral'}>{identityAction}</Badge>
        )}
      </Link>

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
        className="w-full justify-start text-danger hover:bg-danger-soft hover:text-danger"
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
