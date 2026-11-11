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
        address="0x1234567890abcdef1234567890abcdef12345678"
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
    expect(screen.queryByText('查看NFT')).not.toBeInTheDocument();
    expect(identityLinks()).toHaveLength(0);
  });

  it('error: says 身份 NFT 暂时读不到, never 查看NFT or an NFT id', () => {
    renderMenu(identityState('error', SELECTED));

    expect(screen.getByText('身份 NFT 暂时读不到')).toBeInTheDocument();
    expect(screen.getByText('网络可能不稳，身份 NFT 没有变化。')).toBeInTheDocument();
    expect(screen.queryByText('Testdev-member-1')).not.toBeInTheDocument();
    expect(screen.queryByText('NFT #2')).not.toBeInTheDocument();
    expect(screen.queryByText('查看NFT')).not.toBeInTheDocument();
    expect(identityLinks()).toHaveLength(0);
  });

  it('unconfigured: says the environment has no identity NFT contract and offers no action', () => {
    renderMenu(identityState('unconfigured', SELECTED));

    expect(screen.getByText('这个环境还没有部署身份 NFT 合约')).toBeInTheDocument();
    expect(screen.queryByText('Testdev-member-1')).not.toBeInTheDocument();
    expect(screen.queryByText('NFT #2')).not.toBeInTheDocument();
    expect(screen.queryByText('查看NFT')).not.toBeInTheDocument();
    expect(identityLinks()).toHaveLength(0);
  });

  it('ready: shows the name, NFT #id and the 查看NFT link', () => {
    renderMenu(identityState('ready', SELECTED));

    expect(screen.getByText('Testdev-member-1')).toBeInTheDocument();
    expect(screen.getByText('NFT #2')).toBeInTheDocument();
    expect(screen.getByText('查看NFT')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/my-nft');
  });

  it('empty: keeps the no-identity row and the mint CTA', () => {
    renderMenu(identityState('empty'));

    expect(screen.getByText('未关联 NFT')).toBeInTheDocument();
    expect(screen.getByText('去铸造')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/mint');
  });

  it('needs-selection: keeps the select CTA and never shows a cached id', () => {
    renderMenu(identityState('needs-selection'));

    expect(screen.getByText('未选择身份 NFT')).toBeInTheDocument();
    expect(screen.getByText('去选择')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/my-nft');
    expect(screen.queryByText(/^NFT #/)).not.toBeInTheDocument();
  });
});
