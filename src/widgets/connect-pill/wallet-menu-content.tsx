import { LogOut } from '@/shared/ui/icons';
import { Link } from 'react-router-dom';
import { NETWORK } from '@/config/networks';
import { copy } from '@/shared/config/copy-pages';
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
  /** 第一行左侧：身份 NFT / 未关联 NFT / 未选择身份 NFT / 读取中… 等。 */
  readonly label: string;
  /** 第一行右侧动作徽标：切换 / 去设置；不可操作时为 null。 */
  readonly action: string | null;
  readonly href: string | null;
  readonly isReady: boolean;
  /** 第二行左侧：NFT 编号（仅已选中身份时）。 */
  readonly secondary: string | null;
  /** 第二行右侧：NFT 名称。 */
  readonly primary: string | null;
}

/**
 * 钱包弹层身份区（owner 2026-11-19 重排）：
 *
 * - 已选中：第一行「身份 NFT」+ 右侧「切换」；第二行左侧 `#id`、右侧名称；
 * - 未关联 / 未选择：只一行，左侧状态、右侧「去设置」；
 * - 读取中 / 读不到 / 未部署：只一行状态，不给入口。
 *
 * 行内容只取 `useMemberIdentity()` 的 `status`：缓存的选择不是事实，未就绪时
 * 不得渲染名称、`#id` 或前往 NFT 页的入口（ADR-0003 §2）。
 */
function identityRow(identity: MemberIdentityState): IdentityRow {
  switch (identity.status) {
    case 'ready':
      if (identity.selected === null) {
        return {
          label: copy.wallet.noIdentitySelected,
          action: copy.wallet.goSelect,
          href: '/my-nft',
          isReady: false,
          secondary: null,
          primary: null,
        };
      }
      return {
        label: copy.wallet.identityLabel,
        action: copy.wallet.viewNft,
        href: '/my-nft',
        isReady: true,
        secondary: copy.identity.memberId(identity.selected.tokenId.toString()),
        primary: identity.selected.name ?? copy.common.unknown,
      };
    case 'loading':
      return {
        label: copy.common.loading,
        action: null,
        href: null,
        isReady: false,
        secondary: null,
        primary: null,
      };
    case 'error':
      return {
        label: copy.wallet.identityUnavailable,
        action: null,
        href: null,
        isReady: false,
        secondary: null,
        primary: copy.wallet.identityUnavailableBody,
      };
    case 'unconfigured':
      return {
        label: copy.wallet.identityUnconfigured,
        action: null,
        href: null,
        isReady: false,
        secondary: null,
        primary: null,
      };
    case 'empty':
      return {
        label: copy.wallet.noIdentity,
        action: copy.wallet.goMint,
        href: '/mint',
        isReady: false,
        secondary: null,
        primary: null,
      };
    case 'disconnected':
    case 'needs-selection':
      return {
        label: copy.wallet.noIdentitySelected,
        action: identity.status === 'needs-selection' ? copy.wallet.goSelect : null,
        href: identity.status === 'needs-selection' ? '/my-nft' : null,
        isReady: false,
        secondary: null,
        primary: null,
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
      'hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong',
  );
  const rowBody = (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted">{row.label}</span>
        {row.action !== null ? (
          <Badge tone={row.isReady ? 'brand' : 'neutral'}>{row.action}</Badge>
        ) : null}
      </div>
      {row.isReady ? (
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="shrink-0 font-mono text-[11px] leading-4 text-muted">
            {row.secondary}
          </span>
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {row.primary}
          </span>
        </div>
      ) : row.primary !== null ? (
        <p className="mt-1 text-[11px] leading-4 text-muted">{row.primary}</p>
      ) : null}
    </div>
  );

  return (
    <div>
      {/* 地址行：标签左对齐、地址右对齐；宽度够就完整显示，不够才中间省略 */}
      <div className="flex items-center justify-between gap-3 px-2.5 pt-1">
        <span className="shrink-0 text-xs font-medium text-muted">{copy.wallet.addressLabel}</span>
        <CopyableAddress
          address={address}
          label={copy.wallet.addressLabel}
          display="auto"
          testId="wallet-menu-address"
          className="min-w-0 justify-end text-foreground"
        />
      </div>
      {/* 网络行：2026-11-19 从 /me 的「账户」section 挪进来 */}
      <div
        className="mt-2 flex items-center justify-between gap-3 px-2.5"
        data-testid="wallet-menu-network"
      >
        <span className="text-xs text-muted">{copy.me.networkLabel}</span>
        <span className="text-xs font-medium text-foreground">
          {copy.me.networkValue(NETWORK.name, NETWORK.chainId)}
        </span>
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
        {/* 余额顺序：原生币在前、社区代币在后（owner 2026-11-19） */}
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
      </dl>

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
