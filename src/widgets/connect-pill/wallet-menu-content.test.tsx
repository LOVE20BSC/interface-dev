import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletMenuContent } from '@/widgets/connect-pill/wallet-menu-content';
import type {
  MemberIdentity,
  MemberIdentityState,
  MemberIdentityStatus,
} from '@/entities/member-identity/model/use-member-identity';
import { useCommunityToken } from '@/entities/community-token/model/use-community-token';

vi.mock('@/entities/community-token/model/use-community-token', () => ({
  useCommunityToken: vi.fn(),
}));

vi.mock('@/entities/community-token/model/use-community-balance', () => ({
  useCommunityBalance: () => ({ status: 'ready', value: 1n, decimals: 18 }),
  useNativeBalance: () => ({
    status: 'ready',
    value: 1n,
    decimals: 18,
    symbol: 'ETH',
  }),
}));

const token = vi.mocked(useCommunityToken);

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

const SELECTED: MemberIdentity = { tokenId: 2n, name: 'Testdev-member-1' };

function identityState(
  status: MemberIdentityStatus,
  selected: MemberIdentity | null = null,
): MemberIdentityState {
  return {
    status,
    identities: selected === null ? [] : [selected],
    balance: selected === null ? 0n : 1n,
    selected,
    isInvalidated: false,
    isTruncated: false,
    memberNftAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    select: vi.fn(),
    clear: vi.fn(),
    refetch: vi.fn(),
  };
}

function renderMenu(identity: MemberIdentityState) {
  return render(
    <MemoryRouter>
      <WalletMenuContent
        address={ADDRESS}
        symbol="TestLOVE20"
        identity={identity}
        onDisconnect={vi.fn()}
        onNavigate={vi.fn()}
      />
    </MemoryRouter>,
  );
}

/** The identity row is the only row that can become a link. */
function identityLinks() {
  return screen.queryAllByRole('link');
}

beforeEach(() => {
  token.mockReturnValue({
    status: 'ready',
    address: '0x8aCd85898458400f7Db866d53FCFF6f0D49741FF',
    name: 'TestLOVE20@TestWETH',
    symbol: 'TestLOVE20',
    decimals: 18,
    isMetadataLoading: false,
    metadataError: false,
    refetch: () => {},
  });
});

describe('WalletMenuContent identity row', () => {
  it('loading: says 读取中… and offers no action, even with a cached selection', () => {
    renderMenu(identityState('loading', SELECTED));

    expect(screen.getByText('读取中…')).toBeInTheDocument();
    expect(screen.queryByText('Testdev-member-1')).not.toBeInTheDocument();
    expect(screen.queryByText('NFT #2')).not.toBeInTheDocument();
    expect(screen.queryByText('切换')).not.toBeInTheDocument();
    expect(identityLinks()).toHaveLength(0);
  });

  it('error: says 身份 NFT 暂时读不到, never 切换 or an NFT id', () => {
    renderMenu(identityState('error', SELECTED));

    expect(screen.getByText('身份 NFT 暂时读不到')).toBeInTheDocument();
    expect(screen.getByText('网络可能不稳，身份 NFT 没有变化。')).toBeInTheDocument();
    expect(screen.queryByText('Testdev-member-1')).not.toBeInTheDocument();
    expect(screen.queryByText('NFT #2')).not.toBeInTheDocument();
    expect(screen.queryByText('切换')).not.toBeInTheDocument();
    expect(identityLinks()).toHaveLength(0);
  });

  it('unconfigured: says the environment has no identity NFT contract and offers no action', () => {
    renderMenu(identityState('unconfigured', SELECTED));

    expect(screen.getByText('这个环境还没有部署身份 NFT 合约')).toBeInTheDocument();
    expect(screen.queryByText('Testdev-member-1')).not.toBeInTheDocument();
    expect(screen.queryByText('NFT #2')).not.toBeInTheDocument();
    expect(screen.queryByText('切换')).not.toBeInTheDocument();
    expect(identityLinks()).toHaveLength(0);
  });

  it('ready: shows the name, NFT #id and the 切换 link', () => {
    renderMenu(identityState('ready', SELECTED));

    expect(screen.getByText('Testdev-member-1')).toBeInTheDocument();
    expect(screen.getByText('NFT #2')).toBeInTheDocument();
    expect(screen.getByText('切换')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/my-nft');
  });

  it('empty: keeps the no-identity row and the mint CTA', () => {
    renderMenu(identityState('empty'));

    expect(screen.getByText('未关联 NFT')).toBeInTheDocument();
    expect(screen.getByText('去设置')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/mint');
  });

  it('needs-selection: keeps the select CTA and never shows a cached id', () => {
    renderMenu(identityState('needs-selection'));

    expect(screen.getByText('未选择身份 NFT')).toBeInTheDocument();
    expect(screen.getByText('去设置')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/my-nft');
    expect(screen.queryByText(/^NFT #/)).not.toBeInTheDocument();
  });
});

describe('WalletMenuContent account rows', () => {
  it('shows the wallet address, and the network right under it (owner 2026-11-19)', () => {
    renderMenu(identityState('ready', SELECTED));

    const address = screen.getByTestId('wallet-menu-address');
    expect(address).toBeVisible();
    // Compact dropdown (owner 2026-11-19): the visible text is always the middle-
    // elided short form (`0x1234…abcd`), never the full 40 hex chars; the full
    // address stays in title / aria-label — that is also exactly what gets copied.
    expect(address).toHaveAttribute('title', ADDRESS);
    expect(address).toHaveTextContent(/^0x[0-9a-f]{4}…[0-9a-f]{4}$/i);
    expect(address).toHaveAccessibleName('复制地址：钱包地址');

    // Moved out of /me (账户 section): the 网络 row now lives in this dropdown.
    const network = screen.getByTestId('wallet-menu-network');
    expect(network).toBeVisible();
    expect(network).toHaveTextContent('网络');
    expect(network).toHaveTextContent('Anvil Local · chain 31337');
  });

  it('keeps the balances, native first, and the 断开连接 action', () => {
    renderMenu(identityState('ready', SELECTED));

    const nativeRow = screen.getByText('ETH 余额');
    const tokenRow = screen.getByText('TestLOVE20 余额');
    expect(nativeRow).toBeInTheDocument();
    expect(tokenRow).toBeInTheDocument();
    // owner 2026-11-19: the native balance row now sits above the community token row.
    expect(nativeRow.compareDocumentPosition(tokenRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    // owner 2026-11-19: the 「{NATIVE} 用于支付网络手续费」 line was dropped.
    expect(screen.queryByText(/用于支付网络手续费/)).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: '断开连接' })).toBeInTheDocument();
  });
});
